# Security review — 30 September 2026

Scope: local application code, Zoho integration, campaign SQL permissions and installed dependencies. This is not a penetration test or verification of production configuration. No production changes, CRM writes or emails were made. `campaign_zoho_sync.sql` was not changed during this review.

## Fixed locally; deployment required

- Removed public Server Action exposure from the older Zoho helper module. Its CRM mutation helpers are now server-only utilities called by application flows. Confirmed the three helpers are absent from the production Server Action manifest.
- Removed customer data and raw provider response/error logging from those helpers; added bounded request timeouts, no caching and rejection of redirects.
- Tightened OAuth callback URL validation and added frame-blocking headers to the sensitive callback response.
- Made the new CRM transport reject malformed search responses and existing records without a concurrency timestamp. A concurrent CRM edit fails rather than being overwritten by an unconditional retry.
- Updated Next.js and compatible dependencies. The final npm audit reported zero known vulnerabilities; this does not establish that the application has no vulnerabilities.

## Unresolved before public launch

### High: voting does not verify email ownership

`database/sql/harden_campaign_lead_system.sql`, contact upsert around lines 73–83, updates an existing contact by submitted email. Someone who knows another person's email can change contact details, submit a response and record marketing consent. Checking consent can also clear an existing unsubscribe timestamp. Rate limiting and a honeypot do not establish ownership.

Require an email verification link or code before applying contact/response changes or enabling marketing consent. Keep pending submissions separate from verified contact state. Until then, use controlled testing and leave automated marketing disabled. The existing CRM opt-out safeguard reduces one downstream risk but does not fix website identity verification.

### High: pending order code disclosure

`src/app/actions/join.ts`, around lines 33–60, returns an existing pending order code using only a batch and supplied phone number. This lets someone who knows those values obtain another person's order code. The public join flow also lacks an explicit rate limit.

Require verified ownership before resuming an existing order, avoid returning its code from an anonymous duplicate submission, and add abuse controls. This older order flow was not modified in this review.

### Credential rotation

The Zoho client secret was previously pasted into the conversation. Rotate it in Zoho and update local and hosting environment settings before launch. No misuse was established. A local check found no current sensitive environment values in tracked working files; Git history and production logs were not exhaustively scanned.

## Verification and next steps

- 27 tests passed, including queue permissions, test-campaign isolation, CRM error handling and concurrency cases.
- Lint, production build and whitespace checks passed.
- Production Supabase RLS, grants and deployed environment values still need verification after the migration.
- Deploy the reviewed code and run one controlled live-campaign submission with your own address. Confirm the database response and matching CRM fields. Preview submissions do not sync.
- Keep email automation disabled until ownership verification and consent handling are addressed. Zoho Mail automation is not implemented by this review.
