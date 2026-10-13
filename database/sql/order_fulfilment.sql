-- Apply after existing order schema/security scripts. Additive; no emails or payments are sent.
BEGIN;
ALTER TABLE public.orders ALTER COLUMN order_code TYPE varchar(32);
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS fulfilment_method text NOT NULL DEFAULT 'collection' CHECK (fulfilment_method IN ('collection','delivery')),
  ADD COLUMN IF NOT EXISTS deposit_due_cents integer CHECK (deposit_due_cents >= 0),
  ADD COLUMN IF NOT EXISTS deposit_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_verified_by text,
  ADD COLUMN IF NOT EXISTS final_total_cents integer CHECK (final_total_cents >= 0),
  ADD COLUMN IF NOT EXISTS balance_due_cents integer CHECK (balance_due_cents >= 0),
  ADD COLUMN IF NOT EXISTS balance_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS balance_reference text,
  ADD COLUMN IF NOT EXISTS balance_token_hash text,
  ADD COLUMN IF NOT EXISTS balance_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS balance_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfilled_by text,
  ADD COLUMN IF NOT EXISTS received_by text;
CREATE UNIQUE INDEX IF NOT EXISTS order_balance_token_idx ON public.orders(balance_token_hash) WHERE balance_token_hash IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.order_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id),
  action text NOT NULL, actor text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_activity FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_activity TO service_role;
-- Browser roles cannot insert/update sensitive order fields directly. All writes use guarded server actions.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.orders FROM PUBLIC, anon, authenticated;
-- Table-level revocation does not remove legacy column grants.
DO $$ DECLARE col record; BEGIN
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.orders'::regclass AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I) ON public.orders FROM PUBLIC, anon, authenticated',col.attname,col.attname,col.attname);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO service_role;

-- Lock the batch while creating the order so closing/repricing cannot race registration.
CREATE OR REPLACE FUNCTION public.register_batch_order(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b batches; qty integer; due integer; bid uuid; phone text;
BEGIN
  bid:=(p->>'batch_id')::uuid; qty:=(p->>'quantity')::integer; phone:=p->>'customer_phone';
  IF qty IS NULL OR qty<1 OR qty>10 OR coalesce(length(phone),0)<8 OR length(phone)>30
    OR coalesce(length(btrim(p->>'customer_name')),0)=0 OR length(p->>'customer_name')>150
    OR coalesce(p->>'customer_email','')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR length(p->>'customer_email')>254
    OR coalesce(length(btrim(p->>'address_line1')),0)=0 OR length(p->>'address_line1')>200 OR length(p->>'address_line2')>100
    OR coalesce(p->>'postal_code','')!~'^[0-9]{6}$' OR coalesce(p->>'fulfilment_method','') NOT IN ('collection','delivery')
    OR coalesce(p->>'order_code','')!~'^SAMA-[A-F0-9]{16}$' THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
  SELECT * INTO b FROM batches WHERE id=bid FOR SHARE;
  IF NOT FOUND OR b.status<>'OPEN' OR b.closes_at<=now() THEN RAISE EXCEPTION 'BATCH_CLOSED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('batch-order:'||bid::text||':'||phone,0));
  IF EXISTS(SELECT 1 FROM orders WHERE batch_id=bid AND customer_phone=phone AND payment_status IN ('PENDING_PAYNOW','VERIFIED')) THEN RAISE EXCEPTION 'ORDER_EXISTS'; END IF;
  due:=round(b.deposit_amount*100)::integer*qty;
  IF due IS NULL OR due<0 THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
  INSERT INTO orders(order_code,batch_id,customer_name,customer_phone,customer_email,quantity,payment_status,address_line1,address_line2,postal_code,fulfilment_method,deposit_due_cents)
  VALUES(p->>'order_code',bid,btrim(p->>'customer_name'),phone,lower(btrim(p->>'customer_email')),qty,'PENDING_PAYNOW',btrim(p->>'address_line1'),nullif(btrim(p->>'address_line2'),''),p->>'postal_code',p->>'fulfilment_method',due);
  RETURN jsonb_build_object('deposit_due_cents',due);
END $$;
REVOKE ALL ON FUNCTION public.register_batch_order(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_batch_order(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.order_operation(p_id uuid,p_action text,p_actor text,p_amount integer DEFAULT NULL,p_reference text DEFAULT NULL,p_hash text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o orders; due integer; details jsonb := '{}';
BEGIN
  IF coalesce(length(btrim(p_actor)),0)=0 THEN RAISE EXCEPTION 'ACTOR_REQUIRED'; END IF;
  SELECT * INTO o FROM orders WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF o.payment_status='REFUNDED' THEN RAISE EXCEPTION 'ORDER_REFUNDED'; END IF;
  IF p_action IN ('deposit','legacy_deposit','balance_paid') AND coalesce(length(btrim(p_reference)),0)>0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('payment-reference:'||upper(btrim(p_reference)),0));
    IF EXISTS (SELECT 1 FROM orders x WHERE (x.id<>p_id AND (upper(btrim(x.payment_reference))=upper(btrim(p_reference)) OR upper(btrim(x.balance_reference))=upper(btrim(p_reference)))) OR (x.id=p_id AND ((p_action='balance_paid' AND upper(btrim(x.payment_reference))=upper(btrim(p_reference))) OR (p_action IN ('deposit','legacy_deposit') AND upper(btrim(x.balance_reference))=upper(btrim(p_reference)))))) THEN RAISE EXCEPTION 'PAYMENT_REFERENCE_REUSED'; END IF;
    IF EXISTS (SELECT 1 FROM order_activity WHERE action IN ('deposit','legacy_deposit','balance_paid') AND upper(btrim(metadata->>'reference'))=upper(btrim(p_reference)) AND (order_id<>p_id OR action<>p_action)) THEN RAISE EXCEPTION 'PAYMENT_REFERENCE_REUSED'; END IF;
  END IF;
  IF p_action='deposit' THEN
    IF o.payment_status='VERIFIED' THEN RETURN; END IF;
    IF o.payment_status<>'PENDING_PAYNOW' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    due:=o.deposit_due_cents;
    IF due IS NULL THEN SELECT round(deposit_amount*100)::integer*o.quantity INTO due FROM batches WHERE id=o.batch_id; END IF;
    IF due IS NULL OR p_amount IS DISTINCT FROM due OR coalesce(length(btrim(p_reference)),0)=0 THEN RAISE EXCEPTION 'PAYMENT_MISMATCH'; END IF;
    UPDATE orders SET payment_status='VERIFIED',deposit_due_cents=due,payment_reference=btrim(p_reference),deposit_verified_at=now(),deposit_verified_by=p_actor WHERE id=p_id;
    details:=jsonb_build_object('amount_cents',due,'reference',p_reference);
  ELSIF p_action='balance_request' THEN
    IF o.payment_status<>'VERIFIED' OR o.fulfilled_at IS NOT NULL OR o.balance_paid_at IS NOT NULL OR o.ready_at IS NOT NULL THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    IF o.deposit_due_cents IS NULL THEN RAISE EXCEPTION 'LEGACY_DEPOSIT_REVIEW'; END IF;
    IF p_amount IS NULL OR p_amount<o.deposit_due_cents OR p_amount>100000000 OR coalesce(p_hash,'')!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_TOTAL'; END IF;
    UPDATE orders SET final_total_cents=p_amount,balance_due_cents=p_amount-o.deposit_due_cents,balance_token_hash=p_hash,balance_requested_at=now(),balance_token_expires_at=now()+interval '30 days' WHERE id=p_id;
    details:=jsonb_build_object('final_total_cents',p_amount,'balance_due_cents',p_amount-o.deposit_due_cents);
  ELSIF p_action='legacy_deposit' THEN
    IF o.payment_status<>'VERIFIED' OR o.deposit_due_cents IS NOT NULL OR p_amount IS NULL OR p_amount<0 OR p_amount>100000000 OR coalesce(length(btrim(p_reference)),0)=0 THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    UPDATE orders SET deposit_due_cents=p_amount,payment_reference=btrim(p_reference),deposit_verified_at=now(),deposit_verified_by=p_actor WHERE id=p_id;
    details:=jsonb_build_object('amount_cents',p_amount,'reference',p_reference);
  ELSIF p_action='balance_paid' THEN
    IF o.balance_paid_at IS NOT NULL THEN RETURN; END IF;
    IF o.payment_status<>'VERIFIED' OR o.balance_due_cents IS NULL OR p_amount IS DISTINCT FROM o.balance_due_cents OR coalesce(length(btrim(p_reference)),0)=0 THEN RAISE EXCEPTION 'PAYMENT_MISMATCH'; END IF;
    UPDATE orders SET balance_paid_at=now(),balance_reference=btrim(p_reference) WHERE id=p_id;
    details:=jsonb_build_object('amount_cents',p_amount,'reference',p_reference);
  ELSIF p_action='ready' THEN
    IF o.ready_at IS NOT NULL THEN RETURN; END IF;
    IF o.payment_status<>'VERIFIED' OR o.final_total_cents IS NULL OR o.deposit_due_cents IS NULL OR o.balance_due_cents IS NULL OR o.final_total_cents<>o.deposit_due_cents+o.balance_due_cents OR (o.balance_due_cents>0 AND o.balance_paid_at IS NULL) THEN RAISE EXCEPTION 'NOT_FULLY_PAID'; END IF;
    UPDATE orders SET ready_at=now() WHERE id=p_id;
  ELSIF p_action='fulfil' THEN
    IF o.fulfilled_at IS NOT NULL THEN RETURN; END IF;
    IF o.payment_status<>'VERIFIED' OR o.ready_at IS NULL OR o.final_total_cents IS NULL OR o.deposit_due_cents IS NULL OR o.balance_due_cents IS NULL OR o.final_total_cents<>o.deposit_due_cents+o.balance_due_cents OR (o.balance_due_cents>0 AND o.balance_paid_at IS NULL) OR coalesce(length(btrim(p_reference)),0)=0 THEN RAISE EXCEPTION 'NOT_READY'; END IF;
    UPDATE orders SET fulfilled_at=now(),fulfilled_by=p_actor,received_by=btrim(p_reference) WHERE id=p_id;
    details:=jsonb_build_object('received_by',p_reference,'method',o.fulfilment_method);
  ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  INSERT INTO order_activity(order_id,action,actor,metadata) VALUES(p_id,p_action,p_actor,details);
END $$;
REVOKE ALL ON FUNCTION public.order_operation(uuid,text,text,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.order_operation(uuid,text,text,integer,text,text) TO service_role;
COMMIT;
