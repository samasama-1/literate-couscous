-- Review-only. Requires campaign lead/hardening/email migrations, collection foundation,
-- manual_balance_operations.sql and collection_fee_safety_hold.sql. No sends/schedules/backfill.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF current_user<>'postgres'THEN RAISE EXCEPTION 'Run as postgres';END IF;END$$;
CREATE TABLE IF NOT EXISTS public.campaign_discount_controls(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,opened_at timestamptz);
INSERT INTO public.campaign_discount_controls(singleton)VALUES(true)ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.campaign_discount_codes(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL REFERENCES public.campaigns(id),lead_id uuid NOT NULL REFERENCES public.campaign_leads(id),
 email_normalized text NOT NULL UNIQUE,code_hash text NOT NULL UNIQUE CHECK(code_hash~'^[a-f0-9]{64}$'),token_hash text NOT NULL CHECK(token_hash~'^[a-f0-9]{64}$'),envelope text NOT NULL CHECK(envelope~'^[A-Za-z0-9_-]{123}$'),
 issued_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'issued' CHECK(status IN('issued','reserved','redeemed','review','revoked')),
 order_id uuid UNIQUE REFERENCES public.orders(id),override_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.campaign_discount_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),coupon_id uuid REFERENCES public.campaign_discount_codes(id),order_id uuid REFERENCES public.orders(id),action text NOT NULL,actor text NOT NULL,reason text,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS campaign_coupon_id uuid REFERENCES public.campaign_discount_codes(id),ADD COLUMN IF NOT EXISTS campaign_discount_cents integer NOT NULL DEFAULT 0 CHECK(campaign_discount_cents>=0),ADD COLUMN IF NOT EXISTS quoted_unit_cents integer,ADD COLUMN IF NOT EXISTS delivery_charge_cents integer,ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
CREATE INDEX IF NOT EXISTS coupon_first_paid_email ON public.orders(lower(btrim(customer_email)),deposit_verified_at,id)WHERE deposit_verified_at IS NOT NULL OR payment_status IN('VERIFIED','REFUNDED');
CREATE INDEX IF NOT EXISTS campaign_discount_page ON public.campaign_discount_codes(issued_at DESC,id DESC);
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['campaign_discount_controls','campaign_discount_codes','campaign_discount_events']LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END$$;
CREATE OR REPLACE FUNCTION public.register_campaign_intent_discount(p jsonb,p_coupon jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='Asia/Singapore' SET lock_timeout='2s' AS $$
DECLARE r jsonb;l public.campaign_leads;c public.campaigns;ct public.contacts;v public.campaign_discount_codes;gate public.campaign_discount_controls;n timestamptz;replayed boolean;
BEGIN
 SELECT EXISTS(SELECT 1 FROM public.campaign_requests WHERE id=(p->>'request_id')::uuid)INTO replayed;
 r:=public.register_campaign_intent(p);
 SELECT * INTO l FROM public.campaign_leads WHERE id=(r->>'lead_id')::uuid;
 SELECT * INTO c FROM public.campaigns WHERE id=l.campaign_id;SELECT * INTO ct FROM public.contacts WHERE id=l.contact_id;
 SELECT * INTO gate FROM public.campaign_discount_controls WHERE singleton FOR SHARE;n:=clock_timestamp();
 IF c.is_test OR l.purchase_intent<>'yes'OR NOT coalesce(gate.enabled,false)THEN RETURN r;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('campaign-discount:'||ct.email_normalized,0));
 SELECT * INTO v FROM public.campaign_discount_codes WHERE email_normalized=ct.email_normalized;
 IF NOT FOUND THEN
 -- Never retroactively award prior registrations, or extend validity on re-voting/retry.
 IF replayed OR (r->>'already_registered')::boolean OR gate.opened_at IS NULL OR l.created_at<gate.opened_at THEN RETURN r;END IF;
 IF coalesce(p_coupon->>'hash','')!~'^[a-f0-9]{64}$'OR coalesce(p_coupon->>'token_hash','')!~'^[a-f0-9]{64}$'OR coalesce(p_coupon->>'envelope','')!~'^[A-Za-z0-9_-]{123}$'THEN RAISE EXCEPTION 'DISCOUNT_CONFIGURATION';END IF;
 INSERT INTO public.campaign_discount_codes(id,campaign_id,lead_id,email_normalized,code_hash,token_hash,envelope,issued_at,expires_at)
 VALUES((p_coupon->>'id')::uuid,c.id,l.id,ct.email_normalized,p_coupon->>'hash',p_coupon->>'token_hash',p_coupon->>'envelope',n,n+interval '6 months')RETURNING * INTO v;
 INSERT INTO public.campaign_discount_events(coupon_id,action,actor)VALUES(v.id,'issued','campaign-registration');
 END IF;
 IF r->>'delivery_id'IS NOT NULL THEN
 UPDATE public.email_deliveries SET metadata=metadata||jsonb_build_object('campaign_coupon_id',v.id)WHERE id=(r->>'delivery_id')::uuid AND status='queued'AND attempted_at IS NULL;
 END IF;RETURN r;
END$$;
CREATE OR REPLACE FUNCTION public.campaign_discount_mail(p_delivery uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE j public.email_deliveries;v public.campaign_discount_codes;
BEGIN
 SELECT * INTO j FROM public.email_deliveries WHERE id=p_delivery AND template_key='intent_confirmation';
 IF NOT FOUND OR j.metadata->>'campaign_coupon_id'IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO v FROM public.campaign_discount_codes WHERE id=(j.metadata->>'campaign_coupon_id')::uuid AND email_normalized=lower(btrim(j.recipient_email));
 IF NOT FOUND THEN RAISE EXCEPTION 'DISCOUNT_MAIL_MISMATCH';END IF;
 RETURN jsonb_build_object('id',v.id,'hash',v.code_hash,'token_hash',v.token_hash,'envelope',v.envelope,'expires_at',v.expires_at,'status',v.status);
END$$;
CREATE OR REPLACE FUNCTION public.guard_campaign_discount_order()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v public.campaign_discount_codes;email text;n timestamptz;
BEGIN
 IF TG_OP='UPDATE'THEN
 IF OLD.cancelled_at IS NOT NULL AND ROW(NEW.payment_status,NEW.deposit_verified_at,NEW.balance_paid_at,NEW.ready_at,NEW.fulfilled_at)IS DISTINCT FROM ROW(OLD.payment_status,OLD.deposit_verified_at,OLD.balance_paid_at,OLD.ready_at,OLD.fulfilled_at)THEN RAISE EXCEPTION 'ORDER_CANCELLED';END IF;
 IF ROW(NEW.campaign_coupon_id,NEW.campaign_discount_cents,NEW.quoted_unit_cents,NEW.delivery_charge_cents,NEW.cancelled_at)IS DISTINCT FROM ROW(OLD.campaign_coupon_id,OLD.campaign_discount_cents,OLD.quoted_unit_cents,OLD.delivery_charge_cents,OLD.cancelled_at)AND coalesce(current_setting('samasama.discount_write',true),'')<>'on'THEN RAISE EXCEPTION 'USE_DISCOUNT_OPERATION';END IF;
 IF ROW(NEW.campaign_coupon_id,NEW.campaign_discount_cents,NEW.quoted_unit_cents,NEW.delivery_charge_cents,NEW.cancelled_at)IS DISTINCT FROM ROW(OLD.campaign_coupon_id,OLD.campaign_discount_cents,OLD.quoted_unit_cents,OLD.delivery_charge_cents,OLD.cancelled_at)THEN NEW.balance_revision:=OLD.balance_revision+1;END IF;
 IF OLD.campaign_coupon_id IS NOT NULL AND ROW(NEW.customer_email,NEW.quantity,NEW.batch_id)IS DISTINCT FROM ROW(OLD.customer_email,OLD.quantity,OLD.batch_id)THEN RAISE EXCEPTION 'DISCOUNT_ORDER_LOCKED';END IF;
 END IF;
 IF NEW.campaign_coupon_id IS NOT NULL AND NEW.final_total_cents IS NOT NULL THEN
 IF NEW.quoted_unit_cents IS NULL OR NEW.quoted_unit_cents<5000 OR NEW.delivery_charge_cents IS NULL OR NEW.delivery_charge_cents<0 OR(NEW.fulfilment_method='collection'AND NEW.delivery_charge_cents<>0)OR NEW.campaign_discount_cents<>NEW.quantity*1000 OR NEW.final_total_cents<>NEW.quoted_unit_cents::bigint*NEW.quantity+NEW.delivery_charge_cents-NEW.campaign_discount_cents OR NEW.balance_due_cents<>NEW.final_total_cents-NEW.deposit_due_cents THEN RAISE EXCEPTION 'DISCOUNT_PRICE_MISMATCH';END IF;
 END IF;
 IF TG_OP='UPDATE'AND OLD.deposit_verified_at IS NULL AND NEW.deposit_verified_at IS NOT NULL THEN
 email:=lower(btrim(NEW.customer_email));PERFORM pg_advisory_xact_lock(hashtextextended('campaign-discount:'||email,0));n:=clock_timestamp();
 SELECT * INTO v FROM public.campaign_discount_codes WHERE email_normalized=email FOR UPDATE;
 IF NEW.campaign_coupon_id IS NOT NULL THEN
 IF v.id IS DISTINCT FROM NEW.campaign_coupon_id OR v.order_id IS DISTINCT FROM NEW.id OR v.status<>'reserved'OR EXISTS(SELECT 1 FROM public.orders x WHERE lower(btrim(x.customer_email))=email AND x.id<>NEW.id AND (x.deposit_verified_at IS NOT NULL OR x.payment_status IN('VERIFIED','REFUNDED'))AND NOT(coalesce(v.override_at IS NOT NULL AND x.payment_status='REFUNDED'AND x.deposit_verified_at<=v.override_at,false)))THEN RAISE EXCEPTION 'DISCOUNT_NOT_FIRST_ORDER';END IF;
 UPDATE public.campaign_discount_codes SET status='redeemed'WHERE id=v.id;
 INSERT INTO public.campaign_discount_events(coupon_id,order_id,action,actor)VALUES(v.id,NEW.id,'committed-on-deposit',coalesce(NEW.deposit_verified_by,'admin'));
 ELSIF v.id IS NOT NULL AND v.status='reserved'THEN
 UPDATE public.campaign_discount_codes SET status='review'WHERE id=v.id;
 END IF;END IF;RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS campaign_discount_guard ON public.orders;
CREATE TRIGGER campaign_discount_guard BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_discount_order();
CREATE OR REPLACE FUNCTION public.register_batch_order(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b public.batches; qty integer; due integer; bid uuid; phone text;
BEGIN
  bid:=(p->>'batch_id')::uuid; qty:=(p->>'quantity')::integer; phone:=p->>'customer_phone';
  IF qty IS NULL OR qty<1 OR qty>10 OR coalesce(length(phone),0)<8 OR length(phone)>30
    OR coalesce(length(btrim(p->>'customer_name')),0)=0 OR length(p->>'customer_name')>150
    OR coalesce(p->>'customer_email','')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR length(p->>'customer_email')>254
    OR coalesce(length(btrim(p->>'address_line1')),0)=0 OR length(p->>'address_line1')>200 OR length(p->>'address_line2')>100
    OR coalesce(p->>'postal_code','')!~'^[0-9]{6}$' OR coalesce(p->>'fulfilment_method','') NOT IN ('collection','delivery')
    OR coalesce(p->>'order_code','')!~'^SAMA-[A-F0-9]{16}$' THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
  SELECT * INTO b FROM public.batches WHERE id=bid FOR SHARE;
  IF NOT FOUND OR b.status<>'OPEN' OR b.closes_at<=now() THEN RAISE EXCEPTION 'BATCH_CLOSED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('batch-order:'||bid::text||':'||phone,0));
  IF EXISTS(SELECT 1 FROM public.orders WHERE batch_id=bid AND customer_phone=phone AND payment_status IN ('PENDING_PAYNOW','VERIFIED') AND cancelled_at IS NULL) THEN RAISE EXCEPTION 'ORDER_EXISTS'; END IF;
  due:=round(b.deposit_amount*100)::integer*qty;
  IF due IS NULL OR due<0 THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
  INSERT INTO public.orders(order_code,batch_id,customer_name,customer_phone,customer_email,quantity,payment_status,address_line1,address_line2,postal_code,fulfilment_method,deposit_due_cents)
  VALUES(p->>'order_code',bid,btrim(p->>'customer_name'),phone,lower(btrim(p->>'customer_email')),qty,'PENDING_PAYNOW',btrim(p->>'address_line1'),nullif(btrim(p->>'address_line2'),''),p->>'postal_code',p->>'fulfilment_method',due);
  RETURN jsonb_build_object('deposit_due_cents',due);
END $$;
CREATE OR REPLACE FUNCTION public.register_batch_order_discount(p jsonb,p_hash text DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE v public.campaign_discount_codes;b public.batches;r jsonb;oid uuid;email text;qty integer;
BEGIN
 email:=lower(btrim(p->>'customer_email'));qty:=(p->>'quantity')::integer;
 IF p_hash IS NOT NULL THEN
 PERFORM pg_advisory_xact_lock(hashtextextended('campaign-discount:'||email,0));
 SELECT * INTO v FROM public.campaign_discount_codes WHERE code_hash=p_hash AND email_normalized=email FOR UPDATE;
 IF NOT FOUND OR v.status<>'issued'OR v.expires_at<=clock_timestamp()OR EXISTS(SELECT 1 FROM public.orders x WHERE lower(btrim(x.customer_email))=email AND (x.deposit_verified_at IS NOT NULL OR x.payment_status IN('VERIFIED','REFUNDED'))AND NOT(coalesce(v.override_at IS NOT NULL AND x.payment_status='REFUNDED'AND x.deposit_verified_at<=v.override_at,false)))THEN RAISE EXCEPTION 'DISCOUNT_UNAVAILABLE';END IF;
 SELECT * INTO b FROM public.batches WHERE id=(p->>'batch_id')::uuid FOR SHARE;
 IF NOT FOUND OR b.tier_1_price IS NULL OR round(b.tier_1_price*100)<5000 THEN RAISE EXCEPTION 'DISCOUNT_MINIMUM';END IF;
 END IF;
 IF p->'policy_accepted'='true'::jsonb THEN r:=public.register_batch_order_v2(p);ELSE r:=public.register_batch_order(p);END IF;
 IF p_hash IS NULL THEN RETURN r;END IF;
 SELECT id INTO oid FROM public.orders WHERE order_code=p->>'order_code';
 PERFORM set_config('samasama.discount_write','on',true);
 UPDATE public.orders SET campaign_coupon_id=v.id,campaign_discount_cents=qty*1000 WHERE id=oid;
 UPDATE public.campaign_discount_codes SET status='reserved',order_id=oid WHERE id=v.id;
 UPDATE public.order_integration_jobs SET payload=payload||jsonb_build_object('discount_cents',qty*1000)WHERE order_id=oid AND kind='email'AND event='order_received'AND status='queued'AND send_started_at IS NULL;
 INSERT INTO public.campaign_discount_events(coupon_id,order_id,action,actor)VALUES(v.id,oid,'reserved','customer-code');
 RETURN r||jsonb_build_object('discount_cents',qty*1000);
END$$;
CREATE OR REPLACE FUNCTION public.quote_order_discount(p_id uuid,p_revision bigint,p_unit integer,p_delivery integer,p_actor text)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE o public.orders;v public.campaign_discount_codes;discount integer:=0;total bigint;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status<>'VERIFIED'OR o.deposit_verified_at IS NULL OR o.cancelled_at IS NOT NULL OR o.fulfilled_at IS NOT NULL OR o.ready_at IS NOT NULL OR o.balance_paid_at IS NOT NULL OR o.deposit_due_cents IS NULL THEN RAISE EXCEPTION 'ORDER_UNAVAILABLE';END IF;
 IF o.balance_revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'STALE_PREVIEW';END IF;
 IF p_unit IS NULL OR p_unit<0 OR p_delivery IS NULL OR p_delivery<0 OR(o.fulfilment_method='collection'AND p_delivery<>0)OR coalesce(length(btrim(p_actor)),0)NOT BETWEEN 1 AND 254 THEN RAISE EXCEPTION 'INVALID_QUOTE';END IF;
 IF o.campaign_coupon_id IS NOT NULL THEN
 SELECT * INTO v FROM public.campaign_discount_codes WHERE id=o.campaign_coupon_id FOR UPDATE;
 IF v.order_id IS DISTINCT FROM o.id OR v.status<>'redeemed'THEN RAISE EXCEPTION 'DISCOUNT_REVIEW';END IF;
 IF p_unit<5000 THEN RAISE EXCEPTION 'DISCOUNT_MINIMUM';END IF;discount:=o.quantity*1000;
 END IF;
 total:=p_unit::bigint*o.quantity+p_delivery-discount;
 IF total<o.deposit_due_cents OR total>100000000 THEN RAISE EXCEPTION 'INVALID_TOTAL';END IF;
 IF EXISTS(SELECT 1 FROM public.order_integration_jobs WHERE order_id=p_id AND kind='email'AND event='balance_requested'AND status IN('processing','review'))THEN RAISE EXCEPTION 'REVIEW_EXISTING_SEND';END IF;
 PERFORM set_config('samasama.discount_write','on',true);PERFORM set_config('samasama.manual_balance','on',true);
 UPDATE public.orders SET quoted_unit_cents=p_unit,delivery_charge_cents=p_delivery,campaign_discount_cents=discount,final_total_cents=total,balance_due_cents=total-deposit_due_cents,balance_token_hash=NULL,balance_token_expires_at=NULL,balance_requested_at=NULL WHERE id=p_id;
 INSERT INTO public.order_activity(order_id,action,actor,metadata)VALUES(p_id,'final_total_confirmed',p_actor,jsonb_build_object('unit_gross_cents',p_unit,'delivery_cents',p_delivery,'discount_cents',discount,'final_total_cents',total));
END$$;
CREATE OR REPLACE FUNCTION public.admin_campaign_discount(p_id uuid,p_action text,p_actor text,p_reason text)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE v public.campaign_discount_codes;o public.orders;email text;gross bigint;
BEGIN
 IF p_action NOT IN('revoke','reinstate')OR p_action IS NULL OR coalesce(length(btrim(p_actor)),0)NOT BETWEEN 1 AND 254 OR coalesce(length(btrim(p_reason)),0)NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'INVALID_DISCOUNT_ACTION';END IF;
 SELECT * INTO v FROM public.campaign_discount_codes WHERE id=p_id;IF NOT FOUND THEN RAISE EXCEPTION 'DISCOUNT_UNAVAILABLE';END IF;
 IF v.order_id IS NOT NULL THEN SELECT * INTO o FROM public.orders WHERE id=v.order_id FOR UPDATE;END IF;
 email:=v.email_normalized;PERFORM pg_advisory_xact_lock(hashtextextended('campaign-discount:'||email,0));
 SELECT * INTO v FROM public.campaign_discount_codes WHERE id=p_id FOR UPDATE;
 IF v.order_id IS DISTINCT FROM o.id THEN RAISE EXCEPTION 'STALE_PREVIEW';END IF;
 PERFORM set_config('samasama.discount_write','on',true);PERFORM set_config('samasama.manual_balance','on',true);
 IF p_action='reinstate'AND v.order_id IS NULL THEN
 IF v.status<>'revoked'OR v.expires_at<=clock_timestamp()OR EXISTS(SELECT 1 FROM public.orders x WHERE lower(btrim(x.customer_email))=email AND(x.deposit_verified_at IS NOT NULL OR x.payment_status IN('VERIFIED','REFUNDED'))AND NOT(coalesce(v.override_at IS NOT NULL AND x.payment_status='REFUNDED'AND x.deposit_verified_at<=v.override_at,false)))THEN RAISE EXCEPTION 'DISCOUNT_REINSTATEMENT_REVIEW';END IF;
 UPDATE public.campaign_discount_codes SET status='issued'WHERE id=p_id;
 INSERT INTO public.campaign_discount_events(coupon_id,action,actor,reason)VALUES(p_id,p_action,p_actor,p_reason);RETURN;
 END IF;
 IF p_action='reinstate'THEN
 IF v.expires_at<=clock_timestamp()OR v.order_id IS NULL OR(o.deposit_verified_at IS NOT NULL AND o.payment_status<>'REFUNDED')OR o.fulfilled_at IS NOT NULL THEN RAISE EXCEPTION 'DISCOUNT_REINSTATEMENT_REVIEW';END IF;
 IF EXISTS(SELECT 1 FROM public.order_integration_jobs WHERE order_id=o.id AND kind='email'AND status IN('processing','review'))THEN RAISE EXCEPTION 'REVIEW_EXISTING_SEND';END IF;
 IF o.deposit_verified_at IS NULL THEN
 IF(o.campaign_coupon_id IS NOT NULL AND o.campaign_coupon_id IS DISTINCT FROM v.id)OR o.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'DISCOUNT_REINSTATEMENT_REVIEW';END IF;
 UPDATE public.order_integration_jobs SET status='skipped',completed_at=clock_timestamp(),payload='{}',error_code='ORDER_CANCELLED'WHERE order_id=o.id AND kind='email'AND status='queued';
 UPDATE public.orders SET cancelled_at=clock_timestamp(),campaign_coupon_id=NULL,campaign_discount_cents=0,quoted_unit_cents=NULL,delivery_charge_cents=NULL,final_total_cents=NULL,balance_due_cents=NULL,balance_token_hash=NULL,balance_token_expires_at=NULL,balance_requested_at=NULL WHERE id=o.id;
 ELSE
 IF EXISTS(SELECT 1 FROM public.orders x WHERE lower(btrim(customer_email))=email AND(deposit_verified_at IS NOT NULL OR payment_status='VERIFIED')AND payment_status<>'REFUNDED')THEN RAISE EXCEPTION 'DISCOUNT_REINSTATEMENT_REVIEW';END IF;
 END IF;
 UPDATE public.campaign_discount_codes SET status='issued',order_id=NULL,override_at=CASE WHEN o.deposit_verified_at IS NOT NULL THEN clock_timestamp()ELSE override_at END WHERE id=p_id;
 ELSE
 IF o.id IS NOT NULL AND(o.ready_at IS NOT NULL OR o.balance_paid_at IS NOT NULL OR o.fulfilled_at IS NOT NULL)THEN RAISE EXCEPTION 'DISCOUNT_REINSTATEMENT_REVIEW';END IF;
 IF o.id IS NOT NULL THEN
 IF EXISTS(SELECT 1 FROM public.order_integration_jobs WHERE order_id=o.id AND kind='email'AND event='balance_requested'AND status IN('processing','review'))THEN RAISE EXCEPTION 'REVIEW_EXISTING_SEND';END IF;
 gross:=o.quoted_unit_cents::bigint*o.quantity+o.delivery_charge_cents;
 IF gross<o.deposit_due_cents THEN RAISE EXCEPTION 'INVALID_TOTAL';END IF;
 UPDATE public.orders SET campaign_coupon_id=NULL,campaign_discount_cents=0,final_total_cents=gross,balance_due_cents=gross-deposit_due_cents,balance_token_hash=NULL,balance_token_expires_at=NULL,balance_requested_at=NULL WHERE id=o.id;
 END IF;UPDATE public.campaign_discount_codes SET status='revoked'WHERE id=p_id;
 END IF;
 INSERT INTO public.campaign_discount_events(coupon_id,order_id,action,actor,reason)VALUES(p_id,o.id,p_action,p_actor,p_reason);
 IF o.id IS NOT NULL THEN INSERT INTO public.order_activity(order_id,action,actor,metadata)VALUES(o.id,'campaign_discount_'||p_action,p_actor,jsonb_build_object('reason',p_reason));END IF;
END$$;
CREATE OR REPLACE FUNCTION public.configure_campaign_discount(p_enabled boolean,p_actor text)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_enabled IS NULL OR coalesce(length(btrim(p_actor)),0)NOT BETWEEN 1 AND 254 THEN RAISE EXCEPTION 'INVALID_DISCOUNT_ACTION';END IF;
 UPDATE public.campaign_discount_controls SET enabled=p_enabled,opened_at=CASE WHEN p_enabled THEN coalesce(opened_at,clock_timestamp())ELSE opened_at END WHERE singleton;
 INSERT INTO public.campaign_discount_events(action,actor,reason)VALUES('issuance-setting',p_actor,CASE WHEN p_enabled THEN 'enabled'ELSE 'disabled'END);
END$$;
CREATE OR REPLACE FUNCTION public.campaign_discount_report(p_after timestamptz DEFAULT NULL,p_after_id uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET statement_timeout='5s' AS $$
DECLARE result jsonb;
BEGIN
 IF(p_after IS NULL)IS DISTINCT FROM(p_after_id IS NULL)THEN RAISE EXCEPTION 'INVALID_CURSOR';END IF;
 SELECT jsonb_build_object('enabled',g.enabled,'opened_at',g.opened_at,'codes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'email',v.email_normalized,'lead_id',v.lead_id,'issued_at',v.issued_at,'expires_at',v.expires_at,'status',v.status,'expired',v.expires_at<=clock_timestamp(),'order_id',v.order_id,'paid_cents',coalesce((SELECT CASE WHEN o.deposit_verified_at IS NOT NULL THEN coalesce(o.deposit_due_cents,0)ELSE 0 END+CASE WHEN o.balance_paid_at IS NOT NULL THEN coalesce(o.balance_due_cents,0)ELSE 0 END FROM public.orders o WHERE o.id=v.order_id),0))ORDER BY v.issued_at DESC,v.id DESC),'[]'::jsonb)FROM(SELECT * FROM public.campaign_discount_codes WHERE p_after IS NULL OR(issued_at,id)<(p_after,p_after_id)ORDER BY issued_at DESC,id DESC LIMIT 51)v))INTO result FROM public.campaign_discount_controls g WHERE singleton;
 RETURN result;
END$$;
CREATE OR REPLACE FUNCTION public.campaign_discount_offer()RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$SELECT coalesce((SELECT enabled FROM public.campaign_discount_controls WHERE singleton),false)$$;
CREATE OR REPLACE FUNCTION public.enrich_discount_job()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE o public.orders;
BEGIN
 IF NEW.kind='email'THEN SELECT * INTO o FROM public.orders WHERE id=NEW.order_id;
 NEW.payload:=NEW.payload||jsonb_build_object('discount_cents',o.campaign_discount_cents,'product_subtotal_cents',o.quoted_unit_cents::bigint*o.quantity,'delivery_cents',o.delivery_charge_cents);END IF;RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS enrich_discount_mail ON public.order_integration_jobs;
CREATE TRIGGER enrich_discount_mail BEFORE INSERT ON public.order_integration_jobs FOR EACH ROW EXECUTE FUNCTION public.enrich_discount_job();
DO $$DECLARE f regprocedure;BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('register_batch_order','register_campaign_intent_discount','campaign_discount_mail','guard_campaign_discount_order','register_batch_order_discount','quote_order_discount','admin_campaign_discount','configure_campaign_discount','campaign_discount_report','campaign_discount_offer','enrich_discount_job')LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
 IF f::text NOT LIKE '%guard_campaign_discount_order%'AND f::text NOT LIKE '%enrich_discount_job%'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);END IF;
 END LOOP;END$$;
COMMIT;
