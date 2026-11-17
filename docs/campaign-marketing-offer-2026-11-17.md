# Promotional email subscription — 17 November 2026

Marcus approved changing new promotional signups to explicit email marketing subscription in exchange for the eligible first-order code. This supersedes the earlier policy that marketing consent never affected new issuance. No remote SQL, deployments, settings, customer emails or existing data have been changed.

## Customer experience

The offer form requires an unchecked checkbox explaining email product launches, sourcing progress and offers, the code condition and withdrawal. Button: “Subscribe and get my code”. Phone/Telegram remain optional operational details, not marketing-channel consent. Normal-price purchases do not require subscription. No reconfirmation step is added.

Unsubscribing never revokes an issued code or resets expiry. Existing contacts, opt-outs, product choices and coupon rules remain protected. An existing unsubscribed/non-consenting contact cannot receive a new code through public re-registration; support must handle a genuine owner's request through a separately verified process. The public response never reveals that an email already exists. New contacts only are subscribed by this single-step form; it does not prove inbox ownership. No retroactive consent changes or awards.

## Implementation and cost

`campaign_marketing_offer.sql` replaces only the hardened base registration and discount issuance functions. Active non-test promotional registrations require boolean true and exact consent version. New awards also require current stored consent and no unsubscribe. Replay idempotency and old issued codes remain intact. Existing indexed singleton controls, email lookups and transaction locks are reused; no new scans, jobs, schedules or tables. Existing event metadata records the submitted choice, wording/version, email scope and effective stored choice, with event timestamp and campaign/contact linkage. New contact consent source includes the version; consent timestamp is retained. Submission evidence for existing contacts does not authorize resubscription.

Existing Zoho transport already sends effective stored `Marketing_Consent` and preserves `Email_Opt_Out`; no transport change is needed. Check actual CRM outcomes in acceptance. Mail footer, landing/form/success copy and public offer terms match the new policy. No new environment variables or secrets.

## Manual rollout — not executed

1. Keep public traffic closed and campaign retries disabled. Deploy compatible code while campaign submissions remain closed.
2. Finish runtime → campaign safety installation and existing permission checks, then run **the entire `database/sql/campaign_marketing_offer.sql` file last**, as postgres. It is transactional and repeatable. Reapplying campaign safety or discounts later overwrites these definitions; always restore this follow-up last.
3. Verify both replaced functions remain postgres-owned SECURITY DEFINER, safe `search_path=pg_catalog, pg_temp`, anon/authenticated EXECUTE false and service_role true. Existing runtime budgets/authentication/cleanup remain unchanged.
4. Refresh the saved campaign: verify its real offer is enabled and the required checkbox/CTA appear. Preview uses the same UI without saving/sending. Keep sending budgets within approved limits.
5. With approved owned inboxes, check missing/unchecked consent rejects without creating contact/lead/mail/coupon; checked current consent creates one code/mail and correct CRM preference. Check disabled offer keeps optional marketing and issues no code.
6. Check duplicate/retry reuses original code/expiry; unsubscribe stops marketing but code still works; an opted-out existing address stays opted out and receives no new award. No customer existence signal appears publicly.
7. Verify purchase-at-normal-price remains available, terms/email links work and private values stay out of logs. Resume only reviewed flags/budgets/schedules after acceptance.

To pause the offer, disable new issuance using its existing admin control and close promotional registrations if necessary. Preserve issued coupons and consent/audit evidence. Do not restore old SQL alone or bulk resubscribe records.

## Local verification

130 full-suite tests passed, including the new SQL policy regression. TypeScript and ESLint passed. Production webpack build passed after the privacy wording update. The targeted 11-test campaign suite passed again after adding a shared wording/version consistency assertion. SQL was applied twice to a disposable PGlite fixture only; external network access was blocked for tests/build. Browser state confirmed the local campaign preview displays the revised subscription invitation. Actual inbox/CRM and production schema/flags are not verified by these checks.
