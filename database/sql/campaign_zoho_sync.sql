-- Apply after the three campaign migrations. No existing contacts are sent automatically.
CREATE TABLE IF NOT EXISTS campaign_crm_sync (
 contact_id uuid PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 1,
 synced_revision bigint NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','synced','failed')),
 claim_id uuid,
 claimed_at timestamptz,
 zoho_lead_id text,
 last_error text,
 synced_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE campaign_crm_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON campaign_crm_sync FROM anon, authenticated;
GRANT ALL ON campaign_crm_sync TO service_role;

CREATE OR REPLACE FUNCTION queue_campaign_crm(p_contact_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM campaign_leads l JOIN campaigns c ON c.id=l.campaign_id WHERE l.contact_id=p_contact_id AND NOT c.is_test) THEN RETURN; END IF;
 INSERT INTO campaign_crm_sync(contact_id) VALUES(p_contact_id)
 ON CONFLICT(contact_id) DO UPDATE SET revision=campaign_crm_sync.revision+1,
 status=CASE WHEN campaign_crm_sync.status='sending' THEN 'sending' ELSE 'queued' END,updated_at=now();
END $$;
CREATE OR REPLACE FUNCTION campaign_crm_vote_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM campaigns WHERE id=NEW.campaign_id AND NOT is_test) THEN PERFORM queue_campaign_crm(NEW.contact_id); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS campaign_crm_vote ON campaign_leads;
CREATE TRIGGER campaign_crm_vote AFTER INSERT OR UPDATE ON campaign_leads FOR EACH ROW EXECUTE FUNCTION campaign_crm_vote_trigger();
CREATE OR REPLACE FUNCTION campaign_crm_consent_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.marketing_consent IS DISTINCT FROM OLD.marketing_consent OR NEW.unsubscribed_at IS DISTINCT FROM OLD.unsubscribed_at THEN PERFORM queue_campaign_crm(NEW.id); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS campaign_crm_consent ON contacts;
CREATE TRIGGER campaign_crm_consent AFTER UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION campaign_crm_consent_trigger();

CREATE OR REPLACE FUNCTION claim_campaign_crm(p_contact_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job campaign_crm_sync; snapshot jsonb;
BEGIN
 SELECT * INTO job FROM campaign_crm_sync WHERE contact_id=p_contact_id FOR UPDATE;
 IF NOT FOUND OR job.revision=job.synced_revision OR (job.status='sending' AND job.claimed_at>now()-interval '5 minutes') THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('email',ct.email_normalized,'phone',ct.phone,'telegram',ct.telegram_handle,
 'consent',ct.marketing_consent,'unsubscribed',ct.unsubscribed_at IS NOT NULL,
 'product',pr.public_name,'campaign',c.name,'interest',l.purchase_intent,
 'source',l.utm_source,'medium',l.utm_medium,'utm_campaign',l.utm_campaign,'creative',l.utm_content)
 INTO snapshot FROM contacts ct JOIN campaign_leads l ON l.contact_id=ct.id
 JOIN campaigns c ON c.id=l.campaign_id JOIN campaign_products pr ON pr.id=l.selected_campaign_product_id
 WHERE ct.id=p_contact_id AND NOT c.is_test ORDER BY l.updated_at DESC,l.id DESC LIMIT 1;
 IF snapshot IS NULL THEN RETURN NULL; END IF;
 UPDATE campaign_crm_sync SET status='sending',claim_id=gen_random_uuid(),claimed_at=now(),last_error=NULL WHERE contact_id=p_contact_id RETURNING * INTO job;
 RETURN jsonb_build_object('claim_id',job.claim_id,'revision',job.revision,'snapshot',snapshot);
END $$;
CREATE OR REPLACE FUNCTION finish_campaign_crm(p_contact_id uuid,p_claim_id uuid,p_revision bigint,p_zoho_id text,p_error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE campaign_crm_sync SET
 status=CASE WHEN p_error IS NOT NULL THEN 'failed' WHEN revision=p_revision THEN 'synced' ELSE 'queued' END,
 synced_revision=CASE WHEN p_error IS NULL THEN p_revision ELSE synced_revision END,
 zoho_lead_id=coalesce(p_zoho_id,zoho_lead_id),last_error=left(p_error,300),
 synced_at=CASE WHEN p_error IS NULL THEN now() ELSE synced_at END,claim_id=NULL,claimed_at=NULL
 WHERE contact_id=p_contact_id AND claim_id=p_claim_id;
END $$;
REVOKE ALL ON FUNCTION queue_campaign_crm(uuid),claim_campaign_crm(uuid),finish_campaign_crm(uuid,uuid,bigint,text,text),campaign_crm_vote_trigger(),campaign_crm_consent_trigger() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION queue_campaign_crm(uuid),claim_campaign_crm(uuid),finish_campaign_crm(uuid,uuid,bigint,text,text) TO service_role;
