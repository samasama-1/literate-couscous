-- Apply separately as postgres AFTER verified_batch_capacity.sql and existing order migrations.
-- No automatic procurement, price locking, customer messages or changes to existing quotes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $$BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres administrator'; END IF;
 IF to_regclass('public.batch_verified_capacity') IS NULL THEN RAISE EXCEPTION 'INSTALL_VERIFIED_CAPACITY_FIRST'; END IF;
END$$;
ALTER TABLE public.batches
 ADD COLUMN IF NOT EXISTS minimum_verified_units integer,
 ADD COLUMN IF NOT EXISTS tier_2_start integer,
 ADD COLUMN IF NOT EXISTS tier_3_start integer,
 ADD COLUMN IF NOT EXISTS proceed_approved_at timestamptz,
 ADD COLUMN IF NOT EXISTS proceed_verified_units integer;
-- Existing batches are intentionally not guessed from product names or percentages.
-- Keep them editable/fulfillable, but block NEW orders until their configuration is reviewed.
CREATE TABLE IF NOT EXISTS public.batch_proceed_approvals(
 batch_id uuid PRIMARY KEY REFERENCES public.batches(id),
 actor text NOT NULL CHECK(length(btrim(actor)) BETWEEN 1 AND 254),
 verified_units integer NOT NULL CHECK(verified_units>0),
 approved_at timestamptz NOT NULL
);
ALTER TABLE public.batch_proceed_approvals OWNER TO postgres;
ALTER TABLE public.batch_proceed_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.batch_proceed_approvals FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX IF NOT EXISTS batch_pricing_order_history ON public.orders(batch_id);

CREATE OR REPLACE FUNCTION public.guard_batch_pricing_rules()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
BEGIN
 IF NEW.minimum_verified_units IS NULL THEN
  IF NEW.tier_2_start IS NOT NULL OR NEW.tier_3_start IS NOT NULL THEN RAISE EXCEPTION 'INVALID_BATCH_PRICING'; END IF;
 ELSE
  IF NEW.minimum_verified_units NOT BETWEEN 1 AND NEW.target_capacity
   OR ((NEW.tier_2_price IS NULL)<>(NEW.tier_2_start IS NULL))
   OR ((NEW.tier_3_price IS NULL)<>(NEW.tier_3_start IS NULL))
   OR (NEW.tier_2_start IS NOT NULL AND NEW.tier_2_start NOT BETWEEN 2 AND NEW.target_capacity)
   OR (NEW.tier_3_start IS NOT NULL AND (NEW.tier_2_start IS NULL OR NEW.tier_3_start<=NEW.tier_2_start OR NEW.tier_3_start>NEW.target_capacity))
   THEN RAISE EXCEPTION 'INVALID_BATCH_PRICING'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.minimum_verified_units,NEW.tier_2_start,NEW.tier_3_start)IS DISTINCT FROM ROW(OLD.minimum_verified_units,OLD.tier_2_start,OLD.tier_3_start)
   AND (OLD.proceed_approved_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.orders WHERE batch_id=NEW.id LIMIT 1))
   THEN RAISE EXCEPTION 'BATCH_PRICING_LOCKED'; END IF;
  IF ROW(NEW.proceed_approved_at,NEW.proceed_verified_units)IS DISTINCT FROM ROW(OLD.proceed_approved_at,OLD.proceed_verified_units)
   AND coalesce(current_setting('samasama.approve_batch',true),'')<>'on' THEN RAISE EXCEPTION 'USE_BATCH_APPROVAL'; END IF;
 ELSIF NEW.proceed_approved_at IS NOT NULL OR NEW.proceed_verified_units IS NOT NULL THEN RAISE EXCEPTION 'USE_BATCH_APPROVAL';
 END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS guard_batch_pricing_rules ON public.batches;
CREATE TRIGGER guard_batch_pricing_rules BEFORE INSERT OR UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.guard_batch_pricing_rules();

CREATE OR REPLACE FUNCTION public.guard_order_batch_pricing()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE b public.batches;c public.batch_verified_capacity;
BEGIN
 SELECT * INTO b FROM public.batches WHERE id=NEW.batch_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_NOT_FOUND'; END IF;
 IF TG_OP='INSERT' THEN
  IF b.minimum_verified_units IS NULL THEN RAISE EXCEPTION 'BATCH_PRICING_UNCONFIGURED'; END IF;
 END IF;
 IF NEW.final_total_cents IS NOT NULL AND b.minimum_verified_units IS NOT NULL
  AND (TG_OP='INSERT' OR NEW.final_total_cents IS DISTINCT FROM OLD.final_total_cents) THEN
  -- Historical unconfigured batches retain existing financial/fulfilment workflows.
  -- New configured batches require an explicit approval and a currently met minimum.
  SELECT * INTO c FROM public.batch_verified_capacity WHERE batch_id=b.id FOR SHARE;
  IF b.proceed_approved_at IS NULL OR c.verified_units IS NULL OR c.verified_units<b.minimum_verified_units THEN RAISE EXCEPTION 'BATCH_PROCEED_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS guard_order_batch_pricing ON public.orders;
CREATE TRIGGER guard_order_batch_pricing BEFORE INSERT OR UPDATE OF final_total_cents ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_batch_pricing();

CREATE OR REPLACE FUNCTION public.admin_approve_batch(p_id uuid,p_revision integer,p_actor text)RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE b public.batches;c public.batch_verified_capacity;n timestamptz;
BEGIN
 IF coalesce(length(btrim(p_actor)),0)NOT BETWEEN 1 AND 254 THEN RAISE EXCEPTION 'INVALID_ACTOR'; END IF;
 SELECT * INTO b FROM public.batches WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_NOT_FOUND'; END IF;
 IF b.proceed_approved_at IS NOT NULL THEN RETURN 'already_approved'; END IF;
 IF p_revision IS DISTINCT FROM b.admin_revision THEN RAISE EXCEPTION 'BATCH_CHANGED'; END IF;
 IF b.minimum_verified_units IS NULL OR b.status NOT IN('OPEN','CLOSED') THEN RAISE EXCEPTION 'BATCH_PRICING_UNCONFIGURED'; END IF;
 SELECT * INTO c FROM public.batch_verified_capacity WHERE batch_id=p_id FOR UPDATE;
 IF NOT FOUND OR c.verified_units<b.minimum_verified_units THEN RAISE EXCEPTION 'BATCH_MINIMUM_NOT_MET'; END IF;
 n:=clock_timestamp();
 INSERT INTO public.batch_proceed_approvals(batch_id,actor,verified_units,approved_at)VALUES(p_id,p_actor,c.verified_units,n);
 PERFORM set_config('samasama.approve_batch','on',true);
 UPDATE public.batches SET proceed_approved_at=n,proceed_verified_units=c.verified_units,admin_revision=admin_revision+1 WHERE id=p_id;
 PERFORM set_config('samasama.approve_batch','off',true);
 RETURN 'approved';
END$$;

CREATE OR REPLACE VIEW public.batch_progress_view WITH(security_barrier=true,security_invoker=false)AS
SELECT b.id AS batch_id,b.product_id,b.status,b.target_capacity,b.deposit_amount,b.tier_1_price,b.tier_2_price,b.tier_3_price,b.closes_at,b.created_at,
 c.verified_units AS confirmed_quantity,(c.capacity-c.verified_units)::integer AS remaining_capacity,
 b.minimum_verified_units,b.tier_2_start,b.tier_3_start,b.proceed_approved_at,b.proceed_verified_units
FROM public.batches b JOIN public.batch_verified_capacity c ON c.batch_id=b.id;
ALTER VIEW public.batch_progress_view OWNER TO postgres;
REVOKE ALL ON public.batch_progress_view FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.batch_progress_view TO anon,authenticated,service_role;

-- The updated admin_save_batch definition follows, retaining the established validation,
-- price/history locks, private capacity check and product-copy-on-edit protections.
CREATE OR REPLACE FUNCTION public.admin_save_batch(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b public.batches; pr public.products; bid uuid; pid uuid; cap integer; dep bigint; t1 bigint; t2 bigint; t3 bigint; retail bigint; close_time timestamptz; batch_status text; has_orders boolean; minimum integer; start2 integer; start3 integer;
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
  IF (p->>'minimum_verified_units' IS NOT NULL AND p->>'minimum_verified_units'!~'^[0-9]{1,6}$')
    OR (p->>'tier_2_start' IS NOT NULL AND p->>'tier_2_start'!~'^[0-9]{1,6}$')
    OR (p->>'tier_3_start' IS NOT NULL AND p->>'tier_3_start'!~'^[0-9]{1,6}$') THEN RAISE EXCEPTION 'INVALID_BATCH_PRICING'; END IF;
  minimum:=(p->>'minimum_verified_units')::integer; start2:=(p->>'tier_2_start')::integer; start3:=(p->>'tier_3_start')::integer;
  IF minimum IS NULL THEN
    IF p->>'id' IS NULL OR start2 IS NOT NULL OR start3 IS NOT NULL THEN RAISE EXCEPTION 'INVALID_BATCH_PRICING'; END IF;
  ELSIF minimum NOT BETWEEN 1 AND cap OR ((t2 IS NULL)<>(start2 IS NULL)) OR ((t3 IS NULL)<>(start3 IS NULL))
    OR(start2 IS NOT NULL AND start2 NOT BETWEEN 2 AND cap)
    OR(start3 IS NOT NULL AND(start2 IS NULL OR start3<=start2 OR start3>cap)) THEN RAISE EXCEPTION 'INVALID_BATCH_PRICING'; END IF;
  close_time:=(p->>'closes_at')::timestamptz;batch_status:=p->>'status';
  IF close_time IS NULL OR NOT isfinite(close_time) OR batch_status IS NULL OR batch_status NOT IN ('OPEN','CLOSED','DELIVERED') OR (batch_status='OPEN' AND close_time<=statement_timestamp()) THEN RAISE EXCEPTION 'INVALID_CLOSING_TIME'; END IF;
  IF p->>'id' IS NULL THEN
    INSERT INTO public.products(name,description,retail_price,image_url,features) VALUES(btrim(p->>'name'),btrim(p->>'description'),retail/100.0,p->>'image_url',p->'features') RETURNING id INTO pid;
    INSERT INTO public.batches(product_id,status,target_capacity,deposit_amount,tier_1_price,tier_2_price,tier_3_price,closes_at,minimum_verified_units,tier_2_start,tier_3_start) VALUES(pid,batch_status,cap,dep/100.0,t1/100.0,t2/100.0,t3/100.0,close_time,minimum,start2,start3) RETURNING id INTO bid;
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
  UPDATE public.batches SET product_id=pid,status=batch_status,target_capacity=cap,deposit_amount=dep/100.0,tier_1_price=t1/100.0,tier_2_price=t2/100.0,tier_3_price=t3/100.0,closes_at=close_time,minimum_verified_units=minimum,tier_2_start=start2,tier_3_start=start3,admin_revision=admin_revision+1 WHERE id=bid;
  RETURN bid;
END $$;

ALTER FUNCTION public.admin_save_batch(jsonb)OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_save_batch(jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_batch(jsonb)TO service_role;
DO $$DECLARE f regprocedure;BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_catalog.pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('guard_batch_pricing_rules','guard_order_batch_pricing','admin_approve_batch')LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
 IF f::text LIKE '%admin_approve_batch%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f); END IF;
 END LOOP;
END$$;
COMMIT;
