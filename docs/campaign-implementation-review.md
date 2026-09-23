# Campaign implementation review — 21 September 2026

## Verdict and scope

Phase 1 is partially implemented, not yet verified as launch-ready. This review covers the local working tree against the supplied specification. It does not establish that migrations have been applied to Supabase, that production environment variables exist, or that the feature is deployed. No production data was changed or emails sent.

The application uses Next.js 16.2.6 App Router, React 19, TypeScript, Supabase, and the existing admin email allowlist. Campaign work is currently a mixture of modified and untracked files; it needs to be included in a reviewed commit before deployment.

## What exists

- Reusable `/campaign/[slug]` page with product cards, price-dependent yes/maybe/no intent, optional phone/Telegram, unchecked marketing consent, and an inline success state.
- Seven-table migration: contacts, campaigns, campaign_products, campaign_leads, funnel_events, email_campaigns, email_deliveries. Email normalization and campaign/contact uniqueness constraints are present.
- Trusted server-side submission, campaign/date/product checks, price read from campaign data, and sequential repeat-response updates.
- Anonymous session ID, browser attribution capture, first-party events, optional Meta/TikTok hooks.
- Resend confirmation integration and delivery logging, including graceful handling of ordinary provider failures.
- Admin authentication reused through `verifyAdminAccess`; lead list, filters, detail view, and protected CSV export.
- RLS enabled, with no public access policies for contacts or leads in the new migration. Actual deployed policies still require verification.
- A manual development seed with Model A at S$89, B at S$99, and C at S$109. The specifications are sample content and images are absent.

## Findings to address before public launch

1. **The visible journey begins too late.** `src/app/admin/campaigns/leads/[id]/page.tsx:38` fetches events only by lead ID. Anonymous view/selection events have no lead ID, and submission does not associate them. Add a campaign-scoped session-to-lead association and include the appropriate pre-registration events. Preserve history across subsequent submissions and avoid assigning unrelated/shared-browser history to a contact.

2. **Re-voting resets lifecycle progress.** `src/app/actions/campaigns.ts:234` sets `intent_registered` on every update. A reserved or deposit-paid lead would regress. Preserve lifecycle status and define which selection changes are permitted after payment; record previous and new values.

3. **Registration is not atomic or concurrency-safe.** Contact and lead creation use separate lookup/insert calls. Concurrent requests can hit unique violations; event failures are logged but registration can still succeed without history. Move the core write and event recording into a database transaction with conflict-safe operations. Add a durable email outbox so retries do not duplicate sends.

4. **Dashboard totals and searches are incomplete.** `src/app/admin/campaigns/page.tsx:54` caps results at 200 and computes overview metrics from that subset. Email/phone search happens after the cap. Visitor counts are fetched without pagination and do not share date/source filtering with registrations. Aggregate in the database, paginate the table, and use consistent scopes for conversion rates. The export also has a 5,000-row application cap and may encounter a lower configured database API limit; fetch all matching pages or disclose an explicit limit.

5. **Spam protection is insufficient for a public campaign.** The submission limiter is an in-memory Map keyed by campaign/email; changing emails bypasses it and separate server instances do not share limits. The public events endpoint has no limiter, no bounded metadata schema, and ignores insert errors. Add a shared limiter and bounded runtime validation; validate that event products belong to the campaign.

6. **A network failure can strand the form.** The awaited action in `CampaignIntentForm.tsx:138` has no catch/finally path. A rejected request leaves the UI submitting. Add a recoverable error state. Guard storage access and JSON parsing so unavailable or corrupt browser storage does not disable attribution.

7. **Recorded price can differ from displayed price.** The server reads the latest product price rather than verifying the version displayed in the browser. If an admin changes pricing while the page is open, the response stores a different price. Verify a trusted price/version snapshot or ask the visitor to reconfirm updated pricing.

8. **Unsubscribe is unauthenticated by email alone.** Anyone knowing an email can change that contact's preference. Use an opaque or signed unsubscribe token; keep the public response generic. Do not put raw recipient email in the link. Escape dynamic email HTML, and normalize the base URL (the Vercel hostname fallback currently lacks a scheme).

9. **CSV values are not protected from spreadsheet formulas.** `src/lib/campaigns/utils.ts:50` escapes delimiters but not formula-leading values. Neutralize user-controlled fields such as phone, email, and attribution before export.

10. **The vote starts with Model A selected.** `CampaignIntentForm.tsx:89` preselects the first option. Require an explicit choice to avoid measuring a default as a preference. Replace customer-facing CRM language such as “price-positive lead” and inaccurate claims that unsent emails are pending. Optimize campaign images (currently explicitly unoptimized), and visually verify mobile and keyboard flows.

## Missing or incomplete specification items

- No automated tests or test script were found for the required acceptance cases.
- No safe filtered-segment sender or broadcast UI exists. Email campaign tables alone do not meet either requested sending option. Add recipient preview, test-send, consent/unsubscribe exclusion, explicit confirmation, and batch deduplication before enabling marketing sends.
- Failed/skipped emails have no retry mechanism. Missing Resend configuration creates skipped records, not a real queued job.
- No campaign editing UI; the seed/SQL approach is acceptable for V1 but needs an operator guide and a production-safe campaign creation workflow.
- Missing UTM campaign/creative filters and several requested breakdowns, including lifecycle status.
- Lifecycle status values and `reservation_enabled` exist, but there is no reservation entity, configurable offer amount, or explicit contact/lead linkage to existing orders/customers yet. These can be additive migrations; define the links before implementing payments.
- No campaign-specific setup handover exists in README. Pixel hooks are global and load when configured; review their placement and the site's intended consent behavior before enabling them.
- Public campaign data uses `select("*")`, including objects passed to the browser. Prefer explicit public projections to keep future internal fields out of public responses. Draft campaign names/copy can also be retrieved through the service-role-backed page; decide and enforce draft visibility.

## Validation performed

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; campaign/admin/export/unsubscribe routes are included.
- Local Supabase URL, service-role key, and admin allowlist: present (values were not printed).
- Local `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_TIKTOK_PIXEL_ID`: absent or empty. This says nothing about Vercel configuration.
- Live database migration/RLS tests, browser acceptance testing, inbox delivery, and deployed-site verification: not performed. Passing compilation does not validate these behaviors.

## Recommended next steps

1. Repair transaction/history handling, lifecycle preservation, attribution, accurate metrics, export safety, and public endpoint protection. Add meaningful integration coverage for the supplied acceptance cases, including concurrent submissions and denied anonymous reads.
2. Complete confirmation outbox/retry and token-based unsubscribe. Add the smallest safe segment-send service; a large marketing dashboard is unnecessary.
3. Populate one real campaign with approved public product names, accurate specs, estimated prices, images, trade-offs, and campaign copy. Use the existing landing-page route. Choose whether the first campaign is hairdryers or air fryers before preparing the final content.
4. Apply and verify migrations in a test environment. Configure a verified Resend sender and canonical site URL; keep payments disabled. Set up admin access, then verify one full mobile journey and its matching admin history.
5. Run the acceptance journey: TikTok-tagged visit → Model B → YES at S$99 → contact capture → email → admin timeline → filtered CSV → repeat submission as Model C → still one lead with preserved history. Repeat with no marketing consent, provider failure, inactive campaign, and a non-admin request.
6. Launch only after that passes. Use consistent UTM links for each platform and creative; measure registrations, YES intent, and consented reachable contacts separately.
7. Add reservations later using lead-linked payment records, configurable amounts, idempotent payment webhooks, refund states, and existing order/customer links. Keep this separate from the voting-page launch.
