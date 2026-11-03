-- REVIEW ONLY. Requires collection_management.sql + order_integrations.sql.
-- Mandatory compatible app cutover: COLLECTION_AUTH_INSTALLED=true. No remote application authorized.
-- Replaces the undeployed pickup-code draft. Applying to an older draft explicitly invalidates old grants.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres';END IF;END$$;
CREATE TABLE IF NOT EXISTS public.collection_controls(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),delegated_enabled boolean NOT NULL DEFAULT false);
INSERT INTO public.collection_controls(singleton)VALUES(true)ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.order_collectors(
 order_id uuid PRIMARY KEY REFERENCES public.orders(id),id uuid NOT NULL DEFAULT gen_random_uuid(),name text NOT NULL,
 owner_email text,ready_at timestamptz,access_version integer,expires_at timestamptz NOT NULL,
 revoked_at timestamptz,used_at timestamptz,consented_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_collectors ADD COLUMN IF NOT EXISTS owner_email text,ADD COLUMN IF NOT EXISTS ready_at timestamptz,ADD COLUMN IF NOT EXISTS access_version integer,ADD COLUMN IF NOT EXISTS cleanup_after timestamptz,ADD COLUMN IF NOT EXISTS retention_hold boolean NOT NULL DEFAULT false;
-- Names-only workflow no longer uses pickup hashes/phones. Removal requires approval as part of migration.
ALTER TABLE public.order_collectors DROP COLUMN IF EXISTS code_hash,DROP COLUMN IF EXISTS phone;
CREATE TABLE IF NOT EXISTS public.order_handover_checks(
 order_id uuid PRIMARY KEY REFERENCES public.orders(id),authorisation_id uuid,identity_checked boolean NOT NULL CHECK(identity_checked),
 actor text NOT NULL,checked_at timestamptz NOT NULL,transaction_id bigint NOT NULL
);
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['collection_controls','order_collectors','order_handover_checks']LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;END$$;
GRANT SELECT ON public.order_collectors TO service_role;
-- Explicitly retire the old code-bearing RPCs, including their legacy overloads.
DROP FUNCTION IF EXISTS public.set_order_collector(uuid,integer,text,timestamptz,boolean,text,text,text,boolean);
DROP FUNCTION IF EXISTS public.fulfil_order_v2(uuid,text,text,uuid,text);
CREATE OR REPLACE FUNCTION public.invalidate_named_collector()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.customer_email IS DISTINCT FROM OLD.customer_email OR NEW.ready_at IS DISTINCT FROM OLD.ready_at OR NEW.fulfilment_method IS DISTINCT FROM OLD.fulfilment_method OR NEW.payment_status IS DISTINCT FROM OLD.payment_status OR NEW.collection_access_version IS DISTINCT FROM OLD.collection_access_version THEN
 UPDATE public.order_collectors SET revoked_at=coalesce(revoked_at,clock_timestamp())WHERE order_id=NEW.id AND used_at IS NULL;
 END IF;
 IF (NEW.fulfilled_at IS NOT NULL AND OLD.fulfilled_at IS NULL)OR(NEW.payment_status='REFUNDED'AND OLD.payment_status IS DISTINCT FROM NEW.payment_status)THEN
 UPDATE public.order_collectors SET cleanup_after=greatest(coalesce(NEW.ready_at,clock_timestamp()),coalesce(NEW.fulfilled_at,clock_timestamp()))+interval '14 days' WHERE order_id=NEW.id;
 END IF;RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS invalidate_named_collector ON public.orders;
CREATE TRIGGER invalidate_named_collector AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.invalidate_named_collector();
CREATE OR REPLACE FUNCTION public.set_named_collector(p_id uuid,p_version integer,p_email text,p_ready timestamptz,p_expires bigint,p_consent boolean,p_name text,p_revoke boolean DEFAULT false)RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE o public.orders;aid uuid;n timestamptz;enabled boolean;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_LINK_UNAVAILABLE';END IF;
 SELECT delegated_enabled INTO enabled FROM public.collection_controls WHERE singleton FOR SHARE;n:=clock_timestamp();
 IF o.collection_access_version IS DISTINCT FROM p_version OR o.customer_email IS DISTINCT FROM p_email OR o.ready_at IS DISTINCT FROM p_ready OR o.ready_at IS NULL OR o.fulfilment_method<>'collection' OR o.payment_status<>'VERIFIED' OR o.fulfilled_at IS NOT NULL OR p_expires IS NULL OR p_expires<=extract(epoch FROM n) OR p_expires>extract(epoch FROM n)+86401 THEN RAISE EXCEPTION 'OWNER_LINK_UNAVAILABLE';END IF;
 IF p_revoke IS NULL THEN RAISE EXCEPTION 'INVALID_COLLECTOR';END IF;
 IF NOT p_revoke AND NOT coalesce(enabled,false)THEN RAISE EXCEPTION 'DELEGATION_PAUSED';END IF;
 IF NOT p_revoke AND(p_consent IS DISTINCT FROM true OR coalesce(length(btrim(p_name)),0)NOT BETWEEN 1 AND 150 OR p_name~'[[:cntrl:]]')THEN RAISE EXCEPTION 'INVALID_COLLECTOR';END IF;
 -- Consume the email-delivered link under the same order lock. Reload/replay cannot change the collector.
 UPDATE public.orders SET collection_access_version=collection_access_version+1 WHERE id=p_id;
 IF p_revoke THEN UPDATE public.order_collectors SET revoked_at=coalesce(revoked_at,n)WHERE order_id=p_id RETURNING id INTO aid;
 ELSE
 aid:=gen_random_uuid();
 INSERT INTO public.order_collectors(order_id,id,name,owner_email,ready_at,access_version,expires_at,consented_at)
 VALUES(p_id,aid,btrim(p_name),p_email,p_ready,p_version+1,n+interval '30 days',n)
 ON CONFLICT(order_id)DO UPDATE SET id=EXCLUDED.id,name=EXCLUDED.name,owner_email=EXCLUDED.owner_email,ready_at=EXCLUDED.ready_at,access_version=EXCLUDED.access_version,expires_at=EXCLUDED.expires_at,revoked_at=NULL,used_at=NULL,consented_at=n;
 END IF;
 INSERT INTO public.order_activity(order_id,action,actor,metadata)VALUES(p_id,CASE WHEN p_revoke THEN 'collector_revoked' ELSE 'collector_authorised' END,'owner-email-link',jsonb_build_object('authorisation_id',aid));
 INSERT INTO public.order_integration_jobs(order_id,kind,event,payload)VALUES(p_id,'email','collector_changed',jsonb_build_object('email',o.customer_email,'name',o.customer_name,'order_code',o.order_code,'quantity',o.quantity,'method','collection','access_version',p_version+1,'ready_at',p_ready,'collector_name',CASE WHEN p_revoke THEN NULL ELSE btrim(p_name)END,'change',CASE WHEN p_revoke THEN 'revoked' ELSE 'authorised' END));
 RETURN aid;
END$$;
CREATE OR REPLACE FUNCTION public.queue_collection_access(p_id uuid,p_actor text)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE o public.orders;n timestamptz;
BEGIN
 IF coalesce(length(btrim(p_actor)),0)NOT BETWEEN 1 AND 254 THEN RAISE EXCEPTION 'ACTOR_REQUIRED';END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_id FOR UPDATE;n:=clock_timestamp();
 IF NOT FOUND OR o.ready_at IS NULL OR o.fulfilment_method<>'collection' OR o.payment_status<>'VERIFIED' OR o.fulfilled_at IS NOT NULL OR coalesce(o.customer_email,'')='' THEN RAISE EXCEPTION 'ORDER_UNAVAILABLE';END IF;
 IF EXISTS(SELECT 1 FROM public.order_integration_jobs WHERE order_id=p_id AND kind='email' AND event='collection_access' AND created_at>n-interval '5 minutes')THEN RAISE EXCEPTION 'LINK_RECENTLY_QUEUED';END IF;
 INSERT INTO public.order_integration_jobs(order_id,kind,event,payload)VALUES(p_id,'email','collection_access',jsonb_build_object('email',o.customer_email,'name',o.customer_name,'order_code',o.order_code,'quantity',o.quantity,'method','collection','access_version',o.collection_access_version,'ready_at',o.ready_at));
 INSERT INTO public.order_activity(order_id,action,actor)VALUES(p_id,'collection_link_requested',p_actor);
END$$;
CREATE INDEX IF NOT EXISTS collection_access_recent ON public.order_integration_jobs(order_id,created_at DESC)WHERE kind='email' AND event='collection_access';
CREATE OR REPLACE FUNCTION public.fulfil_order_named(p_id uuid,p_actor text,p_reference text,p_authorisation uuid DEFAULT NULL,p_identity_checked boolean DEFAULT false)RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE o public.orders;c public.order_collectors;n timestamptz;enabled boolean;
BEGIN
 IF coalesce(length(btrim(p_actor)),0)NOT BETWEEN 1 AND 254 THEN RAISE EXCEPTION 'ACTOR_REQUIRED';END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_id FOR UPDATE;n:=clock_timestamp();IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND';END IF;
 IF o.fulfilled_at IS NOT NULL THEN RETURN 'already_collected';END IF;
 IF p_authorisation IS NOT NULL AND o.fulfilment_method<>'collection'THEN RAISE EXCEPTION 'COLLECTOR_NOT_AUTHORISED';END IF;
 IF o.fulfilment_method='collection'THEN
 IF p_identity_checked IS DISTINCT FROM true THEN RAISE EXCEPTION 'IDENTITY_CHECK_REQUIRED';END IF;
 IF p_authorisation IS NOT NULL THEN
 SELECT delegated_enabled INTO enabled FROM public.collection_controls WHERE singleton FOR SHARE;IF NOT coalesce(enabled,false)THEN RAISE EXCEPTION 'DELEGATION_PAUSED';END IF;
 SELECT * INTO c FROM public.order_collectors WHERE order_id=p_id FOR UPDATE;n:=clock_timestamp();
 IF NOT FOUND OR c.id IS DISTINCT FROM p_authorisation OR c.revoked_at IS NOT NULL OR c.used_at IS NOT NULL OR c.expires_at<=n OR c.owner_email IS DISTINCT FROM o.customer_email OR c.ready_at IS DISTINCT FROM o.ready_at OR c.access_version IS DISTINCT FROM o.collection_access_version OR lower(btrim(c.name))IS DISTINCT FROM lower(btrim(p_reference))THEN RAISE EXCEPTION 'COLLECTOR_NOT_AUTHORISED';END IF;
 ELSE IF lower(btrim(o.customer_name))IS DISTINCT FROM lower(btrim(p_reference))THEN RAISE EXCEPTION 'USE_AUTHORISED_COLLECTOR';END IF;END IF;
 INSERT INTO public.order_handover_checks VALUES(p_id,p_authorisation,true,p_actor,n,txid_current())ON CONFLICT(order_id)DO UPDATE SET authorisation_id=EXCLUDED.authorisation_id,identity_checked=true,actor=EXCLUDED.actor,checked_at=EXCLUDED.checked_at,transaction_id=EXCLUDED.transaction_id;
 END IF;
 IF (public.collection_fee_summary(p_id,n)->>'due_cents')::bigint>0 THEN RAISE EXCEPTION 'STORAGE_FEES_DUE';END IF;
 -- Existing fully-paid/readiness, storage settlement and reference guards remain authoritative.
 PERFORM public.order_operation(p_id,'fulfil',p_actor,NULL,p_reference,NULL);
 IF p_authorisation IS NOT NULL THEN UPDATE public.order_collectors SET used_at=n WHERE order_id=p_id;END IF;
 IF o.fulfilment_method='collection'THEN INSERT INTO public.order_activity(order_id,action,actor,metadata)VALUES(p_id,'handover_identity_checked',p_actor,jsonb_build_object('authorisation_id',p_authorisation,'photo_id_checked',true));END IF;
 RETURN 'collected';
END$$;
CREATE OR REPLACE FUNCTION public.guard_named_handover()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF OLD.fulfilment_method='collection' AND OLD.fulfilled_at IS NULL AND NEW.fulfilled_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.order_handover_checks WHERE order_id=OLD.id AND transaction_id=txid_current()AND identity_checked AND actor=NEW.fulfilled_by)THEN RAISE EXCEPTION 'USE_VERIFIED_HANDOVER';END IF;RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS named_handover_guard ON public.orders;
CREATE TRIGGER named_handover_guard BEFORE UPDATE OF fulfilled_at ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_named_handover();
-- Collector details only: approved retention, no cascade deletion of receipts/audit/outbox.
CREATE INDEX IF NOT EXISTS named_collector_cleanup ON public.order_collectors(cleanup_after,order_id)WHERE cleanup_after IS NOT NULL AND NOT retention_hold;
CREATE OR REPLACE FUNCTION public.cleanup_named_collectors(p_limit integer DEFAULT 500)RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE removed integer;n timestamptz:=clock_timestamp();
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INVALID_CLEANUP';END IF;
 WITH doomed AS(SELECT order_id FROM public.order_collectors WHERE cleanup_after<n AND NOT retention_hold ORDER BY cleanup_after,order_id LIMIT p_limit FOR UPDATE SKIP LOCKED)
 DELETE FROM public.order_collectors c USING doomed d WHERE c.order_id=d.order_id;GET DIAGNOSTICS removed=ROW_COUNT;RETURN removed;
END$$;
DO $$DECLARE f regprocedure;BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('invalidate_named_collector','set_named_collector','queue_collection_access','fulfil_order_named','guard_named_handover','cleanup_named_collectors')LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
 IF f::text LIKE '%set_named_collector%'OR f::text LIKE '%queue_collection_access%'OR f::text LIKE '%fulfil_order_named%'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);END IF;
 END LOOP;END$$;
COMMIT;
