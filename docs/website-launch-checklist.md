# SamaSama public-launch checklist

Updated 17 November 2026 · Asia/Singapore · working launch register

**Launch remains on hold.** This checklist records local work, owner decisions and verification still needed. It does not authorize deployment, remote SQL, customer emails, production settings or deletion. Unchecked means outstanding **or not yet verified**; it does not mean every item is absent from production. Older setup guides describe earlier versions and must not override the current security gates.

Owners: **Build** = implementation/testing; **Marcus** = content, commercial/provider decisions and approval; **Admins** = day-to-day operational checks; **Joint** = controlled acceptance and release.

## Promotional subscription revision — 17 November

Marcus subsequently approved making email marketing consent a condition of **new** promotional code issuance. This supersedes optional-marketing/coupon-independent wording below for the new offer only. Local implementation and rollout: [campaign marketing offer](campaign-marketing-offer-2026-11-17.md). Required unchecked email-only consent, versioned evidence and SQL issuance gates are prepared. Existing unsubscribe protection, issued code validity and non-promotional purchase access remain. Apply the follow-up SQL **after** campaign safety; no remote change or activation has been performed. Controlled inbox/CRM acceptance remains pending.

## Current position and next actions — 16 November

Commit/SQL preparation — 17 November: the [release handoff](campaign-registration-release-2026-11-17.md) now contains the exact preflight → new campaign migration → postcheck sequence, settings/deployment order and stop/recovery procedure. 128 local tests, TypeScript, lint, production webpack build and diff checks passed. Preparation/commit approval does not authorize a push, remote SQL or deployment; public opening and real inbox/CRM acceptance remain pending.

Campaign-page review — 17 November: the no-write `/campaign-preview` now shows approved starting prices (Everyday Air S$109; Studio-Air S$119; Double Stack S$229; Single Stack S$219), the offer summary/terms link and one-step interest CTA. This updates the local demo and future test-campaign template only; saved live campaigns are not rewritten. Browser preview submission with marketing unchecked returned success without saving/sending; lint, TypeScript and diff checks passed. Final supplier/model/photo/specification approval, saved live-campaign configuration, compatible SQL/settings, actual inbox/CRM/retry acceptance and opening approval remain outstanding. Earlier 127-test/build results apply to the preceding email/terms revision, not a fresh full-suite run for these display changes.

17 November email/content update: Marcus approved the clearer discount wording and the ten-minute cooldown. A formatted E02 email, decorative illustration and dedicated `/campaign-offer-terms` page are prepared locally and linked. Final visual/content acceptance and controlled inbox checks are outstanding. Review actual campaign page/product/success text after these are accepted, as requested; no deployment or test send has been authorized.

- [x] Four-product pricing, exact tiers, deposits, verified-unit minimums and hard limits agreed; capacity/pricing implementation prepared and locally validated.
- [x] Marcus reports completing the preceding SQL/Vercel rollout. This records his completion report, **not independent verification of production SQL, flags or actual batch configuration**. Do not repeat those migrations merely because older sections describe their preparation.
- [x] Campaign flow simplified locally per Marcus’s 17 November instruction: register once → acknowledgement/eligible code email. No reconfirmation page or additional marketing confirmation step. Earlier owner-review drafts and preview states are superseded. Revised local verification: 127 tests and production webpack build passed; the previous 130-test result covered the superseded flow.
- [x] Marcus supplied E02 wording and requested it be used with no reconfirmation. Dynamic product, price and original expiry replace sample values; the missing-name greeting falls back to “Hi,”. An eligible code requires no marketing consent.
- [ ] Separately approve and coordinate the new campaign migration/application/settings cutover after shared-mailbox runtime compatibility, provider capacity and log/tracking checks. Both new campaign flags remain default-off in code; no activation is implied by this document.

| Priority | Practical next action | Owner |
|---|---|---|
| 1 | Check the implemented customer-supplied acknowledgement, dynamic fields and actual campaign-specific success text; finalize published offer terms. No owner-confirmation action remains. | Marcus |
| 2 | Prepare the compatible campaign cutover; verify current SQL/runtime/provider settings, private-link redaction, historical queues/consent and automatic worker outcomes using controlled records/inboxes after approval. | Build + Admins; Marcus authorizes changes/sends |
| 3 | Finalize purchase, deposit, delivery-balance and collection-ready emails; supply real collection hours/location, delivery instructions and cancellation/warranty rules. Validate product evidence, closing dates and actual launch-batch configuration. | Marcus + Build |
| 4 | Complete campaign/coupon and paid-order acceptance: real bank verification, final pricing, excess-payment/refund handling, owner/delegate collection, delivery and competing staff handovers. | Joint |
| 5 | Verify CEO individual access, responsible admin alerts, queue recovery, scheduled workers, latest successful Sheet backup, cleanup/retention and recovery procedures. Confirm launch hosting/sending capacity. | Admins + Build; Marcus approves provider changes |
| 6 | Reconcile public copy/policies, remove demo content, complete mobile/privacy checks and approve public opening explicitly. Keep Coming Soon until these gates pass. | Joint |

Storage charging remains **off** until usable-notice/bounce, reminder and hold/resumption controls are ready. It may be deferred only with accurate public wording and a safe admin process. Weekly progress emails and exact overdue-reminder content/timings remain unapproved drafts; weekly refers to progress updates, not overdue collection notices. A rich email editor, advanced analytics and extra CRM product fields can follow launch if not promised to customers.

## Dashboard implementation — 3 November 2026

[Implementation and verification](dashboard-implementation-2026-11-03.md): collection payments and guarded handover are now together in the desk; delivery requests remain explicit manual batches; Storage Safety provides actual fee-hold state and bounded notification-hold review. 103 local tests and the production build passed. Rehearse the latest safety SQL, browser/staff acceptance and coordinated rollout before deployment; existing release gates below remain open.

## 28 October safety revisions

See [payment-rollout-hardening-2026-10-28.md](payment-rollout-hardening-2026-10-28.md). The payment switch now preserves old behavior when off; collection cannot use the older payment-verification action in manual mode. A separate reviewed SQL safety hold freezes future storage accrual, preserves old debt and records notification issues; it has no billing-resumption path.

- [ ] Apply/rehearse the safety hold after the collection migrations, check fixed cutoff/permissions, then set its installation flag in the approved environment. Keep fee-policy activation off.
- [ ] Approve usable-notice/bounce handling, hold resolution, resumption accounting and pre-deadline reminder wording/timing before implementing a future fee-charging release. No reminder schedule has been added.
- [ ] Inspect the current complete diff before any new commit; historical staging notes are not evidence of the current deployed revision.

## Manual payment flow update — 27 October 2026

Local implementation: [manual-balance-rollout.md](manual-balance-rollout.md). Self-collection pays the remaining balance at the desk, verified against actual credited bank funds before ID-checked handover. Only delivery orders receive balance requests, explicitly previewed/queued by an admin in Delivery balance emails. No new automatic sending schedule or reminder is added. Existing order/deposit/readiness/security notifications remain separate.

- [ ] Review/approve the manual-balance migration and coordinated rollout; do not enable its flag against an old schema.
- [ ] Complete collection payment → authorization/storage → single handover acceptance, and delivery preview → manual queue → verified payment → delivery acceptance.
- [ ] Finalize delivery-only balance email wording and the collection-ready pay-at-collection notice; test an approved inbox and existing prepaid orders.

## Campaign reward — 10 November 2026

[Discount setup and rules](campaign-discounts-setup.md): personal code for any product on the first order, S$10 per unit (up to the existing ten-unit checkout), final product price at least S$50, original six-calendar-month validity, no retroactive awards and admin-approved reinstatement. Deposit unchanged; actual discounted funds govern refunds. Existing one-product/batch checkout only.

- [ ] Review/install the new discount SQL and compatible server setting; issuance defaults off. Do not change previous fee-off controls.
- [ ] Approve the campaign offer and confirmation-email copy, then explicitly enable new issuance in Campaign discounts.
- [ ] Verify controlled registration email → same-email code use → verified deposit → per-unit final quote → collection or manual delivery balance email. Check expiry, duplicate attempts, cancellation and discounted refund reconciliation.
- [ ] Resolve the existing known-unsent campaign confirmation retry/ownership work and provider capacity before public registration; this feature adds no new mail drain or reminder schedule.

## Readiness scope — week of 16 November 2026

Marcus intends to use this week to finalise all customer-facing website copy. Visitors will likely encounter interest registration first, but **both interest and paid-order copy and their backend processes must be ready**. Interest-first traffic is not approval to defer paid-order readiness or publish unsupported promises. Review and track both journeys in parallel; production changes and test sends still require the appropriate approval.

Working sequence and copy-to-backend acceptance matrix: [launch copy and workflow readiness](launch-copy-readiness-2026-11-16.md). No promised completion date, public opening or new automatic-email schedule is established by this planning target.

### Verified-only capacity — 16 November implementation

SQL/Vercel handoff and practical next steps: [verified-capacity-rollout-2026-11-16.md](verified-capacity-rollout-2026-11-16.md). The detail-page payment CTA now respects full capacity and no longer promises reservation on payment; saved-order and acknowledgement copy include the approved original-payment-method refund assurance. Refund/contact handling remains admin-owned.

Marcus approved pending requests without reservations/expiry: capacity and tier participation count only after admin deposit verification. [Implementation and installation reference](verified-batch-capacity.md): private per-batch counter, atomic hard-cap guard, public aggregate view, pending-aware batch editing and accurate checkout/acknowledgement copy. Marcus subsequently reported completing the rollout. Actual database/application versions and launch-batch settings still need acceptance evidence; the earlier local-only status is superseded by that report. Admins must reconcile/refund actual received funds when availability is exhausted, rather than forcing an over-cap confirmation. Local verification at that step: **115 tests passed**, plus TypeScript, lint and production build; independent PostgreSQL-session contention remains unverified.

## Exact product tiers and proceed approval — rollout reported complete

[Implementation and SQL/Vercel reference](batch-pricing-rollout-2026-11-16.md): exact per-batch tier starts and a separate minimum replace percentage-derived presentation. Approved four-product presets are available on new batches. Proceed approval checks current verified units, records a private admin audit and gates new/changed final quotes for configured batches. It does not automatically close batches, lock prices, place supplier orders or send mail. Unconfigured batches block new requests; existing order terms/workflows remain intact. Thresholds/minimum lock once orders exist. Marcus reported the preceding rollout completed; verify installed versions and the actual empty/new launch-batch settings rather than assuming presets configure existing records. Never infer or silently rewrite ordered historical batches.

## Campaign registration safety — single-step revision, 17 November

[Current flow and cutover steps](campaign-registration-review-2026-11-16.md). Marcus superseded the proposed owner-review flow: one registration sends the acknowledgement and eligible personal coupon directly. New contacts retain optional phone/Telegram and the initial unchecked marketing choice as single opt-in evidence, not verified inbox ownership. Existing contacts/picks/unsubscribe remain unchanged by public repeats. Bounded known-unsent retries, shared sender pacing, redacted health reporting and scheduled rate-limit cleanup remain prepared locally behind default-off flags. No owner-request table, confirmation route or private review token is created. Provider/runtime compatibility, offer terms, historical queues/consent and controlled send/browser acceptance remain release checks. No remote SQL, deployment, provider setting or customer send has been performed by this revision.

## Contact and refund copy — 16 November 2026

Marcus confirmed the customer-facing name **SamaSama**, support via **hello@samasama.sg** only, no published business address for now, and a **10-business-day** refund turnaround. Local copy now removes contact/address placeholders and WhatsApp support/update promises, routes privacy enquiries to the support inbox, and aligns failed-batch refund wording with the Terms. Approved customer cancellations count from approval; failed batches count from confirmation that the batch will not proceed. No cancellation eligibility, collection fee rules, accepted policy-version identifiers, financial processing or automatic refund behaviour changed.

Remaining: confirm registered legal entity details separately before paid launch, resolve cancellation-eligibility wording and the other launch promises, approve full email copy, and publish after review. These contact decisions do not resolve the wider launch gates.

## Confirmed decisions

- Commercial policy approved for now: seven free days, then S$10 per order per commenced seven-day period, uncapped; discretionary adjustments are audited. After the two additional weeks, cancellation/resale is a **manual review**, not automatic forfeiture or disposal. Preserve accepted policy versions when later changing terms.
- Weekly **progress updates** only. Collection reminders follow the order's collection dates/deadlines. Exact email copy and reminder offsets are deferred for later owner review; draft preparation can proceed.
- Immediate purchase/payment/security emails are separate from weekly progress updates. Receiving an order is not verification of payment or email ownership.
- Collector details remain while collection is outstanding, then for 14 days after collection/cancellation, with deletion eligibility no earlier than 14 days after readiness. Minimal required financial/audit evidence is separate.
- Failed email jobs remain until resolved or cancelled by admins; terminal personal-data cleanup timing still needs a decision.
- Keep only the **latest successful emergency spreadsheet backup**. Failed or ambiguous exports must preserve the last successful copy. Provider database backups/PITR, spreadsheet revision history and temporary export snapshots are separate.
- Admins handle failed messages, payment discrepancies, collection exceptions and alerts.
- Expected demand is approximately no more than 50 new orders/hour, not a guaranteed traffic cap. Vercel/Supabase currently Free, planned next-tier upgrades for launch; Zoho Mail described as Standard. Sending-provider capacity remains unresolved.

## 1. Email drafts and final content — Marcus + Build

Draft register: [customer-email-drafts.md](customer-email-drafts.md). These are draft briefs/subject starters, not deployed templates or scheduled sends. Marcus will dictate the final emails and contents later.

- [ ] **E01 Purchase/order confirmation:** review the existing order-received template. Show product/image, batch, quantity, order code, deposit instructions and support. Explicitly state payment is unverified until matched to the bank.
- [ ] **E02 Campaign interest confirmation:** review the existing sender/template. Confirm selected product/estimated price, no purchase or payment, and accurate update-preference wording. Distinguish submission acknowledgement from email-ownership verification.
- [ ] **E03–E05 Payment emails:** approve deposit receipt, delivery-only balance request and delivery-only balance receipt. Include correct amounts, product image/details, support and a valid private payment link only where necessary.
- [ ] **E06 Readiness emails:** prepare separate collection and delivery variants. Supply actual collection location/hours, appointment instructions and delivery-confirmation/charge wording before publication. Never invent operational details.
- [ ] **E07 Weekly progress updates:** prepare a reusable draft. Four updates in the 30-day capacity model; stop/merge when obsolete and respect the approved communication preferences. Do not claim progress that has not occurred.
- [ ] **E08 Overdue/deadline reminders:** draft payment and collection variants. Collection timing must follow the current order's collection dates, not a blanket weekly schedule. Choose exact offsets and rescheduling/fee interactions later, with warnings before applicable fee/review deadlines.
- [ ] **E09–E10 Security emails:** draft owner verification and collector authorization/change/revocation notices, with no unnecessary customer information or reusable secrets exposed to collectors.
- [ ] **E11 Exception emails:** decide which cancellation/refund, failed-delivery, appointment-change and completed-handover acknowledgements are required for launch. Keep customer notification of a financial decision distinct from evidence of an actual refund.
- [ ] Marcus approves subjects, full text/HTML, terminology, support address, reply handling, privacy and any promotional language. Keep all unapproved new messages draft-only.
- [ ] Decide whether code-edited templates are sufficient for launch or an editable template interface is necessary. **A Zoho template editor/workflow handoff is not implemented by merely creating CRM records.** One system owns each email to avoid duplicate sends.
- [ ] Preview all approved drafts on mobile/desktop and with images disabled, long names/product names and missing optional fields. Use synthetic records, not real customer data.

Done when: approved versioned content exists for every launch event, required fields are validated, and no placeholder instruction or unapproved draft can reach customers.

## 2. Email sending, ownership and automation — Build; Joint acceptance

### Existing implementations: verify, do not assume missing

Order queue, five immediate order-email events, Zoho Mail authorization, dedicated Zoho Orders mapping and signed worker scheduling exist. Marcus previously reported successful email/CRM tests. The daily Google Sheets trigger was also reported installed. These facts do not prove every current production transition or revised implementation works automatically.

- [ ] Verify one new order triggers exactly one order acknowledgement **without terminal commands**, then each verified payment/readiness transition produces the correct email and CRM update.
- [ ] Verify one campaign lead receives exactly one acknowledgement, the admin delivery status is accurate, and CRM reflects the intended product/interest/consent. Confirm no-consent registration does not subscribe someone to marketing.
- [ ] Verify single-step registration: the initial optional marketing checkbox is recorded only for newly created contacts; repeats cannot overwrite existing contact/pick or reverse unsubscribe. Support handles changes. Do not label these records as verified inbox ownership. Order/payment/collector verification remains separate and unchanged.
- [ ] Review and activate the locally prepared bounded consumer for new-flow known-unsent interest confirmations, sharing V2 pacing and the existing email schedule. Historical queued/uncertain messages need separate admin review; do not bulk-reset their state.
- [ ] Complete producers/templates for weekly updates, owner OTPs, authorization notices and reminders. Runtime priority classification alone does not implement these events; unsupported events currently fail safely.
- [ ] Use immutable event IDs/deduplication and current-state eligibility before sending. Stop obsolete jobs after payment, refund, collection, cancellation, rescheduling or replaced links as appropriate. Never blindly replay an uncertain provider POST.
- [ ] Verify existing scheduled worker ticks and inspect HTTP/outbox outcomes, not only Cron's enqueue-success status. Reconcile old failed/review jobs before enabling any revised schedule.
- [ ] Confirm Zoho's actual automated-send allowance and usage policy, or approve a transactional sender. Weekly updates reduce volume but do not guarantee timely confirmations/OTPs at 50 new orders/hour. Do not raise limits based solely on the Mail subscription name.
- [ ] Add authenticated, deduplicated bounce/non-delivery evidence handling and a manual reconciliation path. Suspend affected notification-dependent fees; provider acceptance alone is insufficient proof of delivery.
- [ ] Verify hello@samasama.sg sender identity, replies and domain-authentication results in an owned test inbox, including failed/blocked-image cases. Earlier manual send/receive success is useful but does not cover every automated template.

Done when: approved events complete automatically within the agreed timing, failures are visible and recoverable, and retries do not duplicate messages or weaken identity/consent checks.

Named-collector follow-up: [replacement rollout and local test scope](named-collector-rollout.md). The previous pickup-code model has been removed locally. Deployment and controlled acceptance remain pending.

## 3. Collection, storage and payment security — Build; Admins procedures

Mandatory before enabling the affected new features; see [the security review](collection-hardening-review-2026-10-26.md). Keep incomplete capabilities explicitly disabled while preserving existing payment/handover protection.

- [ ] Validate the replacement name + original-photo-ID flow using controlled records. Pickup-code generation, storage and verification are removed; check one-use 24-hour owner links, rate limits, revocation and ID-required release instead.
- [ ] Validate the locally implemented one-use, 24-hour email-delivered owner form and fresh-link reissue for collector changes. Preserve safe revocation/recovery even if issuance is disabled.
- [ ] Invalidate authorizations on owner/email, fulfilment-method, readiness, refund/cancellation and other relevant state changes; test replace/revoke versus redemption.
- [ ] Ensure old/alternative fulfilment RPC paths cannot bypass storage, authorization or payment checks. Verify the complete SECURITY DEFINER chain, ownership, safe search paths, schema privileges and service-only access.
- [ ] Resolve stopped-clock accounting, fee-boundary timing after locks, credits/refunds following adjustments and notification/bounce holds. Do not silently erase a paid credit or resume a terminal clock.
- [ ] Independently suspend fee accrual and delegated collection without disabling payment or single-handover checks. Test controls during in-flight requests and rollback.
- [ ] Define the staff bank-verification procedure for deposit, balance and storage fees. **Actual funds must be matched before release**, including payment made at the warehouse. A screenshot, customer assertion or CRM status is insufficient.
- [ ] Define combined/partial/overpayments, erroneous verification, cancellation/resale decisions and actual refunds as controlled admin exceptions. Do not invent unsupported payment allocations or automatic financial actions.
- [ ] Supply final pickup location, hours and appointment handling; decide precise collection-reminder offsets and how changed dates affect reminders. Rescheduling alone must not silently waive/reset fees.
- [ ] Train admins on owner/delegate identity checks, quantity, all-items handover and duplicate-release blocking. A typed name alone is not an owner identity check.

Done when: the security review's mandatory cases have fail-closed regression tests and separate-session staging evidence; staff can complete or safely hold each exception.

## 4. Retention, privacy and emergency backup — Build + Admins

- [ ] Implement indexed, bounded collector cleanup using the confirmed later-of-two-dates rule, active-order protection and approved legal/dispute holds. Revoke credentials promptly on use/revocation/expiry without deleting financial evidence.
- [ ] Implement/administer explicit resolution or cancellation of failed email jobs. Decide a terminal payload-cleanup grace period; preserve minimal delivery/idempotency/audit records. Do not delete unresolved uncertainty or active payment access material.
- [ ] **Update Apps Script retention:** current `integrations/google-sheets/Code.gs` retains hidden previous tabs. Prepare the reviewed change to keep only the latest successful published dataset, with atomic publication of both data tabs/status and safe handling of ambiguous responses. Do not remove the last good copy before replacement validates.
- [ ] Review already-existing hidden previous tabs, abandoned staging tabs, workbook sharing and spreadsheet revision history. Present any required production cleanup for explicit approval; the latest-only policy is not permission to silently delete historical production data.
- [ ] Keep workbook access restricted to approved operational users; confirm authorized admins can find and open it. Verify daily trigger success, capture time and stale-backup warning.
- [ ] Replace unbounded expired-snapshot cascade cleanup in `operations_export.sql` with reviewed bounded maintenance. Preserve two-hour retrieval expiry, snapshot immutability, authentication, cooldown, pagination and RLS.
- [ ] Remove misleading warehouse release-clearance labels or prepare a coordinated export version with minimal storage-clearance information. Update SQL/Edge/Apps Script mappings and tests together; do not add credentials, pickup codes, collector contact or bank references to Sheets.
- [ ] Document outage procedure: Sheets helps locate/reconcile records; it does not authorize release when live payment/storage/authorization/duplicate-handover checks are unavailable.
- [ ] Verify private-link and payload redaction in actual hosting/CDN/observability/mail integrations using synthetic staging canaries. Application no-referrer headers alone do not prove infrastructure logs are safe.
- [ ] Confirm the previously exposed Zoho client secret was rotated, if not already done, and check secrets remain server-side/untracked. Verify rotation completion without displaying secret values.
- [ ] Verify recoverable Supabase backups cover orders, payments, policy acceptance, authorizations and audit tables. The latest-only spreadsheet cannot reconstruct deleted/corrupted historical records.

Done when: retention is bounded and approved, the last successful emergency copy survives failures, live checks remain authoritative, and recovery/redaction evidence is recorded.

## 5. Admin access, monitoring and capacity — Build + Admins + Marcus

- [ ] Verify the CEO has an individual Supabase login and authorized `ADMIN_EMAILS` entry in the correct deployed environment. Test sign-in, sign-out, non-admin denial and account recovery. This is a verification item because completion has not been independently confirmed.
- [ ] Confirm secure admin authentication/session controls and permissions for financial adjustments and releases. Avoid shared credentials; consider stronger authentication for sensitive actions.
- [ ] Enable reviewed Operations health only after its SQL/runtime prerequisites and tests pass. Report backlog, oldest due job, failures/review, latency and missing worker heartbeats; include campaign-confirmation work too.
- [ ] Configure protected alerts and assign an on-duty admin/acknowledgement procedure. “All admins” must not mean an alert goes unowned.
- [ ] Test bounded pagination/search, queue claims, shared provider limits, cleanup and contention at 100/500/1,000/2,000 synthetic orders. Local timing samples are not a production load guarantee.
- [ ] Confirm Vercel/Supabase launch upgrades, spend alerts, database/connection/egress headroom, provider budgets and the proposed transactional-mail channel. No paid resource is created by this checklist.
- [ ] Plan compatible worker cutover: pause old schedules, drain/reconcile in-flight work, migrate/deploy the compatible revision, validate, then activate reviewed limits/schedules. V1 direct send markers are incompatible with the V2 guards; simply toggling the app flag is not a complete rollback.

Done when: authorized staff can operate safely, failures reach a responsible person, and capacity/recovery are measured rather than inferred from the subscription tier.

## 6. Public site and complete journey acceptance — Joint

- [ ] Finalize real product/batch content, prices, stock/capacity, images and campaign copy; remove demo material. Verify generated batch links work for open batches and closed batches reject new submissions.
- [ ] Verify actual PayNow UEN/payee/QR and support contact in the deployed environment without exposing credentials. Confirm delivery wording says subject to confirmation and additional agreed charges.
- [ ] Review published privacy, collection/delivery, payment/refund and commercial terms against the implemented behavior. Preserve earlier acceptance versions; do not backfill acceptance for old orders.
- [ ] Test campaign registration → acknowledgement/original eligible coupon → current CRM/admin state, with no marketing consent, duplicate submissions, unsubscribe and provider failure. No reconfirmation is required; marketing opt-in must not gate an eligible coupon.
- [ ] Test order → acknowledgement → verified deposit → final quote/readiness → either collection desk balance verification and owner/delegate handover, or admin-queued delivery balance email/private link → verified funds → delivery. Verify CRM update and backup; self-collection must not receive the delivery-only balance request.
- [ ] Test zero balance, unpaid/refunded/legacy orders, expired/replaced links, changed collector/date, blocked/late notice, waived/storage-paid orders and two staff attempting the same handover. Partial collection remains unsupported unless separately implemented.
- [ ] Check mobile/desktop layout, keyboard/error states, search, images, support/reply links and private-page caching. Verify retrying a failed form does not duplicate the order or notification.
- [ ] Review page titles/social previews, canonical URLs, indexing/sitemap behavior and analytics/consent before traffic is directed to the site. Tracking must not collect private management/payment URLs.
- [ ] Reconcile old and new setup documents so stale “manual balance email” or “reminders enabled” instructions cannot mislead staff.

Done when: a controlled acceptance record shows the intended customer/admin journey and exceptions, with approved inbox tests and no real customer data used in test fixtures.

## 7. Final release — explicit approval required

- [ ] Present final code/SQL diff, resolved security findings, final email approvals, test results, configuration/permission evidence and remaining limitations.
- [ ] Verify a recoverable backup and documented cutover/rollback procedure; preserve current queue and financial records.
- [ ] Obtain separate approval before remote migrations, paid-resource/settings changes, deployment, controlled production sends or historical-data deletion.
- [ ] After approval, perform the planned release and controlled checks. Verify automatic email/CRM workers and the next backup succeed.
- [ ] Reopen the public homepage intentionally (`COMING_SOON_MODE=false` in the intended environment and a compatible deployment); test canonical HTTPS and protected admin access. Do not remove Coming Soon before release gates pass.
- [ ] Admins monitor the initial live window: paid/unpaid reconciliation, queue age, email failures, backup freshness, customer support and any held collections.

## Work that may follow launch if explicitly deferred/disabled

- Advanced role separation, a customer account area, a rich template editor and marketing segmentation/broadcast UI.
- Product/batch fields in the constrained Zoho Orders module if the dashboard/email remains sufficient.
- Automated bank reconciliation, payment gateway, partial/combined payment allocation, split handovers and carrier tracking.
- Advanced analytics/attribution or visual polish beyond the accepted public/admin journey.

A feature may be deferred only when the published promise, UI and operational process do not imply it works. Security, payment verification, required transactional messages and required pre-fee notices are not optional polish.

## Evidence and source documents

- [Named-collector replacement](named-collector-rollout.md)
- [Email draft register](customer-email-drafts.md)
- [Collection hardening review](collection-hardening-review-2026-10-26.md)
- [Performance/cost review and confirmed owner decisions](operations-performance-cost-review-2026-10-26.md)
- [Collection rollout draft](collection-delivery-rollout.md)
- [Existing order email/CRM setup](order-email-crm-setup.md)
- [Existing worker scheduling](order-worker-scheduling.md)
- [Zoho Mail setup](zoho-mail-setup.md)
- [Google Sheets backup setup](google-sheets-operations-backup.md)
- [Earlier order security review](order-security-review-2026-10-13.md)

Checklist assembled from local source/reviews and conversation confirmations. No production environment, account, inbox, sheet or live database was inspected while creating it. Do not mark an item complete solely because an old guide lists installation instructions or local tests pass.
