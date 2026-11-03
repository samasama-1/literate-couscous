-- REVIEW ONLY. Apply after collection_management.sql; no production application authorized.
-- Safety hold only: there is intentionally no activate/resume RPC in this release.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF current_user<>'postgres'THEN RAISE EXCEPTION 'Run as postgres';END IF;END$$;
CREATE TABLE IF NOT EXISTS public.storage_fee_controls(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),mode text NOT NULL DEFAULT 'off' CHECK(mode IN('off','suspended')),frozen_at timestamptz NOT NULL DEFAULT clock_timestamp(),changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),actor text NOT NULL DEFAULT 'migration',reason text NOT NULL DEFAULT 'Pending notice and charging approval');
INSERT INTO public.storage_fee_controls(singleton)VALUES(true)ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.collection_notice_evidence(order_id uuid PRIMARY KEY REFERENCES public.orders(id),provider_accepted_at timestamptz,held_at timestamptz,hold_reason text CHECK(hold_reason IN('confirmed_bounce','reported_non_delivery','collection_unavailable')),recorded_by text,recorded_at timestamptz);
CREATE TABLE IF NOT EXISTS public.storage_fee_control_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,mode text NOT NULL,frozen_at timestamptz NOT NULL,actor text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.storage_fee_control_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_fee_control_events FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.storage_fee_controls ENABLE ROW LEVEL SECURITY;ALTER TABLE public.collection_notice_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_fee_controls,public.collection_notice_evidence FROM PUBLIC,anon,authenticated,service_role;
-- Capture existing functions once. Rerunning must not wrap a wrapper.
DO $$BEGIN
 IF to_regprocedure('public.collection_fee_before_hold(uuid,timestamp with time zone)')IS NULL THEN ALTER FUNCTION public.collection_fee_summary(uuid,timestamptz)RENAME TO collection_fee_before_hold;END IF;
 IF to_regprocedure('public.collection_admin_before_hold(uuid,text,text,bigint,text,text)')IS NULL THEN ALTER FUNCTION public.collection_admin_operation(uuid,text,text,bigint,text,text)RENAME TO collection_admin_before_hold;END IF;
END$$;
CREATE OR REPLACE FUNCTION public.collection_fee_summary(p_id uuid,p_at timestamptz DEFAULT statement_timestamp())RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c public.storage_fee_controls;e public.collection_notice_evidence;f jsonb;
BEGIN
 SELECT * INTO c FROM public.storage_fee_controls WHERE singleton;IF NOT FOUND THEN RAISE EXCEPTION 'FEE_CONTROL_UNAVAILABLE';END IF;
 -- Freeze elapsed time, not the financial ledger. Prior reductions/payments still reconcile against prior accrual.
 f:=public.collection_fee_before_hold(p_id,least(coalesce(p_at,clock_timestamp()),c.frozen_at));
 SELECT * INTO e FROM public.collection_notice_evidence WHERE order_id=p_id;
 RETURN f||jsonb_build_object('accrual_mode',c.mode,'accrual_frozen_at',c.frozen_at,'notice_held',e.held_at IS NOT NULL,'notice_hold_reason',e.hold_reason,'provider_accepted_at',e.provider_accepted_at);
END$$;
CREATE OR REPLACE FUNCTION public.start_collection_notice()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.kind='email'AND NEW.event='ready'AND NEW.status='sent'AND OLD.status IS DISTINCT FROM 'sent'AND NEW.completed_at IS NOT NULL THEN
 INSERT INTO public.collection_notice_evidence(order_id,provider_accepted_at)SELECT id,NEW.completed_at FROM public.orders WHERE id=NEW.order_id AND fulfilment_method='collection'
 ON CONFLICT(order_id)DO UPDATE SET provider_accepted_at=EXCLUDED.provider_accepted_at;
 -- Provider acceptance is evidence of submission only; never starts/restarts billing or clears a hold.
 END IF;RETURN NEW;
END$$;
CREATE OR REPLACE FUNCTION public.collection_admin_operation(p_id uuid,p_action text,p_actor text,p_amount bigint DEFAULT NULL,p_note text DEFAULT NULL,p_reference text DEFAULT NULL)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
BEGIN
 IF p_action IN('pause','resume','extend')THEN RAISE EXCEPTION 'FEES_SAFETY_HELD';END IF;
 IF p_action='notice_hold'THEN
 IF p_reference IS NULL OR p_reference NOT IN('confirmed_bounce','reported_non_delivery','collection_unavailable')OR coalesce(length(btrim(p_actor)),0)NOT BETWEEN 1 AND 254 THEN RAISE EXCEPTION 'INVALID_NOTICE_HOLD';END IF;
 PERFORM id FROM public.orders WHERE id=p_id AND fulfilment_method='collection'AND payment_status<>'REFUNDED'AND fulfilled_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_UNAVAILABLE';END IF;
 INSERT INTO public.collection_notice_evidence(order_id,held_at,hold_reason,recorded_by,recorded_at)VALUES(p_id,clock_timestamp(),p_reference,p_actor,clock_timestamp())
 ON CONFLICT(order_id)DO UPDATE SET held_at=coalesce(collection_notice_evidence.held_at,EXCLUDED.held_at),hold_reason=EXCLUDED.hold_reason,recorded_by=EXCLUDED.recorded_by,recorded_at=EXCLUDED.recorded_at;
 INSERT INTO public.order_activity(order_id,action,actor,metadata)VALUES(p_id,'notice_hold',p_actor,jsonb_build_object('reason',p_reference));RETURN;
 END IF;
 PERFORM public.collection_admin_before_hold(p_id,p_action,p_actor,p_amount,p_note,p_reference);
END$$;
CREATE OR REPLACE FUNCTION public.suspend_storage_fees(p_actor text,p_reason text)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
BEGIN
 IF coalesce(length(btrim(p_actor)),0)NOT BETWEEN 1 AND 254 OR coalesce(length(btrim(p_reason)),0)NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'REASON_REQUIRED';END IF;
 UPDATE public.storage_fee_controls SET mode='suspended',changed_at=clock_timestamp(),actor=p_actor,reason=p_reason WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'FEE_CONTROL_UNAVAILABLE';END IF;
 INSERT INTO public.storage_fee_control_events(mode,frozen_at,actor,reason)SELECT mode,frozen_at,p_actor,p_reason FROM public.storage_fee_controls WHERE singleton;
 -- frozen_at deliberately unchanged: suspension never forgives debt or restarts elapsed time.
END$$;
-- Index-backed seek pagination. No counts or customer-wide scans.
CREATE INDEX IF NOT EXISTS collection_notice_holds_page ON public.collection_notice_evidence(recorded_at DESC,order_id DESC)WHERE held_at IS NOT NULL;
CREATE OR REPLACE FUNCTION public.storage_safety_overview(p_after timestamptz DEFAULT NULL,p_after_id uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET statement_timeout='5s' AS $$
DECLARE c public.storage_fee_controls;notices jsonb;
BEGIN
 IF(p_after IS NULL)IS DISTINCT FROM(p_after_id IS NULL)THEN RAISE EXCEPTION 'INVALID_CURSOR';END IF;
 SELECT * INTO c FROM public.storage_fee_controls WHERE singleton;IF NOT FOUND THEN RAISE EXCEPTION 'FEE_CONTROL_UNAVAILABLE';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.order_id,'order_code',o.order_code,'customer_name',o.customer_name,'held_at',n.held_at,'recorded_at',n.recorded_at,'reason',n.hold_reason)ORDER BY n.recorded_at DESC,n.order_id DESC),'[]'::jsonb)INTO notices
 FROM(SELECT order_id,held_at,recorded_at,hold_reason FROM public.collection_notice_evidence WHERE held_at IS NOT NULL AND(p_after IS NULL OR(recorded_at,order_id)<(p_after,p_after_id))ORDER BY recorded_at DESC,order_id DESC LIMIT 51)n
 JOIN public.orders o ON o.id=n.order_id;
 RETURN jsonb_build_object('mode',c.mode,'frozen_at',c.frozen_at,'notices',notices);
END$$;
REVOKE INSERT,UPDATE ON public.order_collection_accounts,public.order_collection_payments FROM service_role;
DO $$DECLARE f regprocedure;BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('collection_fee_before_hold','collection_admin_before_hold','collection_fee_summary','start_collection_notice','collection_admin_operation','suspend_storage_fees','storage_safety_overview')LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
 IF f::text LIKE '%collection_fee_summary%'OR f::text LIKE '%collection_admin_operation%'OR f::text LIKE '%storage_safety_overview%'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);END IF;
 END LOOP;END$$;
COMMIT;
