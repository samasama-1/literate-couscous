-- Approved scheduler preparation; creates PAUSED jobs. Activate separately after Vault setup.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres administrator'; END IF; END $$;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname='pg_cron') THEN RAISE EXCEPTION 'Enable Supabase Cron first'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname='supabase_vault') THEN RAISE EXCEPTION 'Enable Supabase Vault first'; END IF;
END $$;
-- Hosted pg_net transport tables may be readable by other DB roles.
-- Only single-use, five-minute signatures enter them; never the Vault secret.
CREATE TABLE IF NOT EXISTS public.order_worker_dispatches (
 kind text PRIMARY KEY CHECK(kind IN ('email','crm')),request_id bigint NOT NULL,dispatched_at timestamptz NOT NULL
);
ALTER TABLE public.order_worker_dispatches ADD COLUMN IF NOT EXISTS invocation_id uuid, ADD COLUMN IF NOT EXISTS issued_at bigint, ADD COLUMN IF NOT EXISTS used_at timestamptz;
ALTER TABLE public.order_worker_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_worker_dispatches FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.dispatch_order_worker(p_kind text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE secret_value text; request_number bigint; nonce uuid; issued bigint; signature text;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('email','crm') THEN RAISE EXCEPTION 'Invalid worker kind'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('order-worker-schedule:'||p_kind,0)) THEN RETURN NULL; END IF;
 -- No duplicate network call from repeated scheduler/manual invocations within four minutes.
 IF EXISTS(SELECT 1 FROM public.order_worker_dispatches WHERE kind=p_kind AND dispatched_at>statement_timestamp()-interval '4 minutes') THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO secret_value FROM vault.decrypted_secrets WHERE name='order_worker_secret';
 IF secret_value IS NULL OR secret_value!~'^[a-fA-F0-9]{64}$' THEN RAISE EXCEPTION 'Worker secret missing or invalid in Vault'; END IF;
 nonce:=gen_random_uuid();issued:=floor(extract(epoch FROM statement_timestamp()))::bigint;
 signature:=encode(extensions.hmac(convert_to(p_kind||':'||nonce::text||':'||issued::text,'UTF8'),convert_to(secret_value,'UTF8'),'sha256'),'hex');
 SELECT net.http_post(
  url:='https://www.samasama.sg/api/internal/order-integrations?kind='||p_kind,
  headers:=jsonb_build_object('Content-Type','application/json','x-order-worker-id',nonce::text,'x-order-worker-issued',issued::text,'x-order-worker-signature',signature),
  body:='{}'::jsonb,timeout_milliseconds:=180000
 ) INTO request_number;
 INSERT INTO public.order_worker_dispatches(kind,request_id,dispatched_at,invocation_id,issued_at,used_at) VALUES(p_kind,request_number,statement_timestamp(),nonce,issued,NULL)
 ON CONFLICT(kind) DO UPDATE SET request_id=EXCLUDED.request_id,dispatched_at=EXCLUDED.dispatched_at,invocation_id=EXCLUDED.invocation_id,issued_at=EXCLUDED.issued_at,used_at=NULL;
 RETURN request_number;
EXCEPTION WHEN OTHERS THEN
 -- Do not propagate HTTP library errors, secret values or response bodies to cron logs.
 RAISE EXCEPTION 'Order worker dispatch failed; check Vault and scheduler configuration';
END $$;
ALTER FUNCTION public.dispatch_order_worker(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dispatch_order_worker(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.claim_order_worker_invocation(p_kind text,p_id uuid,p_issued bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('email','crm') OR p_issued IS NULL OR p_issued<extract(epoch FROM statement_timestamp())-300 OR p_issued>extract(epoch FROM statement_timestamp())+30 THEN RETURN false; END IF;
 UPDATE public.order_worker_dispatches SET used_at=statement_timestamp() WHERE kind=p_kind AND invocation_id=p_id AND issued_at=p_issued AND used_at IS NULL;
 RETURN FOUND;
END $$;
ALTER FUNCTION public.claim_order_worker_invocation(text,uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_order_worker_invocation(text,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_worker_invocation(text,uuid,bigint) TO service_role;
DO $$ DECLARE worker text; existing bigint; BEGIN
 FOR worker IN SELECT unnest(ARRAY['email','crm']) LOOP
  SELECT jobid INTO existing FROM cron.job WHERE jobname='samasama-order-'||worker;
  IF existing IS NULL THEN
   SELECT cron.schedule('samasama-order-'||worker,'*/5 * * * *',format('SELECT public.dispatch_order_worker(%L);',worker)) INTO existing;
   PERFORM cron.alter_job(existing,active:=false);
  END IF;
 END LOOP;
END $$;
COMMIT;
