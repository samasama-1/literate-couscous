-- REVIEW/APPLY ONLY AFTER APPROVAL, as postgres. Requires order_fulfilment.sql.
-- Adds no sample data and changes no customer order/payment records.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $$ BEGIN IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run as postgres administrator'; END IF; END $$;
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS admin_revision integer NOT NULL DEFAULT 1;
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
  IF cap<(SELECT coalesce(sum(quantity),0) FROM public.orders WHERE batch_id=bid AND payment_status<>'REFUNDED') THEN RAISE EXCEPTION 'BATCH_CAPACITY_TOO_LOW'; END IF;
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
CREATE OR REPLACE FUNCTION public.admin_delete_empty_batch(p_id uuid,p_revision integer,p_confirmation text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b public.batches;
BEGIN
  IF p_confirmation IS DISTINCT FROM 'DELETE' THEN RAISE EXCEPTION 'DELETE_CONFIRMATION_REQUIRED'; END IF;
  SELECT * INTO b FROM public.batches WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR b.admin_revision<>p_revision THEN RAISE EXCEPTION 'BATCH_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM public.orders WHERE batch_id=p_id) THEN RAISE EXCEPTION 'BATCH_HAS_ORDERS'; END IF;
  DELETE FROM public.batches WHERE id=p_id;
  -- Retain catalog products; another workflow may reference them. Never delete orders.
  RETURN p_id;
END $$;
ALTER FUNCTION public.admin_save_batch(jsonb) OWNER TO postgres;
ALTER FUNCTION public.admin_delete_empty_batch(uuid,integer,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_save_batch(jsonb),public.admin_delete_empty_batch(uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_batch(jsonb),public.admin_delete_empty_batch(uuid,integer,text) TO service_role;
COMMIT;
