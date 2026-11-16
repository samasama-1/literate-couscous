-- REVIEW/APPLY SEPARATELY as postgres after batch_management.sql and current order migrations.
-- No reservations, expiry jobs, automatic refunds, sample batches or email sends.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $$BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres administrator'; END IF; END$$;
-- One-time maintenance reconciliation only; block writes while taking the initial snapshot.
LOCK TABLE public.orders,public.batches IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.batch_verified_capacity(
 batch_id uuid PRIMARY KEY REFERENCES public.batches(id) ON DELETE CASCADE,
 capacity integer NOT NULL CHECK(capacity>0),
 verified_units integer NOT NULL DEFAULT 0 CHECK(verified_units>=0 AND verified_units<=capacity)
);
ALTER TABLE public.batch_verified_capacity OWNER TO postgres;
ALTER TABLE public.batch_verified_capacity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.batch_verified_capacity FROM PUBLIC,anon,authenticated,service_role;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.batches WHERE target_capacity IS NULL OR target_capacity<=0)
 OR EXISTS(SELECT 1 FROM public.orders WHERE payment_status='VERIFIED' AND (quantity IS NULL OR quantity<=0))
 OR EXISTS(SELECT 1 FROM public.orders o LEFT JOIN public.batches b ON b.id=o.batch_id WHERE o.payment_status='VERIFIED' AND b.id IS NULL)
 THEN RAISE EXCEPTION 'CAPACITY_DATA_REVIEW'; END IF;
 IF EXISTS(SELECT 1 FROM public.batches b JOIN public.orders o ON o.batch_id=b.id AND o.payment_status='VERIFIED' GROUP BY b.id,b.target_capacity HAVING sum(o.quantity)>b.target_capacity)
 THEN RAISE EXCEPTION 'EXISTING_BATCH_OVER_CAPACITY'; END IF;
END$$;
INSERT INTO public.batch_verified_capacity(batch_id,capacity,verified_units)
 SELECT b.id,b.target_capacity,coalesce(sum(o.quantity),0)::integer FROM public.batches b
 LEFT JOIN public.orders o ON o.batch_id=b.id AND o.payment_status='VERIFIED' GROUP BY b.id,b.target_capacity
 ON CONFLICT(batch_id)DO UPDATE SET capacity=excluded.capacity,verified_units=excluded.verified_units;

CREATE OR REPLACE FUNCTION public.sync_batch_capacity_limit()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
BEGIN
 IF NEW.target_capacity IS NULL OR NEW.target_capacity<=0 THEN RAISE EXCEPTION 'INVALID_BATCH_CAPACITY'; END IF;
 IF TG_OP='INSERT' THEN
  INSERT INTO public.batch_verified_capacity(batch_id,capacity)VALUES(NEW.id,NEW.target_capacity);
 ELSE
  UPDATE public.batch_verified_capacity SET capacity=NEW.target_capacity WHERE batch_id=NEW.id AND verified_units<=NEW.target_capacity;
  IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_CAPACITY_TOO_LOW'; END IF;
 END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS sync_batch_capacity_limit ON public.batches;
CREATE TRIGGER sync_batch_capacity_limit AFTER INSERT OR UPDATE OF target_capacity ON public.batches FOR EACH ROW EXECUTE FUNCTION public.sync_batch_capacity_limit();

CREATE OR REPLACE FUNCTION public.guard_available_batch_capacity()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE c public.batch_verified_capacity;
BEGIN
 -- A pending request does not reserve anything. This indexed read only avoids accepting
 -- obviously impossible new requests; verification below remains authoritative after races.
 SELECT * INTO c FROM public.batch_verified_capacity WHERE batch_id=NEW.batch_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPACITY_STATE_UNAVAILABLE'; END IF;
 IF NEW.quantity IS NULL OR NEW.quantity<=0 THEN RAISE EXCEPTION 'INVALID_ORDER_QUANTITY'; END IF;
 IF NEW.quantity>c.capacity-c.verified_units THEN RAISE EXCEPTION 'BATCH_CAPACITY_EXCEEDED'; END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS guard_available_batch_capacity ON public.orders;
CREATE TRIGGER guard_available_batch_capacity BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_available_batch_capacity();

CREATE OR REPLACE FUNCTION public.track_verified_batch_capacity()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE bid uuid;delta integer;before_units integer:=0;after_units integer:=0;
BEGIN
 IF TG_OP<>'INSERT' THEN
  bid:=OLD.batch_id;
  IF OLD.payment_status='VERIFIED' THEN before_units:=OLD.quantity; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  IF TG_OP='UPDATE' AND OLD.payment_status='VERIFIED' AND ROW(NEW.quantity,NEW.batch_id)IS DISTINCT FROM ROW(OLD.quantity,OLD.batch_id)
  THEN RAISE EXCEPTION 'VERIFIED_ORDER_DETAILS_LOCKED'; END IF;
  IF TG_OP='UPDATE' AND NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
   IF before_units<>0 OR NEW.payment_status='VERIFIED' THEN RAISE EXCEPTION 'VERIFIED_ORDER_DETAILS_LOCKED'; END IF;
  END IF;
  bid:=NEW.batch_id;
  IF NEW.payment_status='VERIFIED' THEN
   IF NEW.quantity IS NULL OR NEW.quantity<=0 THEN RAISE EXCEPTION 'INVALID_ORDER_QUANTITY'; END IF;
   after_units:=NEW.quantity;
  END IF;
 END IF;
 delta:=after_units-before_units;
 IF delta=0 THEN RETURN NULL; END IF;
 -- A single conditional row UPDATE serializes competing confirmations and capacity edits.
 -- PostgreSQL rechecks this condition against the latest locked row after waiting.
 UPDATE public.batch_verified_capacity SET verified_units=verified_units+delta
 WHERE batch_id=bid AND verified_units+delta BETWEEN 0 AND capacity;
 IF NOT FOUND THEN
  IF delta>0 THEN RAISE EXCEPTION 'BATCH_CAPACITY_EXCEEDED'; ELSE RAISE EXCEPTION 'CAPACITY_STATE_UNAVAILABLE'; END IF;
 END IF;
 RETURN NULL;
END$$;
DROP TRIGGER IF EXISTS track_verified_batch_capacity ON public.orders;
CREATE TRIGGER track_verified_batch_capacity AFTER INSERT OR DELETE OR UPDATE OF payment_status,quantity,batch_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.track_verified_batch_capacity();

-- Keep the exact existing public view shape, with no customer data or table-wide order sum.
CREATE OR REPLACE VIEW public.batch_progress_view WITH(security_barrier=true,security_invoker=false)AS
SELECT b.id AS batch_id,b.product_id,b.status,b.target_capacity,b.deposit_amount,b.tier_1_price,b.tier_2_price,b.tier_3_price,b.closes_at,b.created_at,
 c.verified_units AS confirmed_quantity,(c.capacity-c.verified_units)::integer AS remaining_capacity
FROM public.batches b JOIN public.batch_verified_capacity c ON c.batch_id=b.id;
ALTER VIEW public.batch_progress_view OWNER TO postgres;
REVOKE ALL ON public.batch_progress_view FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.batch_progress_view TO anon,authenticated,service_role;

-- Pending requests are not reservations when editing capacity either.
CREATE OR REPLACE FUNCTION public.admin_save_batch(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b public.batches; pr public.products; bid uuid; pid uuid; cap integer; dep bigint; t1 bigint; t2 bigint; t3 bigint; retail bigint; close_time timestamptz; batch_status text; has_orders boolean;
BEGIN
  IF p IS NULL OR jsonb_typeof(p)<>'object' OR coalesce(length(btrim(p->>'name')),0) NOT BETWEEN 1 AND 150
    OR coalesce(length(btrim(p->>'description')),0) NOT BETWEEN 1 AND 10000
    OR coalesce(p->>'target_capacity','')!~'^[0-9]{1,6}$'
    OR coalesce(p->>'deposit_cents','')!~'^[0-9]{1,9}$' OR coalesce(p->>'tier_1_cents','')!~'^[0-9]{1,9}$'
    OR jsonb_typeof(p->'features') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;
  IF jsonb_array_length(p->'features')>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'features') f WHERE jsonb_typeof(f)<>'string' OR length(f#>>'{}')>300) THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;
  IF p->>'image_url' IS NOT NULL AND (length(p->>'image_url')>2048 OR p->>'image_url' ~ '[[:space:]\\]' OR NOT (p->>'image_url' ~ '^https://[^/@]+(/|$)' OR p->>'image_url' ~ '^/[^/]')) THEN RAISE EXCEPTION 'INVALID_IMAGE'; END IF;
  cap:=(p->>'target_capacity')::integer;dep:=(p->>'deposit_cents')::bigint;t1:=(p->>'tier_1_cents')::bigint;
  IF p->>'tier_2_cents' IS NOT NULL THEN IF p->>'tier_2_cents'!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;t2:=(p->>'tier_2_cents')::bigint;END IF;
  IF p->>'tier_3_cents' IS NOT NULL THEN IF p->>'tier_3_cents'!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;t3:=(p->>'tier_3_cents')::bigint;END IF;
  IF p->>'retail_price_cents' IS NOT NULL THEN IF p->>'retail_price_cents'!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;retail:=(p->>'retail_price_cents')::bigint;END IF;
  IF cap NOT BETWEEN 1 AND 100000 OR dep>100000000 OR t1 NOT BETWEEN 1 AND 100000000 OR retail>100000000
    OR (t2 IS NOT NULL AND (t2<=0 OR t2>t1)) OR (t3 IS NOT NULL AND (t2 IS NULL OR t3<=0 OR t3>t2)) OR dep>coalesce(t3,t2,t1) THEN RAISE EXCEPTION 'INVALID_PRICES'; END IF;
  close_time:=(p->>'closes_at')::timestamptz;batch_status:=p->>'status';
  IF close_time IS NULL OR NOT isfinite(close_time) OR batch_status IS NULL OR batch_status NOT IN ('OPEN','CLOSED','DELIVERED') OR (batch_status='OPEN' AND close_time<=statement_timestamp()) THEN RAISE EXCEPTION 'INVALID_CLOSING_TIME'; END IF;
  IF p->>'id' IS NULL THEN
    INSERT INTO public.products(name,description,retail_price,image_url,features) VALUES(btrim(p->>'name'),btrim(p->>'description'),retail/100.0,p->>'image_url',p->'features') RETURNING id INTO pid;
    INSERT INTO public.batches(product_id,status,target_capacity,deposit_amount,tier_1_price,tier_2_price,tier_3_price,closes_at) VALUES(pid,batch_status,cap,dep/100.0,t1/100.0,t2/100.0,t3/100.0,close_time) RETURNING id INTO bid;
    RETURN bid;
  END IF;
  bid:=(p->>'id')::uuid;
  -- Same batch lock conflicts with registration's FOR SHARE lock: no pricing/delete race.
  SELECT * INTO b FROM public.batches WHERE id=bid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_NOT_FOUND'; END IF;
  IF coalesce(p->>'revision','')!~'^[0-9]{1,9}$' OR (p->>'revision')::integer<>b.admin_revision THEN RAISE EXCEPTION 'BATCH_CHANGED'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.orders WHERE batch_id=bid) INTO has_orders;
  IF has_orders AND (b.deposit_amount IS DISTINCT FROM dep/100.0 OR b.tier_1_price IS DISTINCT FROM t1/100.0 OR b.tier_2_price IS DISTINCT FROM t2/100.0 OR b.tier_3_price IS DISTINCT FROM t3/100.0) THEN RAISE EXCEPTION 'BATCH_PRICES_LOCKED'; END IF;
  IF cap<(SELECT verified_units FROM public.batch_verified_capacity WHERE batch_id=bid) THEN RAISE EXCEPTION 'BATCH_CAPACITY_TOO_LOW'; END IF;
  IF batch_status='DELIVERED' AND EXISTS(SELECT 1 FROM public.orders WHERE batch_id=bid AND payment_status<>'REFUNDED' AND fulfilled_at IS NULL) THEN RAISE EXCEPTION 'BATCH_OUTSTANDING_ORDERS'; END IF;
  SELECT * INTO pr FROM public.products WHERE id=b.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  pid:=pr.id;
  -- Copy on edit if the catalog product is shared; never change another batch's page.
  IF EXISTS(SELECT 1 FROM public.batches WHERE product_id=pid AND id<>bid) THEN
    INSERT INTO public.products(name,description,retail_price,image_url,features) VALUES(btrim(p->>'name'),btrim(p->>'description'),retail/100.0,p->>'image_url',p->'features') RETURNING id INTO pid;
  ELSE
    UPDATE public.products SET name=btrim(p->>'name'),description=btrim(p->>'description'),retail_price=retail/100.0,image_url=p->>'image_url',features=p->'features' WHERE id=pid;
  END IF;
  UPDATE public.batches SET product_id=pid,status=batch_status,target_capacity=cap,deposit_amount=dep/100.0,tier_1_price=t1/100.0,tier_2_price=t2/100.0,tier_3_price=t3/100.0,closes_at=close_time,admin_revision=admin_revision+1 WHERE id=bid;
  RETURN bid;
END $$;

ALTER FUNCTION public.admin_save_batch(jsonb)OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_save_batch(jsonb)FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_batch(jsonb)TO service_role;
DO $$DECLARE f regprocedure;BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_catalog.pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('sync_batch_capacity_limit','guard_available_batch_capacity','track_verified_batch_capacity')LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
 END LOOP;
END$$;
COMMIT;
