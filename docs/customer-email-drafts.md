# Customer email draft register

Updated 17 November 2026 · drafts only · no live templates, queue jobs or schedules created by this register

Marcus will dictate exact emails and content later. The entries below are **draft briefs with subject starters**, not final customer copy. Their existence does not mean the sender/event is implemented. Do not paste them into an enabled workflow or send placeholders to customers.

Launch tracking: [website-launch-checklist.md](website-launch-checklist.md).

## Existing emails requiring final review

| ID | Event / subject starter | Required content for the later draft | Current implementation / review gate |
|---|---|---|---|
| E01 | Order received — your SamaSama order | Customer greeting, product/image, batch, quantity, order code, deposit amount/instructions, support. Distinguish order received from payment verified. | Existing `order_received` template in `src/lib/order-integrations/messages.ts`; final copy and automatic full-journey test pending. |
| E02 | We received your product pick | Chosen campaign/product and estimated price; no purchase/payment; accurate preference wording and support. No claim that the email address is verified. | Existing `intent_confirmation` in `src/lib/campaigns/email.ts`; copy, ownership/consent safety, automatic deferred-job retry and acceptance pending. |
| E03 | Your deposit has been verified | Confirm only after bank verification; amount, order/product/quantity and next step. | Existing `deposit_received`; final approval/testing pending. |
| E04 | Your remaining balance is ready | Product image/name, batch/quantity, final total, verified deposit, remaining amount, valid private link, support. Explain replacement/expiry without exposing another customer's information. | Existing `balance_requested`; final approval/testing pending. |
| E05 | Your remaining payment has been verified | Verified amount, order details and what happens next; no unsupported collection promise. | Existing `balance_paid`; final approval/testing pending. |
| E06a | Your order is ready for collection | Actual location/hours, quantity, collection/appointment instructions, applicable free-period/deadline/fee terms, support and private owner-only collection management access when enabled. | Existing `ready` variant; collection/security/notice gates and operational details pending. |
| E06b | Your order is ready for delivery arrangements | Product/order details, delivery subject to confirmation, agreed charges/next action and support. Do not claim dispatched or delivered without evidence. | Existing `ready` delivery variant; final copy/acceptance pending. |

## Future emails: prepare briefs before implementing send flows

| ID | Event / subject starter | Required content / trigger constraint | Outstanding work |
|---|---|---|---|
| E07 | Your weekly SamaSama update | Truthful batch/order progress and next expected step; approved preferences; avoid duplicate or obsolete updates. | Weekly scheduling, eligibility, versioned content and consent/channel review. Four updates across the 30-day model. |
| E08a | A reminder about your deposit | Correct outstanding amount/instructions; stop after verified payment/refund/cancellation. | Draft, approved timing, event producer and final-state eligibility. Earlier 24-hour plan is not an activated sender. |
| E08b | A reminder about your remaining balance | Current balance and valid private link; stop after settlement/replaced link/refund/cancellation. | Draft, approved timing, producer/expiry/retry tests. Earlier three-day plan is not an activated sender. |
| E08c | Your collection date is approaching / your collection is overdue | Current collection date and action, applicable deadlines/charges, support; suppress after fulfilment and reschedule obsolete reminders safely. | Exact offsets/content will be dictated later. Anchor to individual collection dates; weekly progress cadence does not govern these messages. |
| E08d | Your free collection period is ending | Effective deadline, applicable approved policy, available collection/support action and fee wording. | Approved lead time and dependable notice evidence; do not start notification-dependent fees on failed/bounced notice. |
| E08e | Please arrange collection before review | Current deadline, fees/adjustments and manual-review explanation; no invented automatic cancellation, resale or forfeiture. | Final content/timing and state/notice checks. |
| E09 | Your SamaSama verification code | Purpose, configured expiry, safe “didn't request this” guidance and support; minimal order information. | For third-party collection, the replacement uses a single-use emailed form link, not an OTP or pickup code. Other ownership-verification needs remain a separate design task. A receipt is not ownership proof. |
| E10 | Your authorized collector has changed | Owner notification of authorization/replacement/revocation, safe correction/recovery instructions and timestamp; minimize collector data. | Locally implemented transactional owner-change notice; final copy, inbox test and rollout still pending. The owner form link is single-use and expires in 24 hours; never send it to the collector. |
| E11 | Order exception / outcome | Specific approved cancellation/refund, collection-date change, handover completion or delivery exception; facts must match recorded status and actual refund settlement. | Decide required launch variants first; no financial/status assumption or automatic sender is created here. |

## Completion checklist for every approved message

- [ ] Marcus confirms whether the message is needed for launch, final subject/body and required operational details.
- [ ] Name one sending system; avoid duplicate website/CRM workflows. Template editor integration is a separate decision.
- [ ] Define trigger, recipient, data source, unique event key, priority, timing, expiry and cancellation/suppression conditions.
- [ ] Distinguish order/contact acknowledgement, ownership verification, bank verification and fulfilment status.
- [ ] Validate fields and private-link audience; never export auth tokens/links to general CRM/Sheets fields.
- [ ] Escape customer-supplied text and retain readable fallback when images fail. Do not embed real personal data in previews.
- [ ] Check support/replies to hello@samasama.sg, preferences/unsubscribe where applicable, and deadline/policy consistency.
- [ ] Preview with synthetic data, then obtain explicit approval for owned-inbox test sends.
- [ ] Test duplicates, stale state, missing data, bounce, deferred capacity, uncertain sends, expiry and rescheduling.
- [ ] Record approved template version and activation approval. Keep unapproved drafts unsendable.

The E02 body below is adapted from Marcus's supplied draft; the other entries remain briefs. Existing production templates were not edited or disabled. Exact collection-reminder offsets remain deferred for Marcus's later instructions.

Named-collector update: the collection-ready email now includes the owner-only authorisation form link. Collector provides full name only; staff verify original photo ID and order code. No collector phone or pickup code is collected. See [replacement guide](named-collector-rollout.md).

## Manual balance routing update — 27 October 2026

The current approved flow supersedes earlier general balance-request briefs: self-collection customers pay their remaining balance at collection. The collection-ready email may state the amount due at the desk; it must not demand payment again if already settled. Delivery customers alone receive balance requests, explicitly previewed and queued by admins; no automatic request or balance reminder is added. Keep product/image, batch, quantity, final total, verified deposit, remaining balance, private payment link and support in the delivery draft. Final content is still pending Marcus’s review. See [manual-balance-rollout.md](manual-balance-rollout.md).

## Campaign reward confirmation update — 10 November 2026

The prepared campaign acknowledgement includes the personal reward only for newly eligible registrations: S$10 per unit (up to ten), any product at least S$50 per unit before discount, first paid order, six calendar months from issue. The deposit is unchanged. Codes are private and email-bound, not returned on the public success page. Review final copy/terms and an approved owned-inbox send before activation. No separate reward email or automatic reminder schedule was added. See [campaign-discounts-setup.md](campaign-discounts-setup.md).


Campaign update — 17 November: Marcus explicitly chose a **single-step campaign registration**. No registration reconfirmation page, owner-review link, second marketing checkbox or pending-owner data is required. Earlier confirmation-page drafts and preview states are superseded. New-contact marketing follows the optional form checkbox; existing contact details, picks and unsubscribe preferences are preserved. Changes to an existing registration go through support.

## E02 — customer-supplied copy, 17 November 2026

**Status:** Marcus requested this copy be used in the implementation. Prepared locally; no test send, rollout or production activation is authorized by this wording decision. The sender uses a neutral subject and omits the reward section if no eligible code is available.

**Subject:** Your pick is in—here’s your S$10 thank-you

**Preview text:** Thanks for helping shape what SamaSama brings in next.

Hi,

**Thanks for helping us choose what to bring in next.**

You’ve registered your interest in **{{product_name}}**, with an estimated launch price of **{{estimated_price_sgd}}**.

Your input helps guide our sourcing decisions. Before we open a batch, we review suppliers, check product claims and samples, and work through the fulfilment details.

**There’s nothing to pay, and you haven’t placed an order.**

Before you commit, we’ll share the confirmed product details, batch pricing, estimated timeline and support terms.

**A thank-you for being here early**

Your personal first-order code:

**{{personal_code}}**

Get **S$10 off each eligible unit in your first order**, for up to **10 units**. Use it on any eligible SamaSama product.

Use the same email address you registered with. Valid until **{{original_coupon_expiry_singapore}}**.

Your deposit stays unchanged; the discount reduces your final balance.

Eligible products must cost at least S$50 per unit before discount.

**Terms and conditions apply** — /campaign-offer-terms

**See how SamaSama works** — /how-it-works

Questions about {{product_name}} or the process?

Reply to this email—we’re happy to help.

Thanks for being part of the journey,

**The SamaSama team**

*Marketing updates are optional and follow your chosen preferences.*

**Manage marketing preferences** — existing signed unsubscribe link.

### Dynamic fields and operational notes

- Greeting falls back to “Hi,” because the form does not collect a first name. Product, price, code and original Singapore-time expiry come from saved data; never send literal placeholders.
- The supplied 16 May 2027 date is an example for a 16 November 2026 issue; keep six-calendar-month expiry from the original issue, unchanged by retries.
- Marcus approved replacing “in this campaign” with “each eligible unit in your first order”; the email explicitly permits any eligible SamaSama product. Agreed eligibility and financial rules are unchanged.
- A dedicated /campaign-offer-terms page is prepared with the approved rules and linked from HTML/plain text. It links to the general order, refund and privacy pages; deployment/content acceptance remain separate.
- The acknowledgement confirms receipt of interest, not verified email ownership or payment. Repeat submissions do not change an existing saved pick; support handles corrections. Admins must not treat a single opt-in as verified inbox ownership.
- Keep the ten-minute repeat-email cooldown, bounded safe retries, shared sender budget and original coupon preservation. No new customer action or automatic schedule is introduced.

Email appearance — 17 November: the actual HTML renderer now uses the site’s olive/linen palette, a decorative generated parcel illustration, selectable code/expiry text and email-compatible presentation tables. Plain text remains available; key information does not depend on the image. Preview and dedicated offer terms are prepared locally. Campaign-specific page/success-copy review follows these items, as requested.
