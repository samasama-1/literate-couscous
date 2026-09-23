-- Apply AFTER add_campaign_lead_system.sql. Additive; preserves existing leads.
BEGIN;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS attempted_at timestamptz;
ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_status_check;
ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_status_check CHECK (status IN ('queued','sending','sent','failed','skipped'));
CREATE TABLE IF NOT EXISTS campaign_requests (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaign_rate_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_sessions (
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  session_id text NOT NULL,
  lead_id uuid REFERENCES campaign_leads(id),
  PRIMARY KEY(campaign_id,session_id)
);
-- Recover unambiguous pre-upgrade session history; never guess shared-session ownership.
INSERT INTO campaign_sessions(campaign_id,session_id,lead_id)
SELECT campaign_id,anonymous_session_id,(array_agg(id))[1] FROM campaign_leads
WHERE anonymous_session_id IS NOT NULL
GROUP BY campaign_id,anonymous_session_id HAVING count(*)=1
ON CONFLICT DO NOTHING;
UPDATE funnel_events e SET campaign_lead_id=s.lead_id,contact_id=l.contact_id
FROM campaign_sessions s JOIN campaign_leads l ON l.id=s.lead_id
WHERE e.campaign_id=s.campaign_id AND e.anonymous_session_id=s.session_id AND e.campaign_lead_id IS NULL;
ALTER TABLE campaign_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS email_delivery_queue_idx ON email_deliveries(status,created_at);
CREATE INDEX IF NOT EXISTS funnel_events_lead_idx ON funnel_events(campaign_lead_id,created_at);

CREATE OR REPLACE FUNCTION campaign_rate_limit(p_key text, p_limit integer, p_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO campaign_rate_limits(key,hits,expires_at) VALUES(p_key,1,now()+make_interval(secs=>p_seconds))
  ON CONFLICT(key) DO UPDATE SET
    hits = CASE WHEN campaign_rate_limits.expires_at < now() THEN 1 ELSE campaign_rate_limits.hits+1 END,
    expires_at = CASE WHEN campaign_rate_limits.expires_at < now() THEN excluded.expires_at ELSE campaign_rate_limits.expires_at END
  RETURNING hits INTO n;
  DELETE FROM campaign_rate_limits WHERE expires_at < now()-interval '1 day';
  RETURN n <= p_limit;
END $$;

CREATE OR REPLACE FUNCTION register_campaign_intent(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c campaigns; pr campaign_products; ct contacts; l campaign_leads; old_l campaign_leads;
  mail_id uuid; result jsonb; prior jsonb; sid text; owner_id uuid; normalized text;
BEGIN
  normalized := lower(btrim(p->>'email'));
  IF normalized IS NULL OR length(normalized)>254 OR normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR coalesce(p->>'purchase_intent','') NOT IN ('yes','maybe','no') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  -- Serializes retries of this request, including retries with differing emails.
  PERFORM pg_advisory_xact_lock(hashtextextended(p->>'request_id',0));
  SELECT r.result INTO prior FROM campaign_requests r WHERE r.id=(p->>'request_id')::uuid;
  IF FOUND THEN RETURN prior; END IF;
  SELECT * INTO c FROM campaigns WHERE slug=p->>'campaign_slug' FOR SHARE;
  IF NOT FOUND OR c.status<>'active' OR c.starts_at>now() OR c.ends_at<now() THEN RAISE EXCEPTION 'CAMPAIGN_INACTIVE'; END IF;
  SELECT * INTO pr FROM campaign_products WHERE id=(p->>'product_id')::uuid AND campaign_id=c.id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PRODUCT'; END IF;
  IF pr.estimated_price_cents IS DISTINCT FROM (p->>'price_shown_cents')::integer
    OR pr.currency IS DISTINCT FROM p->>'currency' THEN RAISE EXCEPTION 'PRICE_CHANGED'; END IF;
  -- Serialize different requests for the same contact; all writes below commit together.
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized,1));
  INSERT INTO contacts(email,email_normalized,phone,telegram_handle,marketing_consent,marketing_consent_at,consent_source,privacy_policy_version)
  VALUES(normalized,normalized,p->>'phone',p->>'telegram_handle',(NOT c.is_test AND coalesce((p->>'marketing_consent')::boolean,false)),
    CASE WHEN NOT c.is_test AND (p->>'marketing_consent')::boolean THEN now() END,
    CASE WHEN NOT c.is_test AND (p->>'marketing_consent')::boolean THEN 'campaign:'||c.slug END,'2026-09')
  ON CONFLICT(email_normalized) DO UPDATE SET
    phone=CASE WHEN c.is_test THEN contacts.phone ELSE coalesce(excluded.phone,contacts.phone) END,
    telegram_handle=CASE WHEN c.is_test THEN contacts.telegram_handle ELSE coalesce(excluded.telegram_handle,contacts.telegram_handle) END,
    marketing_consent=contacts.marketing_consent OR excluded.marketing_consent,
    marketing_consent_at=CASE WHEN excluded.marketing_consent AND NOT contacts.marketing_consent THEN now() ELSE contacts.marketing_consent_at END,
    consent_source=CASE WHEN excluded.marketing_consent AND NOT contacts.marketing_consent THEN excluded.consent_source ELSE contacts.consent_source END,
    unsubscribed_at=CASE WHEN excluded.marketing_consent THEN NULL ELSE contacts.unsubscribed_at END
  RETURNING * INTO ct;
  SELECT * INTO old_l FROM campaign_leads WHERE campaign_id=c.id AND contact_id=ct.id FOR UPDATE;
  IF old_l.id IS NOT NULL AND old_l.funnel_status IN ('reserved','deposit_paid','order_confirmed','refunded')
    AND (old_l.selected_campaign_product_id<>pr.id OR old_l.price_shown_cents<>pr.estimated_price_cents OR old_l.purchase_intent<>p->>'purchase_intent')
    THEN RAISE EXCEPTION 'PAID_RESPONSE_LOCKED'; END IF;
  sid:=p->>'session_id';
  INSERT INTO campaign_leads(campaign_id,contact_id,selected_campaign_product_id,price_shown_cents,currency,purchase_intent,
    utm_source,utm_medium,utm_campaign,utm_content,utm_term,referrer,landing_variant,anonymous_session_id,first_touch_source,latest_touch_source)
  VALUES(c.id,ct.id,pr.id,pr.estimated_price_cents,pr.currency,p->>'purchase_intent',p->'attribution'->>'utm_source',p->'attribution'->>'utm_medium',
    p->'attribution'->>'utm_campaign',p->'attribution'->>'utm_content',p->'attribution'->>'utm_term',p->'attribution'->>'referrer',
    p->'attribution'->>'landing_variant',sid,p->'attribution'->>'first_touch_source',p->'attribution'->>'latest_touch_source')
  ON CONFLICT(campaign_id,contact_id) DO UPDATE SET
    selected_campaign_product_id=excluded.selected_campaign_product_id,price_shown_cents=excluded.price_shown_cents,
    currency=excluded.currency,purchase_intent=excluded.purchase_intent,
    first_touch_source=coalesce(campaign_leads.first_touch_source,excluded.first_touch_source),
    latest_touch_source=excluded.latest_touch_source
  RETURNING * INTO l;
  -- First-touch UTM fields and lifecycle status survive re-voting.
  INSERT INTO campaign_sessions(campaign_id,session_id,lead_id) VALUES(c.id,sid,l.id)
  ON CONFLICT(campaign_id,session_id) DO UPDATE SET lead_id=coalesce(campaign_sessions.lead_id,excluded.lead_id)
  RETURNING lead_id INTO owner_id;
  IF owner_id=l.id THEN
    UPDATE funnel_events SET contact_id=ct.id,campaign_lead_id=l.id
      WHERE campaign_id=c.id AND anonymous_session_id=sid AND campaign_lead_id IS NULL;
  END IF;
  INSERT INTO funnel_events(campaign_id,contact_id,campaign_lead_id,campaign_product_id,anonymous_session_id,event_type,metadata)
  VALUES(c.id,ct.id,l.id,pr.id,sid,CASE WHEN old_l.id IS NULL THEN 'intent_submitted' ELSE 'intent_updated' END,
    jsonb_build_object('purchase_intent',l.purchase_intent,'price_shown_cents',l.price_shown_cents,'product_name',pr.public_name,
      'previous_product_id',old_l.selected_campaign_product_id,'previous_intent',old_l.purchase_intent,'previous_price_cents',old_l.price_shown_cents,
      'attribution',p->'attribution','marketing_consent',ct.marketing_consent));
  IF old_l.id IS NULL THEN
    INSERT INTO funnel_events(campaign_id,contact_id,campaign_lead_id,event_type) VALUES(c.id,ct.id,l.id,'contact_registered');
  END IF;
  IF NOT c.is_test THEN
    INSERT INTO email_deliveries(contact_id,campaign_lead_id,template_key,recipient_email,provider,status,metadata)
    VALUES(ct.id,l.id,'intent_confirmation',ct.email,'resend','queued',jsonb_build_object('product_name',pr.public_name,
      'price_shown_cents',l.price_shown_cents,'currency',l.currency,'purchase_intent',l.purchase_intent)) RETURNING id INTO mail_id;
    INSERT INTO funnel_events(campaign_id,contact_id,campaign_lead_id,event_type,metadata)
    VALUES(c.id,ct.id,l.id,'confirmation_email_queued',jsonb_build_object('delivery_id',mail_id));
  END IF;
  result:=jsonb_build_object('lead_id',l.id,'product_name',pr.public_name,'already_registered',old_l.id IS NOT NULL,'delivery_id',mail_id,'is_test',c.is_test);
  INSERT INTO campaign_requests(id,campaign_id,contact_id,result) VALUES((p->>'request_id')::uuid,c.id,ct.id,result);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION record_campaign_event(p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c campaigns; l campaign_leads; owner_id uuid;
BEGIN
  IF coalesce(p->>'event_type','') NOT IN ('campaign_view','product_selected','intent_started') THEN RAISE EXCEPTION 'INVALID_EVENT'; END IF;
  SELECT * INTO c FROM campaigns WHERE id=(p->>'campaign_id')::uuid AND status='active';
  IF NOT FOUND OR c.starts_at>now() OR c.ends_at<now() THEN RAISE EXCEPTION 'CAMPAIGN_INACTIVE'; END IF;
  IF p->>'product_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campaign_products WHERE id=(p->>'product_id')::uuid AND campaign_id=c.id AND active) THEN RAISE EXCEPTION 'INVALID_PRODUCT'; END IF;
  INSERT INTO campaign_sessions(campaign_id,session_id) VALUES(c.id,p->>'session_id') ON CONFLICT DO NOTHING;
  SELECT lead_id INTO owner_id FROM campaign_sessions WHERE campaign_id=c.id AND session_id=p->>'session_id' FOR UPDATE;
  SELECT * INTO l FROM campaign_leads WHERE id=owner_id;
  INSERT INTO funnel_events(campaign_id,contact_id,campaign_lead_id,campaign_product_id,anonymous_session_id,event_type,metadata)
  VALUES(c.id,l.contact_id,l.id,(p->>'product_id')::uuid,p->>'session_id',p->>'event_type',coalesce(p->'metadata','{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION unsubscribe_campaign_contact(p_contact_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE contacts SET marketing_consent=false,unsubscribed_at=now() WHERE id=p_contact_id;
  IF FOUND THEN INSERT INTO funnel_events(contact_id,event_type) VALUES(p_contact_id,'unsubscribe'); END IF;
END $$;

-- All functions are trusted-server-only. No browser RPC access, even when logged in.
REVOKE ALL ON FUNCTION campaign_rate_limit(text,integer,integer), register_campaign_intent(jsonb), record_campaign_event(jsonb), unsubscribe_campaign_contact(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION campaign_rate_limit(text,integer,integer), register_campaign_intent(jsonb), record_campaign_event(jsonb), unsubscribe_campaign_contact(uuid) TO service_role;
COMMIT;
