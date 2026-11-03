-- REVIEW ONLY. Requires order_fulfilment.sql + order_integrations.sql + collection_management.sql.
-- No schedules or providers are enabled. One-time counter bootstrap is maintenance work, not request work.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s';
DO $$BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF; END$$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
LOCK TABLE public.order_integration_jobs IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS integration_revision bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.track_integration_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN NEW.integration_revision:=OLD.integration_revision+1; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS integration_revision ON public.orders;
CREATE TRIGGER integration_revision BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.track_integration_revision();
ALTER TABLE public.order_integration_jobs ADD COLUMN IF NOT EXISTS lane text NOT NULL DEFAULT 'lifecycle' CHECK(lane IN ('security','lifecycle','routine')),
 ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 1 CHECK(priority BETWEEN 0 AND 3),
 ADD COLUMN IF NOT EXISTS preparation_failures integer NOT NULL DEFAULT 0 CHECK(preparation_failures>=0);
CREATE TABLE IF NOT EXISTS public.order_runtime_limits(kind text PRIMARY KEY CHECK(kind IN ('email','crm')),enabled boolean NOT NULL DEFAULT false,
 hourly_limit integer NOT NULL CHECK(hourly_limit BETWEEN 1 AND 10000),reserved_urgent integer NOT NULL CHECK(reserved_urgent>=0 AND reserved_urgent<hourly_limit),
 minimum_gap_seconds integer NOT NULL CHECK(minimum_gap_seconds BETWEEN 0 AND 3600),last_started_at timestamptz,
 reserved_security integer NOT NULL DEFAULT 0 CHECK(reserved_security>=0 AND reserved_security<=reserved_urgent));
INSERT INTO public.order_runtime_limits VALUES('email',false,40,10,60,NULL,5),('crm',false,300,30,0,NULL,0) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.order_send_minutes(kind text NOT NULL REFERENCES public.order_runtime_limits(kind),minute timestamptz NOT NULL,hits integer NOT NULL CHECK(hits>=0),PRIMARY KEY(kind,minute));
CREATE TABLE IF NOT EXISTS public.order_queue_counts(kind text NOT NULL,lane text NOT NULL,status text NOT NULL,shard smallint NOT NULL CHECK(shard BETWEEN 0 AND 7),jobs bigint NOT NULL CHECK(jobs>=0),PRIMARY KEY(kind,lane,status,shard));
CREATE TABLE IF NOT EXISTS public.order_runtime_meta(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),counts_ready boolean NOT NULL DEFAULT false);
INSERT INTO public.order_runtime_meta(singleton)VALUES(true)ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.order_worker_metrics(kind text NOT NULL CHECK(kind IN ('email','crm')),minute timestamptz NOT NULL,runs bigint NOT NULL DEFAULT 0,errors bigint NOT NULL DEFAULT 0,
 queries bigint NOT NULL DEFAULT 0,query_errors bigint NOT NULL DEFAULT 0,query_ms double precision NOT NULL DEFAULT 0,query_max_ms double precision NOT NULL DEFAULT 0,
 buckets bigint[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0]::bigint[],sent bigint NOT NULL DEFAULT 0,deferred bigint NOT NULL DEFAULT 0,PRIMARY KEY(kind,minute));
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['order_runtime_limits','order_send_minutes','order_queue_counts','order_runtime_meta','order_worker_metrics'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;END$$;
CREATE INDEX IF NOT EXISTS order_jobs_claim_v2 ON public.order_integration_jobs(kind,lane,priority,available_at,id)WHERE status='queued';
CREATE INDEX IF NOT EXISTS order_jobs_lane_fifo ON public.order_integration_jobs(order_id,kind,lane,created_at,id)WHERE status='queued';
CREATE INDEX IF NOT EXISTS order_jobs_lane_active ON public.order_integration_jobs(order_id,kind,lane,status)WHERE status IN ('processing','review');
CREATE INDEX IF NOT EXISTS order_jobs_lease_expiry ON public.order_integration_jobs(kind,claimed_at,id)WHERE status='processing';
CREATE INDEX IF NOT EXISTS order_jobs_oldest ON public.order_integration_jobs(kind,lane,created_at,id)WHERE status='queued';
CREATE INDEX IF NOT EXISTS order_jobs_due_age ON public.order_integration_jobs(kind,lane,available_at,id)WHERE status='queued';
CREATE INDEX IF NOT EXISTS order_metrics_expiry ON public.order_worker_metrics(minute,kind);
CREATE INDEX IF NOT EXISTS order_send_expiry ON public.order_send_minutes(minute,kind);
CREATE INDEX IF NOT EXISTS order_activity_order_page ON public.order_activity(order_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS operations_deposit_ref ON public.orders(upper(btrim(payment_reference)));
CREATE INDEX IF NOT EXISTS operations_balance_ref ON public.orders(upper(btrim(balance_reference)));
CREATE INDEX IF NOT EXISTS operations_activity_ref ON public.order_activity(upper(btrim(metadata->>'reference')));
CREATE INDEX IF NOT EXISTS operations_order_identity ON public.orders(batch_id,customer_phone)WHERE payment_status IN ('PENDING_PAYNOW','VERIFIED');
CREATE INDEX IF NOT EXISTS operations_orders_page ON public.orders(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS operations_status_page ON public.orders(payment_status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS operations_ready_page ON public.orders(created_at DESC,id DESC)WHERE ready_at IS NOT NULL AND fulfilled_at IS NULL AND payment_status='VERIFIED';
CREATE INDEX IF NOT EXISTS operations_fulfilled_page ON public.orders(created_at DESC,id DESC)WHERE fulfilled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS operations_collection_done_page ON public.orders(created_at DESC,id DESC)WHERE fulfilment_method='collection' AND payment_status='VERIFIED' AND fulfilled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS operations_collection_page ON public.orders(created_at DESC,id DESC)WHERE fulfilment_method='collection' AND payment_status='VERIFIED' AND ready_at IS NOT NULL AND fulfilled_at IS NULL;
DO $$DECLARE ns text;col text;BEGIN
 SELECT n.nspname INTO ns FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm';
 FOREACH col IN ARRAY ARRAY['order_code','customer_name','customer_phone','customer_email']LOOP
 EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.orders USING gin (%I %I.gin_trgm_ops)','operations_search_'||col,col,ns);
 END LOOP;END$$;
CREATE OR REPLACE FUNCTION public.classify_order_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 NEW.lane:=CASE WHEN NEW.kind='email' AND NEW.event IN ('owner_otp','collection_access','collector_authorised','collector_revoked','collector_changed')THEN 'security' WHEN NEW.kind='email' AND NEW.event='campaign_update'THEN 'routine' ELSE 'lifecycle' END;
 NEW.priority:=CASE WHEN NEW.lane='security'THEN 0 WHEN NEW.lane='routine'THEN 3 WHEN NEW.event IN ('deposit_reminder','balance_reminder','collection_reminder','deadline_warning')THEN 2 ELSE 1 END;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS classify_order_job ON public.order_integration_jobs;
CREATE TRIGGER classify_order_job BEFORE INSERT OR UPDATE OF kind,event,lane,priority ON public.order_integration_jobs FOR EACH ROW EXECUTE FUNCTION public.classify_order_job();
CREATE OR REPLACE FUNCTION public.count_order_jobs() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item record; sid smallint;
BEGIN
 sid:=mod(hashtextextended(CASE WHEN TG_OP='DELETE'THEN OLD.id ELSE NEW.id END::text,0)&2147483647,8)::smallint;
 -- Stable lock ordering; eight shards avoid a single counter hot row at registration peaks.
 FOR item IN SELECT k,l,s,sum(delta)::bigint d FROM(VALUES
 (CASE WHEN TG_OP<>'INSERT'THEN OLD.kind END,CASE WHEN TG_OP<>'INSERT'THEN OLD.lane END,CASE WHEN TG_OP<>'INSERT'THEN OLD.status END,-1),
 (CASE WHEN TG_OP<>'DELETE'THEN NEW.kind END,CASE WHEN TG_OP<>'DELETE'THEN NEW.lane END,CASE WHEN TG_OP<>'DELETE'THEN NEW.status END,1))v(k,l,s,delta)
 WHERE k IS NOT NULL GROUP BY k,l,s HAVING sum(delta)<>0 ORDER BY k,l,s LOOP
 -- Bootstrap creates every state for each kind/lane/shard, so decrement never inserts a negative row.
 UPDATE public.order_queue_counts SET jobs=jobs+item.d WHERE kind=item.k AND lane=item.l AND status=item.s AND shard=sid;
 IF NOT FOUND THEN RAISE EXCEPTION 'QUEUE_COUNTER_MISSING'; END IF;
 END LOOP; RETURN NULL;
END$$;
DO $$BEGIN IF NOT(SELECT counts_ready FROM public.order_runtime_meta WHERE singleton)THEN
 INSERT INTO public.order_queue_counts(kind,lane,status,shard,jobs)
 SELECT k,l,s,h,0 FROM unnest(ARRAY['email','crm'])k CROSS JOIN unnest(ARRAY['security','lifecycle','routine'])l CROSS JOIN unnest(ARRAY['queued','processing','sent','skipped','review','failed'])s CROSS JOIN generate_series(0,7)h ON CONFLICT DO NOTHING;
 UPDATE public.order_queue_counts c SET jobs=q.n FROM(SELECT kind,lane,status,mod(hashtextextended(id::text,0)&2147483647,8)::smallint shard,count(*)n FROM public.order_integration_jobs GROUP BY 1,2,3,4)q WHERE(c.kind,c.lane,c.status,c.shard)=(q.kind,q.lane,q.status,q.shard);
 UPDATE public.order_runtime_meta SET counts_ready=true WHERE singleton;
 END IF;END$$;
DROP TRIGGER IF EXISTS count_order_jobs ON public.order_integration_jobs;
CREATE TRIGGER count_order_jobs AFTER INSERT OR UPDATE OR DELETE ON public.order_integration_jobs FOR EACH ROW EXECUTE FUNCTION public.count_order_jobs();
CREATE OR REPLACE FUNCTION public.claim_order_jobs_v2(p_kind text,p_limit integer DEFAULT 10) RETURNS SETOF public.order_integration_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE lim public.order_runtime_limits; used integer; n timestamptz:=clock_timestamp();
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('email','crm')OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'INVALID_CLAIM';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('order-integration-claim:'||p_kind,0))THEN RETURN;END IF;
 -- At most 20 old leases; uncertain sends remain quarantined, never replayed.
 WITH stale AS(SELECT id FROM public.order_integration_jobs WHERE kind=p_kind AND status='processing' AND claimed_at<n-interval '5 minutes' ORDER BY claimed_at,id LIMIT 20 FOR UPDATE SKIP LOCKED)
 UPDATE public.order_integration_jobs j SET status=CASE WHEN send_started_at IS NULL THEN 'queued' ELSE 'review' END,error_code='LEASE_EXPIRED',available_at=n FROM stale WHERE j.id=stale.id;
 SELECT * INTO lim FROM public.order_runtime_limits WHERE kind=p_kind;
 IF NOT FOUND OR NOT lim.enabled OR lim.last_started_at+make_interval(secs=>lim.minimum_gap_seconds)>n THEN RETURN;END IF;
 SELECT coalesce(sum(hits),0)::integer INTO used FROM public.order_send_minutes WHERE kind=p_kind AND minute>=date_trunc('minute',n)-interval '60 minutes' AND minute<=date_trunc('minute',n);
 IF used>=lim.hourly_limit THEN RETURN;END IF;
 RETURN QUERY WITH candidates AS MATERIALIZED(
 SELECT c.* FROM(VALUES('security',0),('lifecycle',1),('lifecycle',2),('routine',3))v(lane,priority) CROSS JOIN LATERAL(
 SELECT j.* FROM public.order_integration_jobs j WHERE j.kind=p_kind AND j.lane=v.lane AND j.priority=v.priority AND j.status='queued' AND j.available_at<=n
 ORDER BY j.available_at,j.id LIMIT 150)c), due AS(
 SELECT j.id FROM candidates j WHERE used<lim.hourly_limit-(CASE WHEN j.priority>=2 THEN lim.reserved_urgent WHEN j.priority=1 THEN lim.reserved_security ELSE 0 END)
 AND NOT EXISTS(SELECT 1 FROM public.order_integration_jobs x WHERE x.order_id=j.order_id AND x.kind=j.kind AND x.lane=j.lane AND x.status IN ('processing','review'))
 AND NOT EXISTS(SELECT 1 FROM public.order_integration_jobs x WHERE x.order_id=j.order_id AND x.kind=j.kind AND x.lane=j.lane AND x.status='queued' AND(x.created_at,x.id)<(j.created_at,j.id))
 ORDER BY j.priority,j.available_at,j.id LIMIT least(p_limit,lim.hourly_limit-used,CASE WHEN lim.minimum_gap_seconds>0 THEN 1 ELSE p_limit END))
 UPDATE public.order_integration_jobs j SET status='processing',claimed_at=n,lease_token=gen_random_uuid(),attempts=attempts+1,error_code=NULL FROM due WHERE j.id=due.id AND j.status='queued' RETURNING j.*;
END$$;
-- Legacy claims inherit bounded claims; old direct send markers are denied after migration.
CREATE OR REPLACE FUNCTION public.claim_order_jobs(p_kind text,p_limit integer DEFAULT 5)RETURNS SETOF public.order_integration_jobs
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$SELECT * FROM public.claim_order_jobs_v2(p_kind,p_limit)$$;
CREATE OR REPLACE FUNCTION public.consume_runtime_capacity(p_kind text,p_priority integer,p_at timestamptz)RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE lim public.order_runtime_limits;used integer;
BEGIN
 SELECT * INTO lim FROM public.order_runtime_limits WHERE kind=p_kind FOR UPDATE;
 IF NOT FOUND OR NOT lim.enabled THEN RETURN false;END IF;
 SELECT coalesce(sum(hits),0)::integer INTO used FROM public.order_send_minutes WHERE kind=p_kind AND minute>=date_trunc('minute',p_at)-interval '60 minutes' AND minute<=date_trunc('minute',p_at);
 IF used>=lim.hourly_limit-(CASE WHEN p_priority>=2 THEN lim.reserved_urgent WHEN p_priority=1 THEN lim.reserved_security ELSE 0 END) OR lim.last_started_at+make_interval(secs=>lim.minimum_gap_seconds)>p_at THEN RETURN false;END IF;
 INSERT INTO public.order_send_minutes(kind,minute,hits)VALUES(p_kind,date_trunc('minute',p_at),1)ON CONFLICT(kind,minute)DO UPDATE SET hits=order_send_minutes.hits+1;
 UPDATE public.order_runtime_limits SET last_started_at=p_at WHERE kind=p_kind;RETURN true;
END$$;
CREATE OR REPLACE FUNCTION public.begin_order_job_send(p_id uuid,p_lease uuid,p_revision bigint)RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE j public.order_integration_jobs;lim public.order_runtime_limits;used integer;n timestamptz;revision bigint;
BEGIN
 SELECT * INTO j FROM public.order_integration_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'processing' OR j.lease_token IS DISTINCT FROM p_lease OR j.send_started_at IS NOT NULL THEN RETURN 'stale';END IF;
 SELECT integration_revision INTO revision FROM public.orders WHERE id=j.order_id FOR SHARE;
 n:=clock_timestamp();
 IF j.claimed_at<n-interval '5 minutes'THEN RETURN 'stale';END IF;
 IF revision IS DISTINCT FROM p_revision THEN UPDATE public.order_integration_jobs SET status='queued',available_at=n+interval '1 minute',error_code='ORDER_CHANGED' WHERE id=p_id;RETURN 'changed';END IF;
 IF NOT public.consume_runtime_capacity(j.kind,j.priority,n) THEN
 UPDATE public.order_integration_jobs SET status='queued',available_at=n+interval '1 minute',error_code='PROVIDER_BUDGET' WHERE id=p_id;RETURN 'deferred';END IF;
 UPDATE public.order_integration_jobs SET send_started_at=n WHERE id=p_id;RETURN 'allowed';
END$$;
-- Old workers may not create the pre-POST marker with a direct table update.
CREATE OR REPLACE FUNCTION public.guard_runtime_send_marker()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN IF NEW.send_started_at IS NOT NULL AND OLD.send_started_at IS NULL AND current_user<>'postgres' THEN RAISE EXCEPTION 'USE_GUARDED_SEND';END IF;RETURN NEW;END$$;
DROP TRIGGER IF EXISTS runtime_send_marker ON public.order_integration_jobs;
CREATE TRIGGER runtime_send_marker BEFORE UPDATE OF send_started_at ON public.order_integration_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_runtime_send_marker();
-- Interest confirmations use the same mailbox budget; no per-recipient counter scan.
CREATE OR REPLACE FUNCTION public.begin_campaign_mail_send(p_id uuid,p_attempted_at timestamptz)RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE j public.email_deliveries;n timestamptz;
BEGIN
 SELECT * INTO j FROM public.email_deliveries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'sending' OR j.provider<>'zoho' OR j.attempted_at IS DISTINCT FROM p_attempted_at OR j.metadata->>'_mail_outcome' IS DISTINCT FROM 'preparing' THEN RETURN 'stale';END IF;
 n:=clock_timestamp();IF NOT public.consume_runtime_capacity('email',2,n)THEN RETURN 'deferred';END IF;
 UPDATE public.email_deliveries SET metadata=metadata||jsonb_build_object('_mail_outcome','unknown')WHERE id=p_id;RETURN 'allowed';
END$$;
CREATE OR REPLACE FUNCTION public.guard_campaign_send_marker()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN IF NEW.provider='zoho' AND NEW.metadata->>'_mail_outcome'='unknown' AND OLD.metadata->>'_mail_outcome' IS DISTINCT FROM 'unknown' AND current_user<>'postgres' THEN RAISE EXCEPTION 'USE_GUARDED_SEND';END IF;RETURN NEW;END$$;
DROP TRIGGER IF EXISTS runtime_campaign_marker ON public.email_deliveries;
CREATE TRIGGER runtime_campaign_marker BEFORE UPDATE OF metadata ON public.email_deliveries FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_send_marker();
CREATE OR REPLACE FUNCTION public.order_job_contexts(p_claims jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF jsonb_typeof(p_claims) IS DISTINCT FROM 'array' OR jsonb_array_length(p_claims)>10 THEN RAISE EXCEPTION 'INVALID_CONTEXT_BATCH';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('job_id',j.id,'order',jsonb_build_object(
 'id',o.id,'order_code',o.order_code,'batch_id',o.batch_id,'customer_name',o.customer_name,'customer_email',o.customer_email,'customer_phone',o.customer_phone,'quantity',o.quantity,'payment_status',o.payment_status,
 'deposit_due_cents',o.deposit_due_cents,'deposit_verified_at',o.deposit_verified_at,'final_total_cents',o.final_total_cents,'balance_due_cents',o.balance_due_cents,'balance_token_hash',o.balance_token_hash,'balance_token_expires_at',o.balance_token_expires_at,
 'balance_requested_at',o.balance_requested_at,'balance_paid_at',o.balance_paid_at,'ready_at',o.ready_at,'fulfilled_at',o.fulfilled_at,'fulfilment_method',o.fulfilment_method,'created_at',o.created_at,'fulfilment_status_changed_at',o.fulfilment_status_changed_at,
 'collection_access_version',o.collection_access_version,'integration_revision',o.integration_revision),'product',p.name,'image_url',p.image_url,'policy_version',a.policy_version)),'[]'::jsonb)
 INTO result FROM jsonb_to_recordset(p_claims)c(id uuid,lease uuid)JOIN public.order_integration_jobs j ON j.id=c.id AND j.lease_token=c.lease AND j.status='processing'
 JOIN public.orders o ON o.id=j.order_id LEFT JOIN public.batches b ON b.id=o.batch_id LEFT JOIN public.products p ON p.id=b.product_id LEFT JOIN public.order_collection_accounts a ON a.order_id=o.id;
 RETURN result;
END$$;
CREATE OR REPLACE FUNCTION public.release_order_job_claims(p_claims jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF jsonb_typeof(p_claims) IS DISTINCT FROM 'array' OR jsonb_array_length(p_claims)>10 THEN RAISE EXCEPTION 'INVALID_RELEASE';END IF;
 UPDATE public.order_integration_jobs j SET status='queued',available_at=clock_timestamp()+interval '1 minute',error_code='WORKER_TIME_BUDGET'
 FROM jsonb_to_recordset(p_claims)c(id uuid,lease uuid)WHERE j.id=c.id AND j.lease_token=c.lease AND j.status='processing' AND j.send_started_at IS NULL;
END$$;
CREATE OR REPLACE FUNCTION public.record_order_worker_metrics(p_kind text,p_data jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b bigint[];n timestamptz:=date_trunc('minute',clock_timestamp());
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('email','crm')OR octet_length(p_data::text)>1000 THEN RAISE EXCEPTION 'INVALID_METRICS';END IF;
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR coalesce((p_data->>'errors')::integer,-1) NOT BETWEEN 0 AND 100 OR coalesce((p_data->>'queries')::integer,-1) NOT BETWEEN 0 AND 1000
 OR coalesce((p_data->>'query_errors')::integer,-1) NOT BETWEEN 0 AND 1000 OR (p_data->>'query_errors')::integer>(p_data->>'queries')::integer
 OR coalesce((p_data->>'query_ms')::double precision,-1) NOT BETWEEN 0 AND 180000000 OR coalesce((p_data->>'query_max_ms')::double precision,-1) NOT BETWEEN 0 AND 180000
 OR coalesce((p_data->>'sent')::integer,-1) NOT BETWEEN 0 AND 10 OR coalesce((p_data->>'deferred')::integer,-1) NOT BETWEEN 0 AND 10 THEN RAISE EXCEPTION 'INVALID_METRICS';END IF;
 b:=ARRAY[(p_data->'buckets'->>0)::bigint,(p_data->'buckets'->>1)::bigint,(p_data->'buckets'->>2)::bigint,(p_data->'buckets'->>3)::bigint,(p_data->'buckets'->>4)::bigint,(p_data->'buckets'->>5)::bigint];
 IF array_position(b,NULL) IS NOT NULL OR EXISTS(SELECT 1 FROM unnest(b)x WHERE x<0 OR x>1000)THEN RAISE EXCEPTION 'INVALID_METRICS';END IF;
 INSERT INTO public.order_worker_metrics(kind,minute,runs,errors,queries,query_errors,query_ms,query_max_ms,buckets,sent,deferred)
 VALUES(p_kind,n,1,(p_data->>'errors')::bigint,(p_data->>'queries')::bigint,(p_data->>'query_errors')::bigint,(p_data->>'query_ms')::double precision,(p_data->>'query_max_ms')::double precision,b,(p_data->>'sent')::bigint,(p_data->>'deferred')::bigint)
 ON CONFLICT(kind,minute)DO UPDATE SET runs=order_worker_metrics.runs+1,errors=order_worker_metrics.errors+excluded.errors,queries=order_worker_metrics.queries+excluded.queries,query_errors=order_worker_metrics.query_errors+excluded.query_errors,
 query_ms=order_worker_metrics.query_ms+excluded.query_ms,query_max_ms=greatest(order_worker_metrics.query_max_ms,excluded.query_max_ms),sent=order_worker_metrics.sent+excluded.sent,deferred=order_worker_metrics.deferred+excluded.deferred,
 buckets=ARRAY[order_worker_metrics.buckets[1]+b[1],order_worker_metrics.buckets[2]+b[2],order_worker_metrics.buckets[3]+b[3],order_worker_metrics.buckets[4]+b[4],order_worker_metrics.buckets[5]+b[5],order_worker_metrics.buckets[6]+b[6]];
END$$;
CREATE OR REPLACE FUNCTION public.order_runtime_report()RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('captured_at',statement_timestamp(),'queue',(SELECT jsonb_agg(t) FROM(SELECT kind,lane,status,sum(jobs)jobs FROM public.order_queue_counts GROUP BY kind,lane,status HAVING sum(jobs)>0)t),
 'oldest',(SELECT jsonb_agg(jsonb_build_object('kind',k,'lane',l,'created_at',(SELECT created_at FROM public.order_integration_jobs WHERE kind=k AND lane=l AND status='queued' ORDER BY created_at,id LIMIT 1),
 'due_at',(SELECT available_at FROM public.order_integration_jobs WHERE kind=k AND lane=l AND status='queued' AND available_at<=statement_timestamp()ORDER BY available_at,id LIMIT 1)))FROM unnest(ARRAY['email','crm'])k CROSS JOIN unnest(ARRAY['security','lifecycle','routine'])l),
 'metrics',(SELECT jsonb_agg(t)FROM(SELECT kind,sum(runs)runs,sum(errors)errors,sum(queries)queries,sum(query_errors)query_errors,sum(query_ms)query_ms,max(query_max_ms)query_max_ms,sum(sent)sent,sum(deferred)deferred,
 ARRAY[sum(buckets[1]),sum(buckets[2]),sum(buckets[3]),sum(buckets[4]),sum(buckets[5]),sum(buckets[6])]buckets FROM public.order_worker_metrics WHERE minute>=date_trunc('minute',statement_timestamp())-interval '59 minutes' AND minute<=statement_timestamp() GROUP BY kind)t),
 'limits',(SELECT jsonb_agg(jsonb_build_object('kind',kind,'enabled',enabled,'hourly_limit',hourly_limit,'reserved_urgent',reserved_urgent,'reserved_security',reserved_security,'minimum_gap_seconds',minimum_gap_seconds))FROM public.order_runtime_limits))
$$;
-- Remove the inherited full-table TTL DELETE from each customer request.
CREATE INDEX IF NOT EXISTS campaign_rate_expiry ON public.campaign_rate_limits(expires_at,key);
CREATE OR REPLACE FUNCTION public.campaign_rate_limit(p_key text,p_limit integer,p_seconds integer)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE hits integer;n timestamptz:=clock_timestamp();
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 128 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 OR p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'INVALID_RATE_LIMIT';END IF;
 INSERT INTO public.campaign_rate_limits(key,hits,expires_at)VALUES(p_key,1,n+make_interval(secs=>p_seconds))ON CONFLICT(key)DO UPDATE SET
 hits=CASE WHEN campaign_rate_limits.expires_at<=n THEN 1 ELSE campaign_rate_limits.hits+1 END,expires_at=CASE WHEN campaign_rate_limits.expires_at<=n THEN excluded.expires_at ELSE campaign_rate_limits.expires_at END RETURNING campaign_rate_limits.hits INTO hits;
 RETURN hits<=p_limit;
END$$;
CREATE OR REPLACE FUNCTION public.cleanup_order_runtime(p_limit integer DEFAULT 500)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE rates integer;metrics integer;sends integer;n timestamptz:=clock_timestamp();
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INVALID_CLEANUP';END IF;
 IF NOT pg_try_advisory_xact_lock(817430124)THEN RETURN jsonb_build_object('busy',true);END IF;
 WITH doomed AS(SELECT key FROM public.campaign_rate_limits WHERE expires_at<n-interval '1 day'ORDER BY expires_at,key LIMIT p_limit FOR UPDATE SKIP LOCKED)DELETE FROM public.campaign_rate_limits r USING doomed d WHERE r.key=d.key;GET DIAGNOSTICS rates=ROW_COUNT;
 WITH doomed AS(SELECT kind,minute FROM public.order_worker_metrics WHERE minute<n-interval '30 days'ORDER BY minute,kind LIMIT p_limit FOR UPDATE SKIP LOCKED)DELETE FROM public.order_worker_metrics r USING doomed d WHERE(r.kind,r.minute)=(d.kind,d.minute);GET DIAGNOSTICS metrics=ROW_COUNT;
 WITH doomed AS(SELECT kind,minute FROM public.order_send_minutes WHERE minute<n-interval '2 days'ORDER BY minute,kind LIMIT p_limit FOR UPDATE SKIP LOCKED)DELETE FROM public.order_send_minutes r USING doomed d WHERE(r.kind,r.minute)=(d.kind,d.minute);GET DIAGNOSTICS sends=ROW_COUNT;
 RETURN jsonb_build_object('rates',rates,'metrics',metrics,'send_buckets',sends);
END$$;
DO $$DECLARE f regprocedure;BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('consume_runtime_capacity','begin_campaign_mail_send','guard_campaign_send_marker','release_order_job_claims','guard_runtime_send_marker','track_integration_revision','classify_order_job','count_order_jobs','claim_order_jobs_v2','claim_order_jobs','begin_order_job_send','order_job_contexts','record_order_worker_metrics','order_runtime_report','campaign_rate_limit','cleanup_order_runtime')LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
 IF f::text NOT LIKE '%consume_runtime_capacity%' AND f::text NOT LIKE '%guard_campaign_send_marker%' AND f::text NOT LIKE '%guard_runtime_send_marker%' AND f::text NOT LIKE '%cleanup_order_runtime%' AND f::text NOT LIKE '%track_integration_revision%' AND f::text NOT LIKE '%classify_order_job%' AND f::text NOT LIKE '%count_order_jobs%'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);END IF;
 END LOOP;END$$;
COMMIT;
