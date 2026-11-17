-- PREPARE/REVIEW ONLY. Requires current campaign/CRM/discount/mail-runtime migrations.
-- No activation, schedules, sends or historical consent rewrite.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF; END$$;
DO $$BEGIN IF to_regclass('public.campaign_owner_requests')IS NOT NULL OR to_regprocedure('public.register_campaign_intent_v2(jsonb,jsonb,jsonb)')IS NOT NULL
 THEN RAISE EXCEPTION 'OLD_CAMPAIGN_OWNER_FLOW_REQUIRES_COMPATIBILITY_REVIEW';END IF;END$$;
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS retry_due_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS retry_claim uuid, ADD COLUMN IF NOT EXISTS retry_claimed_at timestamptz, ADD COLUMN IF NOT EXISTS safe_retry_count integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS campaign_contact_confirmation ON public.email_deliveries(contact_id,created_at DESC,id DESC)WHERE template_key='intent_confirmation';
CREATE INDEX IF NOT EXISTS campaign_safe_retry_due ON public.email_deliveries(retry_due_at,id)WHERE template_key='intent_confirmation'AND metadata->>'registration_v2'='true'AND safe_retry_count<6 AND ((status='queued'AND attempted_at IS NULL)OR(status IN('queued','failed','sending')AND metadata->>'_mail_outcome'IN('not_sent','preparing')));
CREATE INDEX IF NOT EXISTS campaign_unlinked_session_events ON public.funnel_events(campaign_id,anonymous_session_id,created_at,id)WHERE campaign_lead_id IS NULL;
CREATE INDEX IF NOT EXISTS campaign_limit_expiry ON public.campaign_rate_limits(expires_at,key);

CREATE OR REPLACE FUNCTION public.register_campaign_intent(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE c public.campaigns; pr public.campaign_products; ct public.contacts; l public.campaign_leads; old_l public.campaign_leads;
  mail_id uuid; result jsonb; prior jsonb; sid text; owner_id uuid; normalized text;
BEGIN
  normalized := lower(btrim(p->>'email'));
  IF normalized IS NULL OR length(normalized)>254 OR normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR coalesce(p->>'purchase_intent','') NOT IN ('yes','maybe','no') OR jsonb_typeof(p->'marketing_consent')IS DISTINCT FROM 'boolean' OR length(coalesce(p->>'phone',''))>40 OR length(coalesce(p->>'telegram_handle',''))>64 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  -- Serializes retries of this request, including retries with differing emails.
  PERFORM pg_advisory_xact_lock(hashtextextended(p->>'request_id',0));
  SELECT r.result INTO prior FROM public.campaign_requests r WHERE r.id=(p->>'request_id')::uuid;
  IF FOUND THEN RETURN prior; END IF;
  SELECT * INTO c FROM public.campaigns WHERE slug=p->>'campaign_slug' FOR SHARE;
  IF NOT FOUND OR c.status<>'active' OR c.starts_at>now() OR c.ends_at<now() THEN RAISE EXCEPTION 'CAMPAIGN_INACTIVE'; END IF;
  SELECT * INTO pr FROM public.campaign_products WHERE id=(p->>'product_id')::uuid AND campaign_id=c.id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PRODUCT'; END IF;
  IF pr.estimated_price_cents IS DISTINCT FROM (p->>'price_shown_cents')::integer
    OR pr.currency IS DISTINCT FROM p->>'currency' THEN RAISE EXCEPTION 'PRICE_CHANGED'; END IF;
  -- Serialize different requests for the same contact; all writes below commit together.
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized,1));
  INSERT INTO public.contacts(email,email_normalized,phone,telegram_handle,marketing_consent,marketing_consent_at,consent_source,privacy_policy_version)
  VALUES(normalized,normalized,nullif(p->>'phone',''),nullif(p->>'telegram_handle',''),coalesce((p->>'marketing_consent')::boolean,false),CASE WHEN (p->>'marketing_consent')::boolean THEN clock_timestamp() END,CASE WHEN (p->>'marketing_consent')::boolean THEN 'campaign-single-opt-in:'||c.slug END,'2026-09') ON CONFLICT(email_normalized) DO NOTHING RETURNING * INTO ct;
  IF ct.id IS NULL THEN SELECT * INTO ct FROM public.contacts WHERE email_normalized=normalized FOR UPDATE; END IF;
  SELECT * INTO old_l FROM public.campaign_leads WHERE campaign_id=c.id AND contact_id=ct.id FOR UPDATE;
  -- Single-step public registration never overwrites an existing contact or pick,
  -- including paid responses and unsubscribe preferences. Changes require admin support.
  sid:=p->>'session_id';
  INSERT INTO public.campaign_leads(campaign_id,contact_id,selected_campaign_product_id,price_shown_cents,currency,purchase_intent,
    utm_source,utm_medium,utm_campaign,utm_content,utm_term,referrer,landing_variant,anonymous_session_id,first_touch_source,latest_touch_source)
  VALUES(c.id,ct.id,pr.id,pr.estimated_price_cents,pr.currency,p->>'purchase_intent',p->'attribution'->>'utm_source',p->'attribution'->>'utm_medium',
    p->'attribution'->>'utm_campaign',p->'attribution'->>'utm_content',p->'attribution'->>'utm_term',p->'attribution'->>'referrer',
    p->'attribution'->>'landing_variant',sid,p->'attribution'->>'first_touch_source',p->'attribution'->>'latest_touch_source')
  ON CONFLICT(campaign_id,contact_id) DO NOTHING RETURNING * INTO l;
  IF l.id IS NULL THEN SELECT * INTO l FROM public.campaign_leads WHERE campaign_id=c.id AND contact_id=ct.id FOR UPDATE; END IF;
  -- First-touch UTM fields and lifecycle status survive re-voting.
  INSERT INTO public.campaign_sessions(campaign_id,session_id,lead_id) VALUES(c.id,sid,l.id)
  ON CONFLICT(campaign_id,session_id) DO UPDATE SET lead_id=coalesce(public.campaign_sessions.lead_id,excluded.lead_id)
  RETURNING lead_id INTO owner_id;
  IF owner_id=l.id THEN
    WITH linked AS(SELECT id FROM public.funnel_events WHERE campaign_id=c.id AND anonymous_session_id=sid AND campaign_lead_id IS NULL ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED)
    UPDATE public.funnel_events e SET contact_id=ct.id,campaign_lead_id=l.id FROM linked WHERE e.id=linked.id;
  END IF;
  INSERT INTO public.funnel_events(campaign_id,contact_id,campaign_lead_id,campaign_product_id,anonymous_session_id,event_type,metadata)
  VALUES(c.id,ct.id,l.id,pr.id,sid,CASE WHEN old_l.id IS NULL THEN 'intent_submitted' ELSE 'intent_update_requested' END,
    jsonb_build_object('purchase_intent',l.purchase_intent,'price_shown_cents',l.price_shown_cents,'product_name',pr.public_name,
      'previous_product_id',old_l.selected_campaign_product_id,'previous_intent',old_l.purchase_intent,'previous_price_cents',old_l.price_shown_cents,
      'attribution',p->'attribution','marketing_consent',ct.marketing_consent));
  IF old_l.id IS NULL THEN
    INSERT INTO public.funnel_events(campaign_id,contact_id,campaign_lead_id,event_type) VALUES(c.id,ct.id,l.id,'contact_registered');
  END IF;
  IF NOT c.is_test AND old_l.id IS NULL THEN
    INSERT INTO public.email_deliveries(contact_id,campaign_lead_id,template_key,recipient_email,provider,status,metadata)
    VALUES(ct.id,l.id,'intent_confirmation',ct.email,'resend','queued',jsonb_build_object('product_name',pr.public_name,
      'price_shown_cents',l.price_shown_cents,'currency',l.currency,'purchase_intent',l.purchase_intent)) RETURNING id INTO mail_id;
    INSERT INTO public.funnel_events(campaign_id,contact_id,campaign_lead_id,event_type,metadata)
    VALUES(c.id,ct.id,l.id,'confirmation_email_queued',jsonb_build_object('delivery_id',mail_id));
  END IF;
  result:=jsonb_build_object('lead_id',l.id,'product_name',pr.public_name,'already_registered',old_l.id IS NOT NULL,'delivery_id',mail_id,'is_test',c.is_test);
  INSERT INTO public.campaign_requests(id,campaign_id,contact_id,result) VALUES((p->>'request_id')::uuid,c.id,ct.id,result);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.register_campaign_intent_v2(p jsonb,p_coupon jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE r jsonb;ct public.contacts;l public.campaign_leads;j public.email_deliveries;cid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p->>'request_id',0));
 SELECT result INTO r FROM public.campaign_requests WHERE id=(p->>'request_id')::uuid;
 IF FOUND THEN RETURN r; END IF;
 IF p_coupon IS NULL THEN r:=public.register_campaign_intent(p);ELSE r:=public.register_campaign_intent_discount(p,p_coupon);END IF;
 IF (r->>'is_test')::boolean THEN RETURN r; END IF;
 SELECT * INTO l FROM public.campaign_leads WHERE id=(r->>'lead_id')::uuid;
 SELECT * INTO ct FROM public.contacts WHERE id=l.contact_id FOR UPDATE;
 IF r->>'delivery_id'IS NULL THEN
  -- Do not create another message for repeat public submissions within ten minutes.
  SELECT * INTO j FROM public.email_deliveries WHERE contact_id=ct.id AND template_key='intent_confirmation'ORDER BY created_at DESC,id DESC LIMIT 1;
  IF j.id IS NOT NULL AND j.created_at>clock_timestamp()-interval '10 minutes' THEN
   r:=r||jsonb_build_object('cooldown',true);
   UPDATE public.campaign_requests SET result=r WHERE id=(p->>'request_id')::uuid;RETURN r;
  END IF;
  INSERT INTO public.email_deliveries(contact_id,campaign_lead_id,template_key,recipient_email,provider,status,metadata)
   VALUES(ct.id,l.id,'intent_confirmation',ct.email,'zoho','queued',jsonb_build_object('product_name',r->>'product_name','price_shown_cents',(p->>'price_shown_cents')::integer,'currency',p->>'currency','purchase_intent',p->>'purchase_intent')) RETURNING * INTO j;
 ELSE SELECT * INTO j FROM public.email_deliveries WHERE id=(r->>'delivery_id')::uuid FOR UPDATE;END IF;
 -- Reuse the existing coupon and original expiry; never require another customer step.
 SELECT id INTO cid FROM public.campaign_discount_codes WHERE email_normalized=ct.email_normalized;
 UPDATE public.email_deliveries SET metadata=metadata||jsonb_build_object('registration_v2',true)||CASE WHEN cid IS NOT NULL THEN jsonb_build_object('campaign_coupon_id',cid) ELSE '{}'::jsonb END WHERE id=j.id;
 r:=r||jsonb_build_object('delivery_id',j.id,'cooldown',false);
 UPDATE public.campaign_requests SET result=r WHERE id=(p->>'request_id')::uuid;RETURN r;
END$$;

-- Safe candidate lookup is bounded; deliverOnce still owns the exclusive pre-POST marker.
CREATE OR REPLACE FUNCTION public.claim_campaign_confirmations(p_limit integer DEFAULT 5)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE result jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_LIMIT';END IF;
 WITH candidates AS(
 SELECT id FROM public.email_deliveries WHERE template_key='intent_confirmation' AND metadata->>'registration_v2'='true' AND retry_due_at<=statement_timestamp() AND safe_retry_count<6
 AND (retry_claimed_at IS NULL OR retry_claimed_at<statement_timestamp()-interval '10 minutes')
 AND ((status='queued'AND attempted_at IS NULL)OR(status IN('queued','failed','sending')AND metadata->>'_mail_outcome'IN('not_sent','preparing') AND (status<>'sending'OR attempted_at<statement_timestamp()-interval '10 minutes')))
 ORDER BY retry_due_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED
 ),claimed AS(
 UPDATE public.email_deliveries j SET retry_claim=gen_random_uuid(),retry_claimed_at=clock_timestamp(),safe_retry_count=safe_retry_count+1,
 retry_due_at=clock_timestamp()+least(60,5*(1<<least(j.safe_retry_count,3)))*interval '1 minute'
 FROM candidates c WHERE j.id=c.id RETURNING j.id,j.retry_claim
 )SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'claim',retry_claim)),'[]'::jsonb)INTO result FROM claimed;RETURN result;
END$$;
CREATE OR REPLACE FUNCTION public.finish_campaign_confirmation_claim(p_id uuid,p_claim uuid)RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 UPDATE public.email_deliveries SET retry_claim=NULL,retry_claimed_at=NULL,
 retry_due_at=CASE WHEN safe_retry_count>=6 OR attempted_at<statement_timestamp()-interval '23 hours' OR metadata->>'_mail_outcome'IN('unknown','accepted') THEN 'infinity'::timestamptz ELSE retry_due_at END,
 error_message=CASE WHEN safe_retry_count>=6 AND status NOT IN('sent','skipped') THEN coalesce(error_message,'Automatic retry limit reached; admin review required.') ELSE error_message END
 WHERE id=p_id AND retry_claim=p_claim
$$;
CREATE OR REPLACE FUNCTION public.cleanup_campaign_registration(p_limit integer DEFAULT 100)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE r integer;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_LIMIT'; END IF;
 WITH doomed AS(SELECT key FROM public.campaign_rate_limits WHERE expires_at<statement_timestamp()-interval '1 day'ORDER BY expires_at,key LIMIT p_limit FOR UPDATE SKIP LOCKED),deleted AS(DELETE FROM public.campaign_rate_limits r USING doomed d WHERE r.key=d.key RETURNING 1)SELECT count(*)INTO r FROM deleted;
 RETURN jsonb_build_object('expired_limits',r);
END$$;
CREATE OR REPLACE FUNCTION public.campaign_rate_limit(p_key text,p_limit integer,p_seconds integer)RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='2s' AS $$
DECLARE n integer;
BEGIN
 IF p_key!~'^[a-f0-9]{64}$'OR p_limit NOT BETWEEN 1 AND 100 OR p_seconds NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'INVALID_LIMIT';END IF;
 INSERT INTO public.campaign_rate_limits(key,hits,expires_at)VALUES(p_key,1,clock_timestamp()+make_interval(secs=>p_seconds))
 ON CONFLICT(key)DO UPDATE SET hits=CASE WHEN campaign_rate_limits.expires_at<clock_timestamp()THEN 1 ELSE campaign_rate_limits.hits+1 END,
 expires_at=CASE WHEN campaign_rate_limits.expires_at<clock_timestamp()THEN excluded.expires_at ELSE campaign_rate_limits.expires_at END RETURNING hits INTO n;
 RETURN n<=p_limit;
END$$;
DO $$DECLARE f regprocedure;BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_catalog.pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('register_campaign_intent','register_campaign_intent_v2','claim_campaign_confirmations','finish_campaign_confirmation_claim','cleanup_campaign_registration','campaign_rate_limit')LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
 IF f::text NOT LIKE '%track_campaign_%'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);END IF;
 END LOOP;
END$$;
CREATE TABLE IF NOT EXISTS public.campaign_confirmation_run(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),ran_at timestamptz NOT NULL,counts jsonb NOT NULL);
ALTER TABLE public.campaign_confirmation_run OWNER TO postgres;
ALTER TABLE public.campaign_confirmation_run ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_confirmation_run FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX IF NOT EXISTS campaign_confirmation_recent ON public.email_deliveries(created_at DESC,id DESC)WHERE template_key='intent_confirmation';
CREATE OR REPLACE FUNCTION public.record_campaign_confirmation_run(p_counts jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE k text;
BEGIN
 IF p_counts IS NULL OR jsonb_typeof(p_counts)<>'object'OR octet_length(p_counts::text)>200 THEN RAISE EXCEPTION 'INVALID_METRICS';END IF;
 FOREACH k IN ARRAY ARRAY['processed','sent','queued','failed','errors']LOOP IF coalesce(p_counts->>k,'')!~'^[0-9]{1,2}$'THEN RAISE EXCEPTION 'INVALID_METRICS';END IF;END LOOP;
 INSERT INTO public.campaign_confirmation_run(singleton,ran_at,counts)VALUES(true,clock_timestamp(),jsonb_build_object('processed',(p_counts->>'processed')::integer,'sent',(p_counts->>'sent')::integer,'queued',(p_counts->>'queued')::integer,'failed',(p_counts->>'failed')::integer,'errors',(p_counts->>'errors')::integer))ON CONFLICT(singleton)DO UPDATE SET ran_at=excluded.ran_at,counts=excluded.counts;
END$$;
CREATE OR REPLACE FUNCTION public.campaign_confirmation_report()RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('run',(SELECT jsonb_build_object('ran_at',ran_at,'counts',counts)FROM public.campaign_confirmation_run WHERE singleton),
 'next_due_at',(SELECT retry_due_at FROM public.email_deliveries WHERE template_key='intent_confirmation'AND metadata->>'registration_v2'='true'AND safe_retry_count<6 AND ((status='queued'AND attempted_at IS NULL)OR(status IN('queued','failed','sending')AND metadata->>'_mail_outcome'IN('not_sent','preparing'))) ORDER BY retry_due_at,id LIMIT 1),
 'recent',(SELECT coalesce(jsonb_agg(r),'[]'::jsonb)FROM(SELECT id,campaign_lead_id,status,created_at,attempted_at,sent_at,safe_retry_count,metadata->>'_mail_outcome'AS outcome,CASE WHEN error_message IS NULL THEN NULL ELSE 'Admin review required; inspect the delivery and provider records.'END AS error_message FROM public.email_deliveries WHERE template_key='intent_confirmation'ORDER BY created_at DESC,id DESC LIMIT 100)r))
$$;
ALTER FUNCTION public.record_campaign_confirmation_run(jsonb)OWNER TO postgres;
ALTER FUNCTION public.campaign_confirmation_report()OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_campaign_confirmation_run(jsonb),public.campaign_confirmation_report() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_campaign_confirmation_run(jsonb),public.campaign_confirmation_report() TO service_role;
COMMIT;
