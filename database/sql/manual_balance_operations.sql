-- REVIEW ONLY: no deployment/remote SQL authorized. Requires order_fulfilment.sql + order_integrations.sql.
-- Manual delivery requests; collection balances verified against actual funds before handover.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF current_user<>'postgres'THEN RAISE EXCEPTION 'Run as postgres';END IF;END$$;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS balance_revision bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.track_balance_revision()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF ROW(NEW.order_code,NEW.customer_email,NEW.fulfilment_method,NEW.payment_status,NEW.deposit_due_cents,NEW.final_total_cents,NEW.balance_due_cents,NEW.balance_paid_at,NEW.balance_token_hash,NEW.ready_at,NEW.fulfilled_at,NEW.quantity,NEW.customer_name,NEW.batch_id)IS DISTINCT FROM ROW(OLD.order_code,OLD.customer_email,OLD.fulfilment_method,OLD.payment_status,OLD.deposit_due_cents,OLD.final_total_cents,OLD.balance_due_cents,OLD.balance_paid_at,OLD.balance_token_hash,OLD.ready_at,OLD.fulfilled_at,OLD.quantity,OLD.customer_name,OLD.batch_id)THEN NEW.balance_revision:=OLD.balance_revision+1;ELSE NEW.balance_revision:=OLD.balance_revision;END IF;RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS balance_revision ON public.orders;
CREATE TRIGGER balance_revision BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.track_balance_revision();
CREATE TABLE IF NOT EXISTS public.delivery_balance_runs(request_id uuid PRIMARY KEY,actor text NOT NULL,manifest jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.delivery_balance_items(request_id uuid NOT NULL REFERENCES public.delivery_balance_runs(request_id),order_id uuid NOT NULL REFERENCES public.orders(id),job_id uuid REFERENCES public.order_integration_jobs(id) ON DELETE SET NULL,PRIMARY KEY(request_id,order_id));
ALTER TABLE public.delivery_balance_runs ENABLE ROW LEVEL SECURITY;ALTER TABLE public.delivery_balance_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_balance_runs,public.delivery_balance_items FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX IF NOT EXISTS manual_delivery_orders ON public.orders(created_at DESC,id DESC)WHERE fulfilment_method='delivery'AND payment_status='VERIFIED'AND fulfilled_at IS NULL;
CREATE INDEX IF NOT EXISTS manual_collection_orders ON public.orders(created_at DESC,id DESC)WHERE fulfilment_method='collection'AND payment_status='VERIFIED'AND fulfilled_at IS NULL;
CREATE INDEX IF NOT EXISTS manual_balance_active ON public.order_integration_jobs(order_id,status)WHERE kind='email'AND event='balance_requested';
CREATE INDEX IF NOT EXISTS order_balance_verifications ON public.order_activity(order_id,created_at DESC,id DESC)WHERE action='balance_paid';
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
 -- Legacy callers retain their existing behavior. Only the new guarded RPC transaction suppresses automatic balance mail.
 IF ev IN ('order_received','deposit_received','balance_requested','balance_paid','ready')AND NOT(coalesce(current_setting('samasama.manual_balance',true),'')='on'AND(ev='balance_requested'OR(ev='balance_paid'AND NEW.fulfilment_method='collection')))THEN
   INSERT INTO public.order_integration_jobs(order_id,kind,event,payload) VALUES(NEW.id,'email',ev,snapshot);
 END IF;
 INSERT INTO public.order_integration_jobs(order_id,kind,event) VALUES(NEW.id,'crm',ev);
 RETURN NEW;
END $$;
ALTER FUNCTION public.enqueue_order_integrations() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enqueue_order_integrations() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS order_integrations ON public.orders;
CREATE TRIGGER order_integrations AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_integrations();

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
DO $$DECLARE ns text;col text;BEGIN
 SELECT n.nspname INTO ns FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm';
 FOREACH col IN ARRAY ARRAY['order_code','customer_name','customer_phone','customer_email']LOOP
 EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.orders USING gin (%I %I.gin_trgm_ops)','operations_search_'||col,col,ns);
 END LOOP;END$$;
CREATE OR REPLACE FUNCTION public.admin_balance_operation(p_id uuid,p_action text,p_revision bigint,p_actor text,p_amount integer DEFAULT NULL,p_reference text DEFAULT NULL,p_funds_checked boolean DEFAULT false)RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE o public.orders;n timestamptz;
BEGIN
 IF coalesce(length(btrim(p_actor)),0)NOT BETWEEN 1 AND 254 OR p_action IS NULL OR p_action NOT IN('set_total','collection_ready','collection_payment')THEN RAISE EXCEPTION 'INVALID_OPERATION';END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_id FOR UPDATE;n:=clock_timestamp();
 IF NOT FOUND OR o.payment_status<>'VERIFIED'OR o.fulfilled_at IS NOT NULL OR o.deposit_due_cents IS NULL OR o.deposit_verified_at IS NULL THEN RAISE EXCEPTION 'ORDER_UNAVAILABLE';END IF;
 IF p_action='collection_payment'AND o.balance_paid_at IS NOT NULL THEN RETURN 'already_paid';END IF;
 IF p_revision IS DISTINCT FROM o.balance_revision THEN RAISE EXCEPTION 'STALE_PREVIEW';END IF;
 IF p_action='set_total'THEN
 IF o.ready_at IS NOT NULL OR o.balance_paid_at IS NOT NULL OR p_amount IS NULL OR p_amount<o.deposit_due_cents OR p_amount>100000000 THEN RAISE EXCEPTION 'INVALID_TOTAL';END IF;
 IF EXISTS(SELECT 1 FROM public.order_integration_jobs WHERE order_id=p_id AND kind='email'AND event='balance_requested'AND status IN('processing','review'))THEN RAISE EXCEPTION 'REVIEW_EXISTING_SEND';END IF;
 IF o.final_total_cents IS NOT DISTINCT FROM p_amount AND o.balance_due_cents IS NOT DISTINCT FROM p_amount-o.deposit_due_cents THEN RETURN 'unchanged';END IF;
 PERFORM set_config('samasama.manual_balance','on',true);
 UPDATE public.orders SET final_total_cents=p_amount,balance_due_cents=p_amount-deposit_due_cents,balance_token_hash=NULL,balance_token_expires_at=NULL,balance_requested_at=NULL WHERE id=p_id;
 INSERT INTO public.order_activity(order_id,action,actor,metadata)VALUES(p_id,'final_total_confirmed',p_actor,jsonb_build_object('final_total_cents',p_amount,'balance_due_cents',p_amount-o.deposit_due_cents));
 ELSIF p_action='collection_ready'THEN
 IF o.fulfilment_method<>'collection'OR o.final_total_cents IS NULL OR o.balance_due_cents IS NULL OR o.final_total_cents<>o.deposit_due_cents::bigint+o.balance_due_cents THEN RAISE EXCEPTION 'TOTAL_REQUIRED';END IF;
 IF o.ready_at IS NOT NULL THEN RETURN 'unchanged';END IF;
 UPDATE public.orders SET ready_at=n WHERE id=p_id;
 INSERT INTO public.order_activity(order_id,action,actor,metadata)VALUES(p_id,'ready',p_actor,jsonb_build_object('balance_due_on_collection',o.balance_due_cents));
 ELSE
 IF p_funds_checked IS DISTINCT FROM true THEN RAISE EXCEPTION 'FUNDS_CHECK_REQUIRED';END IF;
 IF o.fulfilment_method<>'collection'OR o.final_total_cents IS NULL OR o.balance_due_cents IS NULL OR o.balance_due_cents<=0 OR o.final_total_cents<>o.deposit_due_cents::bigint+o.balance_due_cents OR p_amount IS DISTINCT FROM o.balance_due_cents OR coalesce(length(btrim(p_reference)),0)NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'PAYMENT_MISMATCH';END IF;
 PERFORM set_config('samasama.manual_balance','on',true);
 -- Keep the established cross-order/storage reference and exact-amount guards; actor/time are audited there.
 PERFORM public.order_operation(p_id,'balance_paid',p_actor,p_amount,p_reference,NULL);
 INSERT INTO public.order_activity(order_id,action,actor,metadata)VALUES(p_id,'collection_balance_verified',p_actor,jsonb_build_object('channel','collection_desk','funds_checked',true,'amount_cents',p_amount));
 END IF;RETURN 'saved';
END$$;
CREATE OR REPLACE FUNCTION public.queue_delivery_balances(p_request uuid,p_actor text,p_entries jsonb,p_confirmed boolean DEFAULT false)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' SET statement_timeout='15s' AS $$
DECLARE manifest jsonb;existing public.delivery_balance_runs;inserted uuid;entry record;o public.orders;job uuid;n timestamptz;ids uuid[];
BEGIN
 IF p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONFIRMATION_REQUIRED';END IF;
 IF p_request IS NULL OR coalesce(length(btrim(p_actor)),0)NOT BETWEEN 1 AND 254 OR jsonb_typeof(p_entries)IS DISTINCT FROM 'array' OR jsonb_array_length(p_entries)NOT BETWEEN 1 AND 25 OR octet_length(p_entries::text)>20000 THEN RAISE EXCEPTION 'INVALID_BATCH';END IF;
 SELECT array_agg(id ORDER BY id),jsonb_agg(jsonb_build_object('id',id,'revision',revision)ORDER BY id)INTO ids,manifest FROM jsonb_to_recordset(p_entries)e(id uuid,revision bigint);
 IF cardinality(ids)<>(SELECT count(DISTINCT id)FROM unnest(ids)id)OR array_position(ids,NULL)IS NOT NULL THEN RAISE EXCEPTION 'INVALID_BATCH';END IF;
 INSERT INTO public.delivery_balance_runs(request_id,actor,manifest)VALUES(p_request,p_actor,manifest)ON CONFLICT DO NOTHING RETURNING request_id INTO inserted;
 IF inserted IS NULL THEN
 SELECT * INTO existing FROM public.delivery_balance_runs WHERE request_id=p_request FOR UPDATE;
 IF existing.actor IS DISTINCT FROM p_actor OR existing.manifest IS DISTINCT FROM manifest THEN RAISE EXCEPTION 'REQUEST_MISMATCH';END IF;
 RETURN jsonb_build_object('status','already_queued','count',cardinality(ids));END IF;
 -- Consistent lock order across overlapping batches. No provider calls inside this transaction.
 PERFORM id FROM public.orders WHERE id=ANY(ids)ORDER BY id FOR UPDATE;
 FOR entry IN SELECT * FROM jsonb_to_recordset(p_entries)e(id uuid,revision bigint,hash text,envelope text)ORDER BY id LOOP
 SELECT * INTO o FROM public.orders WHERE id=entry.id;n:=clock_timestamp();
 IF NOT FOUND OR o.balance_revision IS DISTINCT FROM entry.revision OR o.fulfilment_method<>'delivery'OR o.payment_status<>'VERIFIED'OR o.deposit_verified_at IS NULL OR o.deposit_due_cents IS NULL OR o.final_total_cents IS NULL OR o.balance_due_cents IS NULL OR o.balance_due_cents<=0 OR o.final_total_cents<>o.deposit_due_cents::bigint+o.balance_due_cents OR o.balance_paid_at IS NOT NULL OR o.fulfilled_at IS NOT NULL OR o.ready_at IS NOT NULL OR coalesce(o.customer_email,'')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'THEN RAISE EXCEPTION 'STALE_PREVIEW';END IF;
 IF o.balance_token_hash IS NOT NULL AND o.balance_token_expires_at>n THEN RAISE EXCEPTION 'ALREADY_REQUESTED';END IF;
 IF EXISTS(SELECT 1 FROM public.order_integration_jobs WHERE order_id=o.id AND kind='email'AND event='balance_requested'AND status IN('processing','review'))THEN RAISE EXCEPTION 'REVIEW_EXISTING_SEND';END IF;
 IF coalesce(entry.hash,'')!~'^[a-f0-9]{64}$'OR coalesce(entry.envelope,'')!~'^[A-Za-z0-9_-]{123}$'THEN RAISE EXCEPTION 'INVALID_LINK';END IF;
 PERFORM set_config('samasama.manual_balance','on',true);
 UPDATE public.orders SET balance_token_hash=entry.hash,balance_token_expires_at=n+interval '30 days',balance_requested_at=n WHERE id=o.id;
 INSERT INTO public.order_integration_jobs(order_id,kind,event,payload)VALUES(o.id,'email','balance_requested',jsonb_build_object('order_code',o.order_code,'name',o.customer_name,'email',o.customer_email,'quantity',o.quantity,'deposit_cents',o.deposit_due_cents,'balance_cents',o.balance_due_cents,'total_cents',o.final_total_cents,'method','delivery','balance_hash',entry.hash,'link_envelope',entry.envelope,'manual_request',p_request))RETURNING id INTO job;
 INSERT INTO public.delivery_balance_items VALUES(p_request,o.id,job);
 INSERT INTO public.order_activity(order_id,action,actor,metadata)VALUES(o.id,'balance_request',p_actor,jsonb_build_object('final_total_cents',o.final_total_cents,'balance_due_cents',o.balance_due_cents,'manual_request',p_request));
 END LOOP;
 RETURN jsonb_build_object('status','queued','count',cardinality(ids));
END$$;
DO $$DECLARE f regprocedure;BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('track_balance_revision','enqueue_order_integrations','admin_balance_operation','queue_delivery_balances')LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
 IF f::text LIKE '%admin_balance_operation%'OR f::text LIKE '%queue_delivery_balances%'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);END IF;
 END LOOP;END$$;
COMMIT;
