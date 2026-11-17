# SamaSama copy and workflow readiness

Working review plan · 16 November 2026 · Asia/Singapore

## Scope and confirmed decisions

The target this week is to finalise customer-facing website copy. Interest registration is likely to be the first touchpoint, but both interest and paid-order journeys need accurate copy and functioning backend processes. Neither a draft nor a passing local test establishes live readiness. No deployment, SQL execution, production settings, deletion or customer email is authorised by this plan.

- Name: SamaSama. This is the customer-facing name; registered legal entity details remain unconfirmed.
- Featured lineup confirmed: Ryaca BY-5988 and VGO VGO-1 hairdryers; Biyi AFS-729 and Careline TTDS-1101-A air fryers. Public prices confirmed (SGD/unit, tiers 1/2/3): Studio-Air 119/109/99; Everyday Air 109/99/89; Single Stack Steamer/Airfryer 219/209/199; Double Stack Steamer/Airfryer 229/219/209. These reflect the subsequent S$10 increase to every tier. The separate eligible campaign reward is not already included. See [the internal source register](campaign-product-sources.md) for evidence discrepancies; price, threshold and deposit decisions below are settled.
- Product-specific tier starts confirmed (Tier 2/Tier 3, verified units): Studio-Air 424/713; Everyday Air 449/725; Single Stack 462/783; Double Stack 491/801. Confirmed hard unit limits: 1,000/1,000/1,103/1,109 respectively. Minimum verified participation to proceed is the upper end of Tier 1: **423/448/461/490** respectively. Reaching it meets the participation requirement, not automatic closure, procurement approval or price locking.
- Deposits confirmed at 50% of Tier 1 per unit: Studio-Air S$59.50; Everyday Air S$54.50; Single Stack S$109.50; Double Stack S$114.50. Later tiers and the eligible campaign reward do not reduce these deposits; final balance reflects the final approved net price.
- Support: hello@samasama.sg. No WhatsApp support/update promise. Business address unpublished for now; collection location is a separate operational input.
- Refund turnaround: 10 business days. Approved customer cancellations count from approval; failed batches count from confirmation that they will not proceed. Eligibility/cutoff still needs a consistent approved rule.
- Interest acknowledgement and personal coupon belong in one email, with no separate reward qualification step. Marketing choice stays optional. Protect existing contact/consent changes from unverified submissions; do not confuse acknowledgement with proof of email ownership.
- Allocation decision: pending orders do not reserve capacity or expire automatically. Units count only on admin deposit verification within the hard cap; late/excess received payments need manual reconciliation. Local capacity implementation: [verified-only batch capacity](verified-batch-capacity.md).
- Existing approved reward, collection/delegation and manual delivery-balance rules remain in force. Do not invent automated messages, fee activation, cancellation or refunds.

## Review sequence for this week

These are review batches, not promised daily delivery dates. Technical work and copy review run alongside one another.

| Pass | Copy to review | Backend/operational evidence required |
|---|---|---|
| 1 — quick corrections | Brand, support links, address placeholders, refund turnaround | Included in the preceding local changes; Marcus reports completing that rollout. Verify deployed copy before marking accepted. |
| 2 — interest journey | Homepage/entry links, product selection, estimated price, offer terms, contact/consent fields, submit/success/error states, acknowledgement/coupon email, unsubscribe | Active-campaign checks; duplicate handling; protected existing contacts; optional marketing; one code/original expiry; safe deferred-confirmation retry; CRM outcome visible. |
| 3 — paid-order journey | Batch detail, verified participation/tiers, deposit, checkout, reward, delivery disclaimer, order acknowledgement, lookup and errors | Authoritative prices/quantity; optional valid code; saved order plus durable jobs; manual bank-confirmed deposit; automatic worker completion; no duplicate orders/messages. |
| 4 — fulfilment and exceptions | Final quote, delivery-only balance request/private page, collection-ready notice, delegate form, payment/collection errors, delays, refund/cancellation/support | Separate product/delivery/discount amounts; actual credited funds before release; current ID-checked authorization; one handover; reliable owner notices; fees remain suspended until notice/bounce controls are ready. |
| 5 — consistency and acceptance | How It Works, FAQ, Standard, policies, referrals, appointments, footer, metadata/social previews and all launch emails | Published claims match active capabilities and product evidence. Verify both complete journeys, staff access, worker outcomes, monitoring and backup freshness before public opening. |

## Backend readiness register

| Work | Current evidence | What remains |
|---|---|---|
| Interest saving, acknowledgement and CRM | Implemented; earlier successful tests reported | Verify current live outcomes and no-consent path. A bounded new-flow consumer is prepared locally behind a default-off flag; review/install the campaign safety migration, confirm shared V2 pacing and perform controlled inbox acceptance. Historical and uncertain sends remain admin-owned. See campaign-registration-review-2026-11-16.md. |
| Campaign contact/consent safety | Single-step revision requested by Marcus on 17 November; prepared locally | No reconfirmation. New-contact optional fields and initial marketing checkbox are recorded immediately without claiming verified ownership; existing contact/pick/unsubscribe stays unchanged. Support handles changes; review actual CRM outcomes and historic consent separately. |
| First-order reward | Implemented, local tests passed, committed/pushed | Remote SQL/flags/issuance completion is unverified. Exercise the complete eligible/invalid/retry flows before advertising an active offer. |
| Product-specific pricing tiers | Exact prices/ranges approved; replacement implementation completed and preceding rollout reported complete by Marcus | Verify installed `batch_pricing_rules.sql` and matching app, then inspect actual launch-batch configuration. Explicit starts, consistent pricing/ranges/markers/next unlock and approved presets are implemented. Existing ordered batches retain historical terms and need separate review; no new orders on unconfigured batches. |
| Minimum participation to proceed | Confirmed verified-unit minimums: Studio-Air 423; Everyday Air 448; Single Stack 461; Double Stack 490 | Implemented locally: separate minimum, customer/admin display, authenticated approval with live counter/revision checks and private audit, plus final-quote guard for configured batches. No automatic procurement, closure, final pricing or sends. Rollout reported complete; verify actual configuration and perform controlled approval/refund/concurrency acceptance before opening. |
| Deposit and hard capacity | Verified-only atomic counter/guard and checkout/email wording implemented; preceding rollout reported complete by Marcus. No expiry or reservation job. Actual live product settings still need acceptance. | Confirm installed capacity SQL/application versions, verify separate-session final-slot confirmations and admin reconciliation of excess paid requests, and inspect approved integer-cent deposits/hard limits. This review did not independently inspect production or apply remote changes. |
| Order/payment/collection | Implemented with guarded manual collection payment and manual delivery requests | Confirm compatible SQL/flags, automatic email/CRM workers, bank checks, expired/replaced links, paid/refunded cases and competing handovers. |
| Email events | Existing acknowledgement, deposit, balance and ready variants; named-collector variants implemented | Approve copy and actual collection instructions. Weekly/progress/milestone/reminder/completion drafts do not establish send flows; implement required events or document a dependable admin-owned process. |
| Provider capacity and operations | Legacy and opt-in V2 workers exist; shared limits/metrics available | Confirm actual deployment mode and provider allowance, oldest-job visibility, failure ownership and recovery. Do not just raise limits to clear a queue. |
| Storage policy | Approved commercial rules; fee-safety hold implemented | Keep charging suspended until notification failures, usable notice, reminders and suspension/resumption accounting are resolved. Copy must accurately explain any disabled capability. |
| Emergency backup and retention | Daily Sheet export previously reported working; collector cleanup and paused schedule exist | Verify freshness/access, latest-success-only publication, bounded export cleanup, collector schedule/holds, failed-job disposition and infrastructure link redaction. Sheets cannot authorise offline release. |

## Inputs to collect from Marcus

Ask in small groups; do not reopen settled decisions.

1. **First copy review:** four-product lineup, public names, prices, exact tiers, deposits, hard limits and minimum verified participation now confirmed. Verified-only allocation is approved and implemented; Marcus reports completing the preceding rollout. Next confirm closing dates/final approval process; reconcile VGO-1/VH01 and AFS-729/AFS-729A evidence. Use existing campaign content as a draft source, not as independently verified claims.
2. **Before final commercial copy:** cancellation cutoff/eligibility; batch-specific estimates; warranty, replacement and support responsibility. Resolve FAQ versus Terms conflicts rather than choosing a new rule silently.
3. **Before fulfilment copy:** collection location/hours/booking; delivery coverage, quotation and scheduling; who handles support and exceptions. Do not publish missing values as placeholders.
4. **Before activation:** email-copy approval, hosting/provider readiness, CEO/admin access, current SQL/flag status and approval for controlled inbox checks/public opening.

## Acceptance standard

Every launch page/email must answer: what happened, what has not happened yet, what the customer should do next, what they will pay and when, and how to get help. Keep interest, order receipt, verified payment, batch proceeding and physical readiness distinct.

Review success, failure, duplicate, expired-link and optional-field states; mobile/desktop and blocked images; net amounts/quantity/reward expiry; consent/unsubscribe and privacy; truthful timelines and evidence-based product claims. Do not expose private payment/collection URLs in sharing, analytics, CRM or Sheets. Version accepted policies rather than rewriting historical financial/acceptance records.

Public opening requires both journeys to pass their applicable checks. Interest-first marketing is an ordering of the review, not acceptance of unfinished paid-order processes. No particular launch date is committed here.
