-- REVIEW ONLY: owner approval required before production SQL or FULFILMENT_V2_ENABLED activation.
-- Requires order_fulfilment.sql and order_integrations.sql. No retrospective fees/backfill.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='45s';
DO $$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres administrator'; END IF; END $$;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS collection_access_version integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS public.order_collection_accounts(
 order_id uuid PRIMARY KEY REFERENCES public.orders(id),policy_version text NOT NULL,accepted_at timestamptz NOT NULL,
 notice_at timestamptz,pause_started_at timestamptz,paused_seconds bigint NOT NULL DEFAULT 0 CHECK(paused_seconds>=0),
 extension_days integer NOT NULL DEFAULT 0 CHECK(extension_days BETWEEN 0 AND 3650),
 discount_cents bigint NOT NULL DEFAULT 0 CHECK(discount_cents>=0),paid_cents bigint NOT NULL DEFAULT 0 CHECK(paid_cents>=0),
 stopped_at timestamptz,reviewed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.order_collection_payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.orders(id),amount_cents bigint NOT NULL CHECK(amount_cents>0),reference text NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storage_payment_reference ON public.order_collection_payments(upper(btrim(reference)));
ALTER TABLE public.order_collection_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_collection_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_collection_accounts,public.order_collection_payments FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.order_collection_accounts,public.order_collection_payments TO service_role;
CREATE OR REPLACE FUNCTION public.collection_fee_summary(p_id uuid,p_at timestamptz DEFAULT statement_timestamp()) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE a public.order_collection_accounts; o public.orders; ending timestamptz; excluded numeric; elapsed numeric; gross bigint:=0; net bigint:=0;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_id;IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 SELECT * INTO a FROM public.order_collection_accounts WHERE order_id=p_id;
 IF NOT FOUND OR o.fulfilment_method<>'collection' THEN RETURN jsonb_build_object('eligible',false,'gross_cents',0,'discount_cents',0,'paid_cents',0,'due_cents',0,'review_due',false); END IF;
 ending:=least(p_at,coalesce(o.fulfilled_at,p_at),coalesce(a.stopped_at,p_at));
 excluded:=a.paused_seconds+CASE WHEN a.pause_started_at IS NOT NULL THEN greatest(0,extract(epoch FROM ending-a.pause_started_at)) ELSE 0 END;
 IF a.notice_at IS NOT NULL THEN
  elapsed:=extract(epoch FROM ending-a.notice_at)-excluded-(7+a.extension_days)*86400;
  gross:=greatest(0,ceil(elapsed/604800))::bigint*1000;
 END IF;
 net:=greatest(0,gross-a.discount_cents-a.paid_cents);
 RETURN jsonb_build_object('eligible',true,'notice_at',a.notice_at,'free_until',a.notice_at+make_interval(days=>7+a.extension_days)+make_interval(secs=>excluded::double precision),
 'gross_cents',gross,'discount_cents',a.discount_cents,'paid_cents',a.paid_cents,'due_cents',net,'paused',a.pause_started_at IS NOT NULL,'stopped',a.stopped_at IS NOT NULL,
 'review_due',a.notice_at IS NOT NULL AND extract(epoch FROM ending-a.notice_at)-excluded>(21+a.extension_days)*86400,'reviewed_at',a.reviewed_at);
END $$;
CREATE OR REPLACE FUNCTION public.register_batch_order_v2(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; oid uuid;
BEGIN
 IF p->>'collection_policy_version' IS DISTINCT FROM 'collection-2026-10-v1' OR p->'policy_accepted' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'POLICY_ACCEPTANCE_REQUIRED'; END IF;
 result:=public.register_batch_order(p);
 SELECT id INTO oid FROM public.orders WHERE order_code=p->>'order_code';
 INSERT INTO public.order_collection_accounts(order_id,policy_version,accepted_at)VALUES(oid,'collection-2026-10-v1',statement_timestamp());
 RETURN result;
END $$;
-- Starts the clock atomically only when the ready email is accepted and persisted as sent.
CREATE OR REPLACE FUNCTION public.start_collection_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.kind='email' AND NEW.event='ready' AND NEW.status='sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
  UPDATE public.order_collection_accounts a SET notice_at=NEW.completed_at FROM public.orders o
  WHERE a.order_id=NEW.order_id AND o.id=a.order_id AND o.fulfilment_method='collection' AND o.ready_at IS NOT NULL AND o.fulfilled_at IS NULL AND a.notice_at IS NULL AND NEW.completed_at IS NOT NULL;
 END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS collection_ready_email ON public.order_integration_jobs;
CREATE TRIGGER collection_ready_email AFTER UPDATE OF status ON public.order_integration_jobs FOR EACH ROW EXECUTE FUNCTION public.start_collection_notice();
-- Preserve cross-ledger bank-reference uniqueness even through the original payment RPC.
CREATE OR REPLACE FUNCTION public.guard_collection_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.action IN ('deposit','legacy_deposit','balance_paid') AND EXISTS(SELECT 1 FROM public.order_collection_payments WHERE upper(btrim(reference))=upper(btrim(NEW.metadata->>'reference'))) THEN RAISE EXCEPTION 'PAYMENT_REFERENCE_REUSED'; END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS collection_reference_guard ON public.order_activity;
CREATE TRIGGER collection_reference_guard BEFORE INSERT ON public.order_activity FOR EACH ROW EXECUTE FUNCTION public.guard_collection_reference();
CREATE OR REPLACE FUNCTION public.collection_admin_operation(p_id uuid,p_action text,p_actor text,p_amount bigint DEFAULT NULL,p_note text DEFAULT NULL,p_reference text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE a public.order_collection_accounts; o public.orders; f jsonb;
BEGIN
 IF coalesce(length(btrim(p_actor)),0)=0 OR coalesce(length(btrim(p_note)),0) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_id FOR UPDATE;IF NOT FOUND OR o.fulfilled_at IS NOT NULL THEN RAISE EXCEPTION 'ORDER_UNAVAILABLE'; END IF;
 IF p_action='revoke_access' THEN
  UPDATE public.orders SET collection_access_version=collection_access_version+1 WHERE id=p_id;
 ELSE
  SELECT * INTO a FROM public.order_collection_accounts WHERE order_id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACCEPTED_POLICY'; END IF;
  f:=public.collection_fee_summary(p_id);
  IF p_action='pause' THEN
   IF a.notice_at IS NULL THEN RAISE EXCEPTION 'NOTICE_NOT_SENT'; END IF;
   UPDATE public.order_collection_accounts SET pause_started_at=coalesce(pause_started_at,statement_timestamp()) WHERE order_id=p_id;
  ELSIF p_action='resume' THEN UPDATE public.order_collection_accounts SET paused_seconds=paused_seconds+greatest(0,extract(epoch FROM statement_timestamp()-pause_started_at))::bigint,pause_started_at=NULL WHERE order_id=p_id AND pause_started_at IS NOT NULL;
  ELSIF p_action='extend' THEN
   IF p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 365 OR a.extension_days+p_amount>3650 THEN RAISE EXCEPTION 'INVALID_EXTENSION'; END IF;
   UPDATE public.order_collection_accounts SET extension_days=extension_days+p_amount::integer WHERE order_id=p_id;
  ELSIF p_action='reduce' THEN
   IF p_amount IS NULL OR p_amount<=0 OR p_amount>(f->>'due_cents')::bigint THEN RAISE EXCEPTION 'INVALID_REDUCTION'; END IF;
   UPDATE public.order_collection_accounts SET discount_cents=discount_cents+p_amount WHERE order_id=p_id;
  ELSIF p_action='payment' THEN
   IF p_amount IS NULL OR p_amount<=0 OR p_amount<>(f->>'due_cents')::bigint OR coalesce(length(btrim(p_reference)),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'PAYMENT_MISMATCH'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('payment-reference:'||upper(btrim(p_reference)),0));
   IF EXISTS(SELECT 1 FROM public.orders WHERE upper(btrim(payment_reference))=upper(btrim(p_reference)) OR upper(btrim(balance_reference))=upper(btrim(p_reference))) OR EXISTS(SELECT 1 FROM public.order_activity WHERE upper(btrim(metadata->>'reference'))=upper(btrim(p_reference))) OR EXISTS(SELECT 1 FROM public.order_collection_payments WHERE upper(btrim(reference))=upper(btrim(p_reference))) THEN RAISE EXCEPTION 'PAYMENT_REFERENCE_REUSED'; END IF;
   INSERT INTO public.order_collection_payments(order_id,amount_cents,reference,actor)VALUES(p_id,p_amount,btrim(p_reference),p_actor);
   UPDATE public.order_collection_accounts SET paid_cents=paid_cents+p_amount WHERE order_id=p_id;
  ELSIF p_action='review' THEN
   IF NOT (f->>'review_due')::boolean THEN RAISE EXCEPTION 'REVIEW_NOT_DUE'; END IF;
   UPDATE public.order_collection_accounts SET reviewed_at=statement_timestamp() WHERE order_id=p_id;
  ELSIF p_action='stop' THEN UPDATE public.order_collection_accounts SET stopped_at=coalesce(stopped_at,statement_timestamp()) WHERE order_id=p_id;
  ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 END IF;
 INSERT INTO public.order_activity(order_id,action,actor,metadata)VALUES(p_id,'collection_'||p_action,p_actor,jsonb_build_object('note',p_note,'amount',p_amount));
END $$;
-- Any path to fulfilment must settle/waive storage first; keep original payment guards intact.
CREATE OR REPLACE FUNCTION public.guard_storage_handover() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN IF NEW.fulfilled_at IS NOT NULL AND OLD.fulfilled_at IS NULL AND (public.collection_fee_summary(OLD.id)->>'due_cents')::bigint>0 THEN RAISE EXCEPTION 'STORAGE_FEES_DUE'; END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS storage_handover_guard ON public.orders;
CREATE TRIGGER storage_handover_guard BEFORE UPDATE OF fulfilled_at ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_storage_handover();
-- A refund ends future storage accrual; it does not erase already recorded ledger entries.
CREATE OR REPLACE FUNCTION public.stop_refunded_storage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.payment_status='REFUNDED' AND OLD.payment_status IS DISTINCT FROM 'REFUNDED' THEN
  UPDATE public.order_collection_accounts SET stopped_at=coalesce(stopped_at,statement_timestamp()) WHERE order_id=NEW.id;
 END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stop_refunded_storage ON public.orders;
CREATE TRIGGER stop_refunded_storage AFTER UPDATE OF payment_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.stop_refunded_storage();
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('collection_fee_summary','register_batch_order_v2','start_collection_notice','guard_collection_reference','collection_admin_operation','guard_storage_handover','stop_refunded_storage') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $$;
COMMIT;
