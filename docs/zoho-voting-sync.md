# Connect voting submissions to Zoho CRM

## What is ready in code

Live campaign submissions save in Supabase first. A database trigger queues the CRM sync in the same transaction. After the response, the app attempts the sync when `ZOHO_CAMPAIGN_SYNC_ENABLED=true`. Failures remain visible for manual retry on the admin lead detail; there is no scheduled retry service yet. Queues are serialized per contact, and changes during a sync remain queued for another attempt. A process interrupted mid-sync can be retried after five minutes.

Preview and test campaigns never sync. No production database migration or CRM write has been executed as part of implementation. Automated email sending remains off unless `CAMPAIGN_EMAIL_PROVIDER=resend` is explicitly set. Zoho Mail sending is a separate next step; these OAuth scopes do not grant Mail access.

## Setup, in order

1. In Supabase SQL Editor, apply `database/sql/campaign_zoho_sync.sql` after the three campaign migrations listed in the owner manual. It adds a private queue and trusted functions. It does not backfill or send existing records.
2. Commit and deploy the implementation. Keep the sync flag unset initially.
3. Sign in as admin on the production hostname, then visit `/api/zoho/authorize`. Approve the new Leads CREATE/UPDATE/READ and secure-search permissions. Existing Contacts/Deals permissions remain included.
4. Replace `ZOHO_REFRESH_TOKEN` in hosting with the newly returned token; retain the matching API and Accounts domains. Never commit tokens.
5. Set `ZOHO_CAMPAIGN_SYNC_ENABLED=true` and redeploy. Leave `CAMPAIGN_EMAIL_PROVIDER` unset for this CRM-only test.
6. Create a separate **live-mode staging campaign** in the admin editor. Activate it and submit your own email through `/campaign/<slug>`. The instant preview and test-mode campaigns deliberately do not sync.
7. Open your response in `/admin/campaigns`, check **Zoho CRM sync**, then check the corresponding Lead in Zoho. Repeat with a changed product and confirm it updates the same Lead. Use **Sync / retry Zoho** if queued/failed or to sync an older live response deliberately.
8. Test unchecked consent and website unsubscribe. Check both Marketing Consent and Email Opt Out. Do not enable email workflows until unsubscribe handling from your chosen mail system back into SamaSama is designed and tested.

## Field mapping and behavior

| Website | Zoho API field |
| --- | --- |
| Email | Email |
| Optional phone | Mobile |
| Telegram | Telegram_Handle |
| Latest product | SamaSama_Product |
| Latest campaign | SamaSama_Campaign |
| Yes / No | SamaSama_Interest |
| Marketing permission | Marketing_Consent |
| Website unsubscribe | Email_Opt_Out = true |
| Campaign/source/creative summary | Description (appended without deleting existing text) |

One CRM Lead per primary email. Multiple matching primary emails are flagged for review. A new Lead uses the explicit name placeholder “SamaSama voter”, since the current form does not collect names. Existing names and Lead Status are left unchanged. If Company is mandatory in your layout, make it optional for this consumer voting flow; do not supply invented companies.

CRM's custom product/campaign fields show the latest live response across campaigns. Distinct summaries are appended to Description; full response and event history remains in SamaSama. This is not a separate CRM record per campaign. Legacy Maybe responses map to an empty interest value instead of being relabelled No.

A website unsubscribe sets CRM Email Opt Out. A CRM opt-out is never cleared by this integration and forces Marketing Consent false on the next sync. CRM changes do not currently sync back into the website. Require Marketing Consent=true AND Email Opt Out=false for promotional sends. There is no automatic mailing from these sync calls: workflow triggers and cadences are explicitly suppressed.

When a CRM lookup fails, the integration stops instead of creating a possible duplicate. Token/field/permission errors are shown without secrets or raw provider payloads. If a create succeeded but its response was lost, retries search/upsert by email. Existing records use their modification timestamp to avoid overwriting a concurrent CRM edit.

References: [Upsert](https://www.zoho.com/crm/developer/docs/api/v8/upsert-records.html), [Search and permissions](https://www.zoho.com/crm/developer/docs/api/v8/search-records.html).
