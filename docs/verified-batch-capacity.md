# Verified-only batch capacity

Prepared locally · 16 November 2026 · no remote SQL, deployment or sends

Step-by-step SQL/Vercel rollout and launch handoff: [verified-capacity-rollout-2026-11-16.md](verified-capacity-rollout-2026-11-16.md).

## Approved behaviour

Submitting an order creates a pending request, not a reservation. Interest registrations and pending orders do not consume unit capacity or advance price tiers. A slot is secured only after the admin verifies actual receipt of the deposit **and** the database accepts the quantity within the remaining hard limit. No pending-order expiry, scheduled cleanup or automatic cancellation is added.

At capacity, new requests are rejected. A request accepted earlier may still lose availability before the admin verifies it. If funds have arrived, the admin must reconcile them and resolve the order or arrange an approved refund; a rejected system confirmation is not evidence that money was not received.

## Implementation

- `database/sql/verified_batch_capacity.sql` creates an owner-only, RLS-protected per-batch counter. Existing verified quantities are reconciled once during installation under write-blocking table locks. Installation aborts on invalid or already-over-capacity data; it does not cancel, trim or refund existing orders.
- A conditional **single-row UPDATE** increases the counter only for a transition into `VERIFIED`. Its remaining-capacity predicate is rechecked after a competing transaction releases the row lock. Over-limit confirmations fail atomically, including their payment audit, email/CRM jobs and coupon-redemption changes. Existing operation-level idempotency prevents duplicate confirmation; the trigger also treats unchanged verified state as a zero delta.
- Pending-order insertion makes one indexed counter read to reject an already impossible quantity. It does not lock/reserve units; the later confirmation remains authoritative. Direct trusted status updates and verified inserts cannot bypass the counter guard.
- Verified quantity/batch changes are rejected to protect recorded allocations and receipts. Unchanged verified updates do not rewrite the counter. Existing explicit changes from `VERIFIED` to `REFUNDED` remove those units, preserving the previous public progress-view definition; this feature creates no new refund endpoint or automatic refund. A re-verification must pass capacity again. Physical returns, fulfilled refunds and stock suitability still require admin reconciliation; the counter is participation capacity, not a returned-stock inventory ledger.
- New batches receive an empty counter. Editing a hard limit cannot reduce it below verified units. The refreshed batch-save RPC ignores pending requests in that capacity comparison, while retaining its authentication boundary, revision check, order-history protection and price lock.
- The public `batch_progress_view` keeps its existing column names/types, exposing only existing batch metadata and aggregate verified/remaining quantities. It now uses a primary-key counter join rather than summing orders on public requests. No customer data or private counter writes are granted to public/service callers.
- Checkout and the order-received email explain that submission/payment transfer alone does not secure availability. Fully subscribed batches hide the checkout form. The database still checks stale forms and legacy/coupon RPC callers.

## Installation and compatibility — separate approval required

1. Review the migration after the current `order_fulfilment.sql`, `order_integrations.sql`, `batch_management.sql` and any installed collection/manual-balance/coupon migrations. Apply it **last** among files replacing the batch-save RPC/view. The new counter triggers apply to ordinary, policy-aware and coupon order paths without a new application environment flag.
2. Install during a quiet maintenance window: the one-time reconciliation locks orders and batches, with five-second lock and 45-second statement timeouts. A lock/data-review failure rolls back the migration; investigate rather than deleting or altering customer records to force installation.
3. Deploy the compatible application/error wording. Git deployment does not apply SQL. No Edge Function, scheduler, mailbox setting or paid resource is required for this feature.
4. Confirm a known pending request leaves public counts unchanged; verify a controlled actual payment and check the counter, order, audit and queued notifications together. Check admin capacity edits and full-batch handling. Do not issue synthetic financial confirmations against customer records.
5. Exercise two truly separate PostgreSQL sessions at the final slots before public opening. Local PGlite tests serialize competing promises and cannot establish multi-connection lock timing. A lock timeout/serialization failure should leave the operation unconfirmed; inspect current state before retrying.

Keep the invariant triggers and counter if application changes are reverted. Do not restore an older view, batch-save function or direct counter edits as a rollback shortcut. Reapplying this migration reconciles counters from orders under maintenance locks, preserving order, financial, audit and job records. Trusted bulk imports/truncation/trigger-disabled maintenance require a coordinated reconciliation; ordinary application roles have no access to do that through the new table/helpers.

## Admin procedure when verification is blocked

1. Stop confirmation and refresh the order/batch. Do not release goods or increase the approved limit to work around it.
2. Check the real bank receipt, reference, amount and whether another admin already confirmed the order. A failed database confirmation rolls back its reference/receipt update, so reconcile against the bank rather than treating a pending status as proof of nonpayment.
3. Proactively contact the customer at the saved order address and explain availability. Refund the actual deposit received via its original payment method under the approved manual exception/refund procedure; never mark the deposit verified merely to trigger a receipt email. The saved-order screen and acknowledgement now promise this outcome. Admins must own the contact, refund and retained evidence; there is no automatic exception notification or refund processing.
4. Record the resolution through approved operational/audit procedures. This change does not create a new refund ledger, automatic customer exception email or a new hold-status workflow. Those broader reconciliation capabilities remain tracked launch work.

## Performance and validation

No timer, email job or extra worker invocation is added. Each pending registration adds one primary-key read; each change in verified allocation adds one conditional counter-row write. A batch-capacity edit updates one counter row. Contention is limited to confirmations/limit edits for the same batch and bounded by the helper's two-second lock timeout. One-time migration reconciliation is maintenance work, not a customer request.

Local tests cover pending requests, multi-unit final slots, repeat confirmations, payment mismatches, failure rollback (including coupon/jobs), direct-write guards, refunds, limit edits, new batches, migration reapplication/overbooking refusal, public view access and private-table/function denial. **Final local verification: 115 tests passed, 0 failed; TypeScript, ESLint, production webpack build and `git diff --check` passed.** External networking was blocked during the tests/build. No real mailbox, production database or bank was contacted. Separate-connection PostgreSQL contention remains an explicit rollout check, not a claimed local test result.

## Separate work still required

This implements the approved verified-only **capacity** rule. It does not configure the four production products, install their revised deposits/prices, replace percentage-based pricing tiers with their approved explicit thresholds, implement minimum-to-proceed approval, or resolve campaign contact ownership/retry work. See `campaign-product-sources.md` and `launch-copy-readiness-2026-11-16.md`; those remaining items must not be marked complete by this migration.
