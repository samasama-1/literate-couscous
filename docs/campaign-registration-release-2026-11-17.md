# Campaign registration release — SQL and settings handoff

Prepared 17 November 2026. Marcus approved committing and SQL preparation, not remote execution, pushing or deployment. Campaign/email/terms appearance is accepted for this preparation; supplier evidence and actual saved live-campaign content remain separate launch checks.

## What is in this release

Single-step registration → one acknowledgement containing an eligible original personal code; optional initial marketing choice; protected existing contact/pick/unsubscribe state; ten-minute repeat-email cooldown; bounded known-unsent retries in the authenticated existing email worker; admin email report; formatted email/image and offer terms; corrected local preview prices. No reconfirmation, OTP, new scheduler, fee activation or payment/collection change.

## SQL: exact order

Use Supabase SQL Editor in the intended SamaSama project, role **postgres**. Confirm the project yourself; no remote state was inspected during preparation. Run each file in full as its own query. Do not replace a file's contents or paste keys into SQL.

1. **Read-only preflight:** `database/sql/campaign_registration_preflight.sql`. All listed prerequisites must be installed and reviewed, owned by postgres with safe search paths, no anon/authenticated EXECUTE and intended service access. `no_superseded_owner_flow` must be true. This metadata check does not establish exact installed definitions, enabled sending limits or application settings.
2. **Only new campaign migration:** `database/sql/campaign_registration_safety.sql`. Transactional, uses five-second lock/45-second statement timeouts; does not activate sending or coupon issuance. It can briefly block writes while indexes/DDL are installed. If it errors, stop: its transaction must roll back; do not skip statements. A superseded owner schema deliberately causes failure and needs a separate compatibility migration, not deletion or an old/new function mixture.
3. **Read-only postcheck:** `database/sql/campaign_registration_postcheck.sql`. Expect eight installed postgres-owned SECURITY DEFINER functions with `search_path=pg_catalog, pg_temp`, anon/authenticated false and service true; a private RLS-enabled report table with all three direct SELECT checks false; five named indexes; and no superseded owner flow. Investigate missing or different results before activation.

The existing prerequisites include campaign lead/hardening/content/CRM, discounts and the **reviewed shared V2 mailbox runtime** (`order_operations_runtime.sql`) plus their existing order/collection prerequisites. Do **not** reapply those older files as part of this handoff: they replace financial/queue functions and are not an automatic upgrade sequence. If the preflight reports a missing runtime or other prerequisite, obtain a separate compatible rollout review first. Installing runtime SQL alone also does not enable its private sending budgets; confirm the approved limits through Operations health/admin procedures.

Do not run campaign registration/worker claim/cleanup RPCs as a substitute for metadata checks on real data. Preflight/postcheck perform no claims, sends, deletes or customer-data exports.

## Vercel settings and deployment sequence

Keep the public campaign closed during the coordinated cutover. Do not remove Coming Soon or activate campaign traffic merely by committing.

| Setting | Treatment |
|---|---|
| `CAMPAIGN_REGISTRATION_V2` | Keep false/off until the new SQL and compatible deployed code/runtime are ready; then explicitly set true for single-step protected registration. It does not enable reconfirmation. |
| `CAMPAIGN_CONFIRMATION_RETRIES_ENABLED` | Keep false for initial controlled inbox checks. Set true only after acceptance/historical-queue review; this adds the bounded consumer to existing authenticated email-worker ticks. |
| `ORDER_RUNTIME_V2` | Must already be reviewed/installed and configured before enabling this new registration path. Do not toggle it just to bypass a setup error. |
| `CAMPAIGN_EMAIL_PROVIDER` | `zoho` for this shared-runtime rollout. Do not switch providers for an already-attempted message. |
| `CAMPAIGN_DISCOUNTS_INSTALLED` | True only where the existing discount SQL is installed. Verify the separate admin issuance control; the new SQL does not enable it. |
| `ORDER_EMAIL_ENABLED` | Verify the existing email worker is enabled and its authenticated schedule actually runs. Do not create a duplicate schedule. |
| `NEXT_PUBLIC_SITE_URL` | Verify the intended canonical public HTTPS origin, e.g. `https://www.samasama.sg`. It contains no credentials; email/terms/image links use it. |

Reuse existing server-only Zoho Mail credentials, `ORDER_EMAIL_LINK_KEY`, service-role configuration and `ORDER_WORKER_SECRET`. Do not rotate the link key during this release: issued encrypted coupons depend on it. Never use NEXT_PUBLIC prefixes for credentials or paste values into chat/logs/SQL. Check that the production worker secret still matches Vault privately. No new secret is required. Keep unrelated financial, collection and storage flags unchanged.

After approved SQL, deploy the matching committed code/assets and settings through the existing Git/Vercel workflow. A Git push may trigger production deployment; pushing is a separate step from this local commit. New default-off flags mean the consumer/new RPC are not silently enabled by source deployment; however the revised email appearance and protected legacy SQL definition do take effect when code/SQL are installed. Therefore coordinate both while traffic remains closed.

## Acceptance before enabling retries/public registration

With separately approved test sends, use controlled owned inboxes and test records:

- New interest receives one acknowledgement with selected product/price, unchanged eligible code/original expiry, visible S$50/ten-unit conditions and valid terms/How It Works/support links. No extra confirmation is required. Check an actual mobile/desktop inbox and images blocked.
- Marketing unchecked still receives an eligible coupon; initial checked consent is recorded as single opt-in, never verified inbox ownership. Repeats cannot overwrite existing details/pick or reverse unsubscribe. Support handles corrections.
- Same-request replay and submissions within ten minutes do not create duplicate codes/mail. Later permitted requests reuse the same original code/expiry. Unknown sends are quarantined; only known-unsent new-flow jobs retry.
- Verify admin and CRM outcomes, including no-consent/opt-out. Coupon issuance must actually be enabled and installed before advertising it on the saved live campaign.
- Inspect `/admin/campaigns/mail`: worker heartbeat, next due candidate, redacted recent sample and accepted/failed/queued outcomes. The 100-row sample is not the complete backlog. Existing historical jobs are excluded from automatic retry and require manual provider reconciliation.
- Verify the existing email and CRM workers remain healthy. Campaign sending shares the approved routine mailbox budget; order/security work runs first. At five-minute ticks the campaign consumer can claim at most 60 candidates/hour, not guarantee 60 deliveries. Do not increase provider budgets without checking actual allowance.
- Verify actual saved live campaign names, prices, product/model/photo/specification evidence, dates, success text and active/non-test settings. Local preview edits do not rewrite saved campaigns.

Cleanup is bounded (up to 100 expired rate-limit rows per enabled campaign worker pass) and does not run on customer requests. With retries off or no worker ticks it is not automatic; verify worker/report freshness before opening traffic. This release does not delete failed email jobs or certify historical consent.

## Stop/recover

Close public campaign registrations, disable `CAMPAIGN_CONFIRMATION_RETRIES_ENABLED`, and disable the new registration flag while investigating. Already-running sends may finish. Preserve safe SQL, original code/expiry, unsubscribe state, financial records and provider outcomes; never restore the unsafe public overwrite/re-subscribe function or bulk-reset unknown messages. Do not roll `ORDER_RUNTIME_V2` back independently after runtime guards are installed: that is a separate coordinated change. Existing order/payment/collection safeguards and scheduler continue unchanged.

No new SQL/env setting is needed specifically for the decorative image or offer-terms page. Their deployment is part of the application release; inbox images must resolve at the static public asset path. A database rollback is not a way to retract an email or financial record.

## Final local verification for the commit

128 tests passed, zero failures. This includes both read-only SQL scripts, repeatable migration, rejection of an obsolete owner-flow schema, service-only RPC grants, protected single-step registration, coupon preservation, retry/provider ambiguity and worker authentication. Legacy campaign test fixtures now derive their prices from the updated approved demo records rather than stale pre-increase literals. TypeScript, ESLint, the production webpack build and diff whitespace checks passed; credential-pattern scan found no matches in the selected files. Tests/build blocked external network access. Independent PostgreSQL-session contention, production schema/settings, actual provider budgets and approved inbox/CRM acceptance remain unverified.
