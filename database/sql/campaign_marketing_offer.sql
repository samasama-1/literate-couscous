-- Follow-up after order_operations_runtime.sql and campaign_registration_safety.sql.
-- Prepare/review only. No sending, activation, historical consent rewrite or coupon revocation.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='45s';
DO $$BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres';END IF;
IF to_regprocedure('public.register_campaign_intent_v2(jsonb,jsonb)') IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_SAFETY_REQUIRED';END IF;END$$;
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
  -- Require explicit current email consent for the active promotional signup only.
  -- No customer lookup here: errors cannot expose whether an address exists.
  IF NOT c.is_test AND EXISTS(SELECT 1 FROM public.campaign_discount_controls WHERE singleton AND enabled)
    AND ((p->>'marketing_consent') IS DISTINCT FROM 'true' OR (p->>'marketing_consent_version') IS DISTINCT FROM 'campaign-email-offer-2026-11-17') THEN
    RAISE EXCEPTION 'MARKETING_CONSENT_REQUIRED';
  END IF;
  SELECT * INTO pr FROM public.campaign_products WHERE id=(p->>'product_id')::uuid AND campaign_id=c.id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PRODUCT'; END IF;
  IF pr.estimated_price_cents IS DISTINCT FROM (p->>'price_shown_cents')::integer
    OR pr.currency IS DISTINCT FROM p->>'currency' THEN RAISE EXCEPTION 'PRICE_CHANGED'; END IF;
  -- Serialize different requests for the same contact; all writes below commit together.
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized,1));
  INSERT INTO public.contacts(email,email_normalized,phone,telegram_handle,marketing_consent,marketing_consent_at,consent_source,privacy_policy_version)
  VALUES(normalized,normalized,nullif(p->>'phone',''),nullif(p->>'telegram_handle',''),coalesce((p->>'marketing_consent')::boolean,false),CASE WHEN (p->>'marketing_consent')::boolean THEN clock_timestamp() END,CASE WHEN (p->>'marketing_consent')::boolean THEN 'campaign-single-opt-in:'||c.slug||':'||coalesce(p->>'marketing_consent_version','legacy') END,'2026-09') ON CONFLICT(email_normalized) DO NOTHING RETURNING * INTO ct;
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
      'attribution',p->'attribution','marketing_consent',ct.marketing_consent,'submitted_email_consent',p->'marketing_consent','consent_version',p->>'marketing_consent_version','consent_scope','email-marketing','consent_text',CASE WHEN p->>'marketing_consent_version'='campaign-email-offer-2026-11-17' THEN 'I agree to receive email updates about SamaSama product launches, sourcing progress and offers. This subscription is required to receive the promotional code. I can unsubscribe anytime.' END));
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
 -- Existing opt-outs/no-consent records cannot be resubscribed by an unverified public request.
 IF NOT coalesce(ct.marketing_consent,false) OR ct.unsubscribed_at IS NOT NULL OR p->>'marketing_consent' IS DISTINCT FROM 'true' OR p->>'marketing_consent_version' IS DISTINCT FROM 'campaign-email-offer-2026-11-17' THEN RETURN r;END IF;
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

ALTER FUNCTION public.register_campaign_intent(jsonb) OWNER TO postgres;
ALTER FUNCTION public.register_campaign_intent_discount(jsonb,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.register_campaign_intent(jsonb),public.register_campaign_intent_discount(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_campaign_intent(jsonb),public.register_campaign_intent_discount(jsonb,jsonb) TO service_role;
COMMIT;
