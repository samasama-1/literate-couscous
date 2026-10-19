-- Run AFTER order_fulfilment.sql. Temporary immutable snapshots, server access only.
BEGIN;
CREATE TABLE IF NOT EXISTS public.operations_export_snapshots (
  id uuid PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT statement_timestamp()+interval '2 hours'
);
CREATE TABLE IF NOT EXISTS public.operations_export_rows (
  snapshot_id uuid NOT NULL REFERENCES public.operations_export_snapshots(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('orders','activity')),
  ordinal bigint NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY(snapshot_id,kind,ordinal)
);
ALTER TABLE public.operations_export_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_export_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operations_export_snapshots,public.operations_export_rows FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.operations_export_snapshots,public.operations_export_rows TO service_role;

CREATE INDEX IF NOT EXISTS operations_export_expiry_idx ON public.operations_export_snapshots(expires_at);
ALTER TABLE public.operations_export_snapshots
  ADD COLUMN IF NOT EXISTS orders_count bigint,
  ADD COLUMN IF NOT EXISTS activity_count bigint,
  -- Legacy rows are version 1; never relabel them as minimized data.
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS public.operations_export_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  last_started_at timestamptz
);
INSERT INTO public.operations_export_control(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.operations_export_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operations_export_control FROM PUBLIC,anon,authenticated,service_role;

-- Cleanup is not an Edge RPC. Only the trusted SQL scheduler/owner can run it.
CREATE OR REPLACE FUNCTION public.cleanup_operations_exports()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE removed integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(817430122) THEN RETURN 0; END IF;
  DELETE FROM public.operations_export_snapshots WHERE expires_at<=statement_timestamp();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.cleanup_operations_exports() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.start_operations_export(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF p_id IS NULL THEN RAISE EXCEPTION 'INVALID_EXPORT_ID'; END IF;
  -- Fail fast instead of queuing costly requests on a database connection.
  IF NOT pg_try_advisory_xact_lock(817430122) THEN RAISE EXCEPTION 'EXPORT_BUSY'; END IF;
  DELETE FROM public.operations_export_snapshots WHERE expires_at<=statement_timestamp();
  IF EXISTS(SELECT 1 FROM public.operations_export_snapshots WHERE id=p_id AND schema_version<>3) THEN RAISE EXCEPTION 'EXPORT_SCHEMA_CHANGED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.operations_export_snapshots WHERE id=p_id) THEN
    IF (SELECT last_started_at FROM public.operations_export_control WHERE singleton) > statement_timestamp()-interval '5 minutes' THEN RAISE EXCEPTION 'EXPORT_COOLDOWN'; END IF;
    IF (SELECT count(*) FROM public.operations_export_snapshots)>=12 THEN RAISE EXCEPTION 'EXPORT_BUSY'; END IF;
    -- Enforce the consumer's bound BEFORE materialising a customer-data copy.
    -- LIMIT bounds counting work; exports never silently truncate the dataset.
    IF (SELECT count(*) FROM (SELECT 1 FROM public.orders LIMIT 50001) q)>50000
      OR (SELECT count(*) FROM (SELECT 1 FROM public.order_activity LIMIT 50001) q)>50000 THEN
      RAISE EXCEPTION 'EXPORT_TOO_LARGE';
    END IF;
    INSERT INTO public.operations_export_snapshots(id,schema_version) VALUES(p_id,3);
    -- One statement captures both datasets from the same database snapshot.
    INSERT INTO public.operations_export_rows(snapshot_id,kind,ordinal,data)
    -- Warehouse v3: approved operational email/phone, but no addresses,
    -- transaction references or actor/recipient details. Dispatch stays in admin.
    SELECT p_id,'orders',row_number() OVER(ORDER BY o.created_at,o.id),jsonb_build_array(
      o.order_code,o.batch_id,p.name,o.customer_name,o.fulfilment_method,o.quantity,o.payment_status,
      o.deposit_due_cents,o.deposit_verified_at,o.final_total_cents,o.balance_due_cents,
      o.balance_requested_at,o.balance_paid_at,o.ready_at,o.fulfilled_at,o.created_at,
      CASE
        WHEN o.payment_status='REFUNDED' THEN 'refunded'
        WHEN o.fulfilled_at IS NOT NULL THEN 'fulfilled'
        WHEN o.payment_status='VERIFIED' AND o.ready_at IS NOT NULL
          AND nullif(btrim(o.order_code),'') IS NOT NULL AND o.quantity>0
          AND o.final_total_cents IS NOT NULL AND o.deposit_due_cents IS NOT NULL
          AND o.balance_due_cents IS NOT NULL AND o.final_total_cents=o.deposit_due_cents::bigint+o.balance_due_cents::bigint
          AND (o.balance_due_cents=0 OR o.balance_paid_at IS NOT NULL) THEN 'ready_for_handover'
        ELSE 'not_cleared'
      END,o.customer_email,o.customer_phone)
    FROM public.orders o LEFT JOIN public.batches b ON b.id=o.batch_id LEFT JOIN public.products p ON p.id=b.product_id
    UNION ALL
    SELECT p_id,'activity',row_number() OVER(ORDER BY a.created_at,a.id),jsonb_build_array(
      o.order_code,a.action,a.created_at,
      CASE WHEN a.metadata->>'amount_cents' ~ '^[0-9]{1,9}$' THEN (a.metadata->>'amount_cents')::bigint END,
      CASE WHEN a.metadata->>'final_total_cents' ~ '^[0-9]{1,9}$' THEN (a.metadata->>'final_total_cents')::bigint END,
      CASE WHEN a.metadata->>'balance_due_cents' ~ '^[0-9]{1,9}$' THEN (a.metadata->>'balance_due_cents')::bigint END,
      o.fulfilment_method)
    FROM public.order_activity a JOIN public.orders o ON o.id=a.order_id
    WHERE a.action IN ('deposit','legacy_deposit','balance_request','balance_paid','ready','fulfil');
    -- Recheck actual captured counts to cover concurrent inserts after preflight.
    IF EXISTS(SELECT 1 FROM public.operations_export_rows WHERE snapshot_id=p_id GROUP BY kind HAVING count(*)>50000) THEN
      RAISE EXCEPTION 'EXPORT_TOO_LARGE';
    END IF;
    UPDATE public.operations_export_control SET last_started_at=statement_timestamp() WHERE singleton;
  END IF;
  -- Cache once, including older snapshots migrated with NULL counts. Retries do
  -- not scan all exported rows just to return the same manifest.
  UPDATE public.operations_export_snapshots s SET
    orders_count=(SELECT count(*) FROM public.operations_export_rows WHERE snapshot_id=s.id AND kind='orders'),
    activity_count=(SELECT count(*) FROM public.operations_export_rows WHERE snapshot_id=s.id AND kind='activity')
    WHERE s.id=p_id AND (s.orders_count IS NULL OR s.activity_count IS NULL);
  SELECT jsonb_build_object('id',s.id,'captured_at',s.captured_at,'expires_at',s.expires_at,
    'orders',s.orders_count,'activity',s.activity_count,'schema_version',s.schema_version,'profile','warehouse_v3')
  INTO result FROM public.operations_export_snapshots s WHERE s.id=p_id;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.page_operations_export(p_id uuid,p_kind text,p_after bigint DEFAULT 0,p_limit integer DEFAULT 250)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('orders','activity') OR p_after IS NULL OR p_after<0 OR p_limit IS NULL OR p_limit<1 OR p_limit>250 THEN RAISE EXCEPTION 'INVALID_PAGE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.operations_export_snapshots WHERE id=p_id AND expires_at>statement_timestamp()) THEN RAISE EXCEPTION 'EXPORT_EXPIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.operations_export_snapshots WHERE id=p_id AND schema_version<>3) THEN RAISE EXCEPTION 'EXPORT_SCHEMA_CHANGED'; END IF;
  SELECT jsonb_build_object('rows',coalesce(jsonb_agg(data ORDER BY ordinal),'[]'::jsonb),'next',coalesce(max(ordinal),p_after)) INTO result
  FROM (SELECT ordinal,data FROM public.operations_export_rows WHERE snapshot_id=p_id AND kind=p_kind AND ordinal>p_after ORDER BY ordinal LIMIT p_limit) r;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.start_operations_export(uuid),public.page_operations_export(uuid,text,bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_operations_export(uuid),public.page_operations_export(uuid,text,bigint,integer) TO service_role;
-- Pin ownership explicitly; CREATE OR REPLACE otherwise preserves a prior owner.
-- Apply as the trusted Supabase postgres administrator, never a browser role.
ALTER TABLE public.operations_export_snapshots OWNER TO postgres;
ALTER TABLE public.operations_export_rows OWNER TO postgres;
ALTER TABLE public.operations_export_control OWNER TO postgres;
ALTER FUNCTION public.start_operations_export(uuid) OWNER TO postgres;
ALTER FUNCTION public.page_operations_export(uuid,text,bigint,integer) OWNER TO postgres;
ALTER FUNCTION public.cleanup_operations_exports() OWNER TO postgres;
COMMIT;
