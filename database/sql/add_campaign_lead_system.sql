-- Pre-launch campaign demand-validation / lead-management system
-- Run this in Supabase SQL Editor after the existing schema/security scripts.

CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone TEXT,
  telegram_handle TEXT,
  first_name TEXT,
  marketing_consent BOOLEAN DEFAULT false NOT NULL,
  marketing_consent_at TIMESTAMPTZ,
  consent_source TEXT,
  privacy_policy_version TEXT,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT contacts_email_normalized_unique UNIQUE (email_normalized),
  CONSTRAINT contacts_email_normalized_lower CHECK (email_normalized = lower(btrim(email_normalized)))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  headline TEXT,
  subheadline TEXT,
  cta_text TEXT DEFAULT 'Register my pick' NOT NULL,
  confirmation_text TEXT,
  status TEXT DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  reservation_enabled BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT campaigns_slug_unique UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS campaign_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  public_name TEXT NOT NULL,
  public_label TEXT,
  short_description TEXT,
  key_benefit TEXT,
  key_differentiator TEXT,
  specifications JSONB DEFAULT '[]'::jsonb NOT NULL,
  tradeoff TEXT,
  estimated_price_cents INTEGER NOT NULL CHECK (estimated_price_cents >= 0),
  currency TEXT DEFAULT 'SGD' NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  image_url TEXT,
  active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT campaign_products_campaign_public_name_unique UNIQUE (campaign_id, public_name)
);

CREATE TABLE IF NOT EXISTS campaign_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  selected_campaign_product_id UUID REFERENCES campaign_products(id) ON DELETE RESTRICT NOT NULL,
  price_shown_cents INTEGER NOT NULL CHECK (price_shown_cents >= 0),
  currency TEXT DEFAULT 'SGD' NOT NULL,
  purchase_intent TEXT NOT NULL CHECK (purchase_intent IN ('yes', 'maybe', 'no')),
  funnel_status TEXT DEFAULT 'intent_registered' NOT NULL CHECK (
    funnel_status IN (
      'intent_registered',
      'reservation_invited',
      'reserved',
      'group_buy_invited',
      'deposit_paid',
      'order_confirmed',
      'reservation_expired',
      'refunded',
      'not_interested',
      'unsubscribed'
    )
  ),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  referrer TEXT,
  landing_variant TEXT,
  anonymous_session_id TEXT,
  first_touch_source TEXT,
  latest_touch_source TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT campaign_leads_campaign_contact_unique UNIQUE (campaign_id, contact_id)
);

CREATE TABLE IF NOT EXISTS funnel_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  campaign_lead_id UUID REFERENCES campaign_leads(id) ON DELETE SET NULL,
  campaign_product_id UUID REFERENCES campaign_products(id) ON DELETE SET NULL,
  anonymous_session_id TEXT,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL CHECK (template_key IN ('intent_confirmation', 'campaign_update', 'reservation_invite', 'group_buy_invite')),
  subject TEXT,
  status TEXT DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'testing', 'queued', 'sending', 'sent', 'cancelled', 'failed')),
  segment_filters JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  campaign_lead_id UUID REFERENCES campaign_leads(id) ON DELETE SET NULL,
  email_campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  provider TEXT,
  provider_message_id TEXT,
  status TEXT DEFAULT 'queued' NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_products_campaign_idx ON campaign_products (campaign_id, active, display_order);
CREATE INDEX IF NOT EXISTS campaign_leads_campaign_idx ON campaign_leads (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_leads_product_idx ON campaign_leads (selected_campaign_product_id);
CREATE INDEX IF NOT EXISTS campaign_leads_intent_idx ON campaign_leads (purchase_intent);
CREATE INDEX IF NOT EXISTS campaign_leads_status_idx ON campaign_leads (funnel_status);
CREATE INDEX IF NOT EXISTS campaign_leads_utm_source_idx ON campaign_leads (utm_source);
CREATE INDEX IF NOT EXISTS funnel_events_campaign_idx ON funnel_events (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_session_idx ON funnel_events (anonymous_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_type_idx ON funnel_events (event_type);
CREATE INDEX IF NOT EXISTS email_deliveries_lead_template_idx ON email_deliveries (campaign_lead_id, template_key);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_set_updated_at ON contacts;
CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS campaigns_set_updated_at ON campaigns;
CREATE TRIGGER campaigns_set_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS campaign_products_set_updated_at ON campaign_products;
CREATE TRIGGER campaign_products_set_updated_at
  BEFORE UPDATE ON campaign_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS campaign_leads_set_updated_at ON campaign_leads;
CREATE TRIGGER campaign_leads_set_updated_at
  BEFORE UPDATE ON campaign_leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS email_campaigns_set_updated_at ON email_campaigns;
CREATE TRIGGER email_campaigns_set_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read active campaigns" ON campaigns;
CREATE POLICY "Allow public read active campaigns"
  ON campaigns FOR SELECT
  USING (
    status = 'active'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

DROP POLICY IF EXISTS "Allow public read active campaign products" ON campaign_products;
CREATE POLICY "Allow public read active campaign products"
  ON campaign_products FOR SELECT
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_products.campaign_id
        AND campaigns.status = 'active'
        AND (campaigns.starts_at IS NULL OR campaigns.starts_at <= now())
        AND (campaigns.ends_at IS NULL OR campaigns.ends_at >= now())
    )
  );

-- No public policies are created for contacts, campaign_leads, funnel_events,
-- email_campaigns, or email_deliveries. The Next.js server uses the service role
-- key for trusted writes and admin reads.
