# Campaign first-order discount — 10 November 2026

Application changes prepared for the approved Git push. Remote SQL installation, environment configuration and program activation remain separate steps; no customer email, backfill or deletion is part of this release.

## Approved rules

- Any product on the first order, in the existing one-product/batch checkout. No mixed-product cart is introduced.
- S$10 per individual unit, including repeated SKU units. Quantity remains 1–10, so the current maximum discount is S$100 on an order of ten qualifying units.
- The final product price **before this reward** must be at least S$50 per unit. Delivery/storage charges do not contribute to eligibility and receive no discount. S$49.99 does not qualify; S$50 does.
- Valid for new code application for six **calendar months**, calculated in Singapore time from issue. It is not 180 days. Re-voting, retrying mail or admin reinstatement does not extend the original expiry.
- One personal code per normalized email across this reward program, not one fresh code for every campaign. Qualifying new interested registrations in active non-test campaigns earn it while issuance is enabled. No retroactive awards, no test-campaign awards, and no marketing subscription without the existing separate consent choice.
- Reserved when the customer submits an order with the code and the same registered email; committed when that order's deposit is verified. A code applied before expiry remains attached to that order: admin processing delay does not retrospectively expire it. There is no new automatic unpaid-order cancellation deadline.
- Earlier verified deposits (including historical verified orders missing timestamps) prevent a new first-order redemption. A pending order alone is not a paid first order. If another order is paid first, a reward reserved elsewhere is held for review rather than silently granting two first-order rewards.
- Reinstatement is **admin-only**, with explicit approval/reason. Releasing an unpaid reservation cancels the linked unpaid order; it cannot subsequently accept payment or release goods. Refunded/unfulfilled orders can be reinstated after the admin confirms actual refund settlement. No automatic refund, bank transfer, receipt falsification or customer email is performed by the coupon controls. Returned/fulfilled-order exceptions require a separate approved process because the current system has no returns ledger.
- Refunds must use actual discounted funds received, not an undiscounted catalogue total. The admin list shows recorded deposit/balance receipts; reconcile those against the bank and any prior refunds. Storage receipts remain separate.

Example: two units at S$160 = S$320 gross product total, minus S$20 reward = S$300, minus a verified S$40 deposit = S$260 remaining. A separately agreed S$15 delivery charge produces a S$315 final total and S$275 remaining. The discount never reduces the deposit or produces an automatic negative balance/refund.

## Customer and admin flow

1. Admin enables new issuance in **Campaign discounts** (`/admin/discounts`) only after setup/content review. The public interest form shows the offer only when the application flag and private database issuance control both permit it. Pausing issuance preserves existing codes.
2. A qualifying new registration, reward ledger row and existing confirmation-email pointer commit atomically. The existing confirmation email includes the personal code and exact expiry. No second email or new schedule is added. Existing safe-send claims, provider budgets and uncertain-send restrictions remain. Known-unsent campaign confirmations still use the existing admin retry flow; this feature does not invent an automatic campaign-mail drain.
3. The checkout accepts the code as an optional POST field, never a URL query parameter. It checks email, expiry, first-paid-order history, reservation state and product price in SQL under locks before committing the order. The success page shows the reserved discount and unchanged deposit. Public responses never return coupon secrets or email envelopes.
4. Admin verifies the actual deposit as before. Final pricing uses **product price per unit** and a separate **whole-order delivery charge**. SQL multiplies the authoritative order quantity, subtracts the reward once, and saves the net total/balance. Price changes invalidate old balance links and stale previews; processing/uncertain delivery requests block repricing. Prices below S$50 require an explicit reward review/removal, rather than disguising a low product price inside delivery charges.
5. Collection payments, identity and storage checks, one handover, and manual delivery-email approval remain unchanged. Order details, desk, delivery preview, payment email and private balance page show the recorded reward. Payment/refund/CRM/operations export monetary totals remain **net totals**; raw reward codes/envelopes do not go to CRM or Sheets. Adding separate gross/discount columns to the spreadsheet would require a separately versioned export/header update; this release does not change its schema.
6. Admin can inspect issued/reserved/redeemed/review/revoked and expired-for-new-redemption states, original issue/expiry dates, recorded received funds, linked order and confirmation-mail history. No raw codes are displayed in the admin list. Reinstatement/revocation is audited and never sends mail or issues a refund itself. Tell the customer before changing an agreed unsettled price or cancelling their unpaid reservation; check late bank transfers manually.

## Database and application setup — approval required before remote changes

1. Prerequisites: current campaign lead, hardening/content and mail-delivery schema; existing order fulfilment/integrations, named-collection, manual-balance and fee-safety migrations. The `attempted_at` delivery column and manual balance revision must exist. Preserve the earlier fee-off controls.
2. Apply only the reviewed latest `database/sql/campaign_discounts.sql` after those prerequisites. It defaults issuance to false, creates no schedules, sends no mail and backfills no customers. Reapplication preserves codes, issue dates, expiry, reservations and issuance settings.
3. The migration adds private reward/control/event tables; financial snapshot and explicit unpaid-cancellation fields; indexed first-paid-email lookups; and service-only RPCs. It also replaces the core order-registration function with a schema-qualified version that excludes genuinely cancelled unpaid orders from the existing duplicate-phone rule. Do not overwrite it later with an older `order_fulfilment.sql` without reapplying/reviewing this migration.
4. Deploy compatible application with server-only `CAMPAIGN_DISCOUNTS_INSTALLED=true`, keeping `MANUAL_BALANCE_INSTALLED=true` and the previously reviewed collection controls. Existing `ORDER_EMAIL_LINK_KEY` is used to encrypt the code with a distinct coupon-purpose binding. Do not expose it, paste it into chat, rotate it casually, or add a NEXT_PUBLIC prefix. Existing pending private payment links and code emails also depend on its continuity.
5. Confirm the Discounts page loads, then use its explicit issuance control to open the program. This records the opening time; it does not award earlier contacts. Review the public campaign copy/confirmation email and use only the approved controlled addresses for actual send checks. Neither a successful Git push nor application deployment applies SQL.
6. Do not run old seed SQL, globally enable fee charging, replace worker schedules or bulk resend uncertain emails as part of this feature. No extra scheduler is required. If the existing campaign acknowledgement is deferred by provider capacity, use its current known-unsent retry controls; never replay an uncertain provider POST.

Pause new awards through the **issuance control**, not by stripping the installation flag from already-discounted orders. Previously issued rights, net totals, cancellations, encrypted mail and financial guards must continue to work. Keep compatible pricing/payment code, preserve ledger/audit/claims and fix forward. Reverting Git does not undo financial records or previously sent codes.

## Security and cost

Codes have 128 bits of random redemption entropy, normalized case/separators, an indexed hash for lookup, and an encrypted delivery token bound to the coupon purpose/ID. Raw codes are never stored in database rows, logs, signup responses, CRM, URLs or Sheets. Only the registered recipient receives the code through existing mail. Possession plus matching email authorizes this discount; it is not a general account-ownership or marketing-consent verification system. Multiple addresses can still represent one person; no phone/ID collection is added to pretend this guarantees unique humans.

New tables deny PUBLIC/anon/authenticated/service direct access, with RLS. Postgres-owned functions use safe `pg_catalog, pg_temp`; only intended RPCs grant service execution. Trigger helpers are not exposed. Admin authentication precedes state reads/writes and actor identity is server-derived. Customer redemption is distributed-rate-limited; malformed codes and eligibility failures return generic messages. Quantity/email/batch cannot change underneath an attached reward. Exact net-price checks block legacy total edits that would omit or double-apply it. The cancellation guard stops subsequent financial/handover transitions; queued known-unsent order emails are skipped, and processing/review sends require investigation before an unpaid cancellation/reinstatement.

Request work stays bounded: primary-key/unique-hash/email lookups, one order/voucher row lock, per-email advisory locking and bounded (51-row) admin seek pagination. No database-wide count/cleanup or per-customer timer is introduced. Issuance adds one reward/event write plus a queued-mail pointer; reservation/commit/quote/reinstatement add the necessary ledger/audit writes. Each existing order-email insert adds one primary-key snapshot read. No additional confirmation email, provider subscription, Edge Function or scheduled invocation is introduced. Provider throughput and the campaign email retry/ownership launch work remain independent prerequisites.

## Checks before public use

- Six-month month-end/leap-year and Singapore midnight boundaries; unchanged expiry on request/mail retries and reinstatement.
- S$49.99, S$50, 1/2/10 units, rejected 11, same SKU, delivery charges excluded from the minimum, no code stacking, net total below already received funds rejected.
- Two simultaneous order attempts, different email, expired unused code, expired-after-valid-reservation completion, prior paid order, competing first deposit, stale quote and invalidated payment link.
- Owner-controlled email: correct private code, same value on a safe retry, correct per-unit terms and exact expiry. SMTP/Zoho acceptance is not proof of inbox delivery. Test sender failure without losing the saved registration and reconcile uncertain sends.
- Admin-only approval, unused revocation/reinstatement, unpaid cancellation, refunded unfulfilled reinstatement, rejected already fulfilled/paid-but-not-refunded cases, no automatic expiry extension/refund/send. Check actual bank receipts and original discounted amounts.
- Anonymous/authenticated function/table denial, function ownership/search paths, no code/envelope in admin/public responses or logs, both feature-off legacy behavior and feature-on pricing, and existing collection/storage/handover safeguards.

## Local verification — rechecked 12 November 2026

- Full test suite: **110 passed, 0 failed**, including the coupon migration applied twice in local PGlite, eligibility, money calculations, expiry, administrator actions, mail rendering and cancelled-order CRM status.
- TypeScript, ESLint, production webpack build and `git diff --check`: passed.
- External networking was blocked during the tests and build. Mail/provider calls were mocked; no customer messages were sent.
- PGlite reservation tests exercise competing promises in the local database runtime; they do not establish real separate-connection PostgreSQL contention behaviour. Review locks with controlled concurrent connections before enabling issuance remotely.

Hosting logs/access controls, remote SQL installation and owned-inbox delivery have not been verified. No production settings, database records or schedules were changed. Issuance defaults off until explicitly enabled by an admin after installation.
