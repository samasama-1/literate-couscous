# SamaSama public-launch checklist

Updated after the named-collector replacement · Asia/Singapore · working launch register

**Launch remains on hold.** This checklist records local work, owner decisions and verification still needed. It does not authorize deployment, remote SQL, customer emails, production settings or deletion. Unchecked means outstanding **or not yet verified**; it does not mean every item is absent from production. Older setup guides describe earlier versions and must not override the current security gates.

Owners: **Build** = implementation/testing; **Marcus** = content, commercial/provider decisions and approval; **Admins** = day-to-day operational checks; **Joint** = controlled acceptance and release.

## Dashboard implementation — 3 November 2026

[Implementation and verification](dashboard-implementation-2026-11-03.md): collection payments and guarded handover are now together in the desk; delivery requests remain explicit manual batches; Storage Safety provides actual fee-hold state and bounded notification-hold review. 103 local tests and the production build passed. Rehearse the latest safety SQL, browser/staff acceptance and coordinated rollout before deployment; existing release gates below remain open.

## 28 October safety revisions

See [payment-rollout-hardening-2026-10-28.md](payment-rollout-hardening-2026-10-28.md). The payment switch now preserves old behavior when off; collection cannot use the older payment-verification action in manual mode. A separate reviewed SQL safety hold freezes future storage accrual, preserves old debt and records notification issues; it has no billing-resumption path.

- [ ] Apply/rehearse the safety hold after the collection migrations, check fixed cutoff/permissions, then set its installation flag in the approved environment. Keep fee-policy activation off.
- [ ] Approve usable-notice/bounce handling, hold resolution, resumption accounting and pre-deadline reminder wording/timing before implementing a future fee-charging release. No reminder schedule has been added.
- [ ] Re-stage the revised source/SQL/tests before committing; the earlier staged snapshot predates these fixes.

## Manual payment flow update — 27 October 2026

Local implementation: [manual-balance-rollout.md](manual-balance-rollout.md). Self-collection pays the remaining balance at the desk, verified against actual credited bank funds before ID-checked handover. Only delivery orders receive balance requests, explicitly previewed/queued by an admin in Delivery balance emails. No new automatic sending schedule or reminder is added. Existing order/deposit/readiness/security notifications remain separate.

- [ ] Review/approve the manual-balance migration and coordinated staging rollout; do not enable its flag against an old schema.
- [ ] Complete collection payment → authorization/storage → single handover acceptance, and delivery preview → manual queue → verified payment → delivery acceptance.
- [ ] Finalize delivery-only balance email wording and the collection-ready pay-at-collection notice; test an approved inbox and existing prepaid orders.

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
- [ ] Implement email-ownership verification before allowing a public submission to alter an existing person's contact/consent or activate marketing. An acknowledgement email is not proof of ownership. Keep order ownership verification separate from payment verification.
- [ ] Add a bounded, lease-safe automatic retry consumer for known-unsent queued interest confirmations. Current runtime shared pacing can defer them; a general scheduled drain is still absent.
- [ ] Complete producers/templates for weekly updates, owner OTPs, authorization notices and reminders. Runtime priority classification alone does not implement these events; unsupported events currently fail safely.
- [ ] Use immutable event IDs/deduplication and current-state eligibility before sending. Stop obsolete jobs after payment, refund, collection, cancellation, rescheduling or replaced links as appropriate. Never blindly replay an uncertain provider POST.
- [ ] Verify existing scheduled worker ticks and inspect HTTP/outbox outcomes, not only Cron's enqueue-success status. Reconcile old failed/review jobs before enabling any revised schedule.
- [ ] Confirm Zoho's actual automated-send allowance and usage policy, or approve a transactional sender. Weekly updates reduce volume but do not guarantee timely confirmations/OTPs at 50 new orders/hour. Do not raise limits based solely on the Mail subscription name.
- [ ] Add authenticated, deduplicated bounce/non-delivery evidence handling and a manual reconciliation path. Suspend affected notification-dependent fees; provider acceptance alone is insufficient proof of delivery.
- [ ] Verify hello@samasama.sg sender identity, replies and domain-authentication results in an owned test inbox, including failed/blocked-image cases. Earlier manual send/receive success is useful but does not cover every automated template.

Done when: approved events complete automatically within the agreed timing, failures are visible and recoverable, and retries do not duplicate messages or weaken identity/consent checks.

Named-collector follow-up: [replacement rollout and local test scope](named-collector-rollout.md). The previous pickup-code model has been removed locally. Deployment and real staging acceptance remain pending.

## 3. Collection, storage and payment security — Build; Admins procedures

Mandatory before enabling the affected new features; see [the security review](collection-hardening-review-2026-10-26.md). Keep incomplete capabilities explicitly disabled while preserving existing payment/handover protection.

- [ ] Validate the replacement name + original-photo-ID flow in staging. Pickup-code generation, storage and verification are removed; check one-use 24-hour owner links, rate limits, revocation and ID-required release instead.
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
- [ ] Staging-test bounded pagination/search, queue claims, shared provider limits, cleanup and contention at 100/500/1,000/2,000 synthetic orders. Local timing samples are not a production load guarantee.
- [ ] Confirm Vercel/Supabase launch upgrades, spend alerts, database/connection/egress headroom, provider budgets and the proposed transactional-mail channel. No paid resource is created by this checklist.
- [ ] Plan compatible worker cutover: pause old schedules, drain/reconcile in-flight work, migrate/deploy the compatible revision, validate, then activate reviewed limits/schedules. V1 direct send markers are incompatible with the V2 guards; simply toggling the app flag is not a complete rollback.

Done when: authorized staff can operate safely, failures reach a responsible person, and capacity/recovery are measured rather than inferred from the subscription tier.

## 6. Public site and complete journey acceptance — Joint

- [ ] Finalize real product/batch content, prices, stock/capacity, images and campaign copy; remove demo material. Verify generated batch links work for open batches and closed batches reject new submissions.
- [ ] Verify actual PayNow UEN/payee/QR and support contact in the deployed environment without exposing credentials. Confirm delivery wording says subject to confirmation and additional agreed charges.
- [ ] Review published privacy, collection/delivery, payment/refund and commercial terms against the implemented behavior. Preserve earlier acceptance versions; do not backfill acceptance for old orders.
- [ ] Test campaign registration → ownership verification → acknowledgement → CRM/admin entry, with no marketing consent, duplicate submissions, unsubscribe and provider failure.
- [ ] Test order → acknowledgement → verified deposit → balance request/private link → verified balance → readiness notice → owner/delegate collection or delivery → CRM update and backup.
- [ ] Test zero balance, unpaid/refunded/legacy orders, expired/replaced links, changed collector/date, blocked/late notice, waived/storage-paid orders and two staff attempting the same handover. Partial collection remains unsupported unless separately implemented.
- [ ] Check mobile/desktop layout, keyboard/error states, search, images, support/reply links and private-page caching. Verify retrying a failed form does not duplicate the order or notification.
- [ ] Review page titles/social previews, canonical URLs, indexing/sitemap behavior and analytics/consent before traffic is directed to the site. Tracking must not collect private management/payment URLs.
- [ ] Reconcile old and new setup documents so stale “manual balance email” or “reminders enabled” instructions cannot mislead staff.

Done when: a controlled staging acceptance record shows the intended customer/admin journey and exceptions, with approved inbox tests and no real customer data used in test fixtures.

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
