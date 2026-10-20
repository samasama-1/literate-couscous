-- APPROVAL REQUIRED. Apply after order_fulfilment.sql; no backfill or external sends.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres administrator'; END IF; END $$;
-- One website timestamp preserves fulfilment timing without requiring six extra CRM fields.
-- Existing orders are not rewritten or backfilled.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfilment_status_changed_at timestamptz;
CREATE OR REPLACE FUNCTION public.order_fulfilment_stage(o public.orders) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT CASE WHEN o.payment_status='REFUNDED' THEN 'Cancelled'
 WHEN o.fulfilled_at IS NOT NULL THEN CASE WHEN o.fulfilment_method='delivery' THEN 'Delivered' ELSE 'Collected' END
 WHEN o.ready_at IS NOT NULL THEN 'Ready' WHEN o.payment_status='VERIFIED' THEN 'Preparing' ELSE 'Pending' END
$$;
CREATE OR REPLACE FUNCTION public.track_order_fulfilment_time() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.fulfilment_status_changed_at:=coalesce(NEW.fulfilled_at,NEW.ready_at,NEW.deposit_verified_at,NEW.created_at,statement_timestamp());
 ELSIF public.order_fulfilment_stage(NEW) IS DISTINCT FROM public.order_fulfilment_stage(OLD) THEN NEW.fulfilment_status_changed_at:=statement_timestamp();
 ELSE NEW.fulfilment_status_changed_at:=OLD.fulfilment_status_changed_at; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.order_fulfilment_stage(public.orders) OWNER TO postgres;
ALTER FUNCTION public.track_order_fulfilment_time() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.order_fulfilment_stage(public.orders),public.track_order_fulfilment_time() FROM PUBLIC,anon,authenticated;
-- orders already has service-only access; preserve that for the new column too.
REVOKE ALL (fulfilment_status_changed_at) ON public.orders FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS order_fulfilment_time ON public.orders;
CREATE TRIGGER order_fulfilment_time BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.track_order_fulfilment_time();
CREATE TABLE IF NOT EXISTS public.order_integration_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id),
 kind text NOT NULL CHECK(kind IN ('email','crm')), event text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','skipped','review','failed')),
 available_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz, lease_token uuid, send_started_at timestamptz, completed_at timestamptz,
 attempts integer NOT NULL DEFAULT 0, provider_id text, error_code text
);
CREATE INDEX IF NOT EXISTS order_jobs_due ON public.order_integration_jobs(available_at,id) WHERE status='queued';
CREATE INDEX IF NOT EXISTS order_jobs_order ON public.order_integration_jobs(order_id,kind,status);
ALTER TABLE public.order_integration_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_integration_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.order_integration_jobs TO service_role;
CREATE OR REPLACE FUNCTION public.enqueue_order_integrations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE ev text; snapshot jsonb;
BEGIN
 IF TG_OP='INSERT' THEN ev:='order_received';
 ELSIF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW;
 ELSIF NEW.payment_status='REFUNDED' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN ev:='refunded';
 ELSIF NEW.fulfilled_at IS NOT NULL AND OLD.fulfilled_at IS NULL THEN ev:='fulfilled';
 ELSIF NEW.ready_at IS NOT NULL AND OLD.ready_at IS NULL THEN ev:='ready';
 ELSIF NEW.balance_paid_at IS NOT NULL AND OLD.balance_paid_at IS NULL THEN ev:='balance_paid';
 ELSIF NEW.balance_token_hash IS DISTINCT FROM OLD.balance_token_hash THEN ev:='balance_requested';
 ELSIF NEW.deposit_verified_at IS NOT NULL AND OLD.deposit_verified_at IS NULL THEN ev:='deposit_received';
 ELSE ev:='order_updated'; END IF;
 -- No addresses, bank references, credentials or plaintext payment tokens in jobs.
 snapshot:=jsonb_build_object('order_code',NEW.order_code,'name',NEW.customer_name,'email',NEW.customer_email,
   'quantity',NEW.quantity,'deposit_cents',NEW.deposit_due_cents,'balance_cents',NEW.balance_due_cents,
   'total_cents',NEW.final_total_cents,'method',NEW.fulfilment_method,'balance_hash',NEW.balance_token_hash);
 IF ev IN ('order_received','deposit_received','balance_requested','balance_paid','ready') THEN
   INSERT INTO public.order_integration_jobs(order_id,kind,event,payload) VALUES(NEW.id,'email',ev,snapshot);
 END IF;
 INSERT INTO public.order_integration_jobs(order_id,kind,event) VALUES(NEW.id,'crm',ev);
 RETURN NEW;
END $$;
ALTER FUNCTION public.enqueue_order_integrations() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enqueue_order_integrations() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS order_integrations ON public.orders;
CREATE TRIGGER order_integrations AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_integrations();
-- Atomic balance-operation + encrypted link handoff. The original guarded RPC remains authoritative.
CREATE OR REPLACE FUNCTION public.order_operation_with_email(p_id uuid,p_action text,p_actor text,p_amount integer DEFAULT NULL,p_reference text DEFAULT NULL,p_hash text DEFAULT NULL,p_envelope text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_action='balance_request' AND (p_envelope IS NULL OR length(p_envelope)>2048) THEN RAISE EXCEPTION 'EMAIL_LINK_REQUIRED'; END IF;
 PERFORM public.order_operation(p_id,p_action,p_actor,p_amount,p_reference,p_hash);
 IF p_action='balance_request' THEN
   UPDATE public.order_integration_jobs SET payload=payload||jsonb_build_object('link_envelope',p_envelope)
   WHERE order_id=p_id AND kind='email' AND event='balance_requested' AND status='queued' AND payload->>'balance_hash'=p_hash;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.claim_order_jobs(p_kind text,p_limit integer DEFAULT 5)
RETURNS SETOF public.order_integration_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_kind NOT IN ('email','crm') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'INVALID_CLAIM'; END IF;
 -- Serialise only the short claim transaction. Never hold a DB lock across network calls.
 PERFORM pg_advisory_xact_lock(hashtextextended('order-integration-claim:'||p_kind,0));
 UPDATE public.order_integration_jobs SET status=CASE WHEN send_started_at IS NULL THEN 'queued' ELSE 'review' END,
  error_code='LEASE_EXPIRED',available_at=now() WHERE kind=p_kind AND status='processing' AND claimed_at<now()-interval '5 minutes';
 RETURN QUERY WITH due AS (
  SELECT j.id FROM public.order_integration_jobs j WHERE j.kind=p_kind AND j.status='queued' AND j.available_at<=now()
   AND NOT EXISTS(SELECT 1 FROM public.order_integration_jobs active WHERE active.order_id=j.order_id AND active.kind=j.kind AND active.status IN ('processing','review'))
   AND NOT EXISTS(SELECT 1 FROM public.order_integration_jobs earlier WHERE earlier.order_id=j.order_id AND earlier.kind=j.kind AND earlier.status='queued' AND (earlier.created_at,earlier.id)<(j.created_at,j.id))
  ORDER BY j.available_at,j.id LIMIT p_limit FOR UPDATE OF j SKIP LOCKED
 ) UPDATE public.order_integration_jobs j SET status='processing',claimed_at=now(),lease_token=gen_random_uuid(),attempts=attempts+1,error_code=NULL
 FROM due WHERE j.id=due.id RETURNING j.*;
END $$;
ALTER FUNCTION public.order_operation_with_email(uuid,text,text,integer,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.claim_order_jobs(text,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.order_operation_with_email(uuid,text,text,integer,text,text,text),public.claim_order_jobs(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.order_operation_with_email(uuid,text,text,integer,text,text,text),public.claim_order_jobs(text,integer) TO service_role;
COMMIT;
