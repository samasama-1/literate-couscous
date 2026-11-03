# Payment rollout fixes and storage safety hold — 28 October 2026

Local implementation only. No remote SQL, deployment, settings, emails, staging, commit or production deletion was performed. These revisions amend the previously staged review; the Git index has deliberately not been updated.

## Review findings addressed

### 1. One application rollout switch

`MANUAL_BALANCE_INSTALLED` now governs dashboard/actions, both worker relevance checks, unpaid collection readiness and the private payment page.

- Absent/false: the existing advance-payment page and collection balance email relevance are preserved. Unpaid collection readiness is not emailed as if the new flow were active.
- True: self-collection pays at the desk; older queued collection balance requests/receipts are skipped. Delivery requests are explicitly reviewed/queued. The worker checks both before and after preparation.
- Installing `manual_balance_operations.sql` alone no longer globally suppresses legacy mail production. Only the new guarded RPCs set a transaction-local manual-operation marker, suppressing their automatic balance request/collection receipt jobs. The delivery batch RPC explicitly inserts its single approved job per order. The marker does not persist across RPC transactions.
- Older callers retain the original trigger behavior until the compatible app is switched. No database runtime lookup or extra per-email rollout query is introduced.

An environment flag is not a migration installer. Apply the reviewed schema before enabling the switch. Pause workers for a coordinated cutover and reconcile existing collection requests; do not flip back after issuing unpaid collection invitations without an explicit rollback review. Existing links/queues are not erased.

### 2. Older collection payment action closed

In manual mode, `balance_paid` first makes one indexed, admin-only order lookup. Only delivery may continue through that older action. Collection, unknown method and read failure stop before any payment RPC. Staff must use `collection_payment`, retaining the current-revision, exact-amount/reference, actual-bank-credit attestation and recorded admin audit. Authentication remains first. Legacy mode keeps its earlier behavior.

This prevents an authenticated stale/edited action from bypassing the new collection form. It is not an automated bank integration, and does not give customers payment-write access. Existing database exact-payment/reference/handover guards remain authoritative.

### 3. Independent database storage safety hold

New review-only migration: `database/sql/collection_fee_safety_hold.sql`, applied after the collection foundation. This is a conservative hold implementation, not approval to charge storage.

- A singleton control defaults to **off**, with a fixed migration-time cutoff. Existing accrued amounts before that cutoff remain subject to their current ledger, reductions, payments and manual dispute review; the migration does not forgive or delete them. New elapsed time cannot increase fees. Existing debts must be reconciled before handover as before.
- Owner-only `suspend_storage_fees(actor, reason)` records a suspension event without moving the cutoff. There is intentionally **no active mode, automatic resumption or resume RPC** in this release. The control is separate from payment and delegated collection. A future charging release needs a reviewed migration rather than an accidental feature toggle.
- A ready job accepted by the provider records submission evidence only. It no longer initializes `notice_at` or clears a notification hold. Historical notice timestamps remain intact.
- With server-only `COLLECTION_FEE_HOLD_INSTALLED=true`, the admin order screen offers controlled reasons for a notification issue: confirmed bounce, reported non-delivery or unavailable collection. The issue is persisted and audited without customer evidence/medical details. Successful retries do not resolve the hold automatically. The worker omits the revised fee-policy paragraph when this hold installation flag is set.
- Attempts to pause/resume/extend the old fee clock are denied by SQL while held; the UI hides those actions. Existing reductions/payment reconciliation can still operate through the audited RPC when their separately approved controls permit it. Direct service-role inserts/updates to collection financial tables are revoked, while required read/RPC access remains.
- All new controls/evidence/events are private with RLS and no direct API grants. Wrappers and preserved helpers are postgres-owned with `pg_catalog, pg_temp`; service gets only the intended summary/admin RPCs. The older helper functions cannot be directly invoked by public or service callers to avoid the hold.
- Summary reads use primary-key lookups and a fixed cutoff, not global order scans. There is no new cleanup or provider call on a customer request. No scheduler or customer email producer is added.

**Remaining charging gate:** provider bounce-event entitlement/authentication and reconciliation, usable-notice proof, authorized hold resolution, safe resumption/no catch-up, versioned fee accounting and pre-deadline notification copy/offsets still need approval/implementation before charging can be enabled. Existing uncertain-send jobs must be reviewed through the established queue, not blindly retried. Reminder drafts remain on the launch list; this change does not silently schedule them. Approved collection/payment functionality can be tested independently while fees remain off.

## Review-only migration and acceptance order

1. Review these unstaged revisions together with the earlier staged collection/payment changes. Re-stage final versions only after review; do not deploy just the older staged snapshot.
2. Keep new flags and schedules off. Prepare synthetic isolated staging. Collection prerequisites remain `order_fulfilment.sql`, `order_integrations.sql`, revised `collection_management.sql` and `collection_named_authorisation.sql`.
3. Apply the reviewed `manual_balance_operations.sql`, then **`collection_fee_safety_hold.sql` last**. Runtime/performance and paused schedule migrations remain separate approved changes. Do not reapply the older foundation migration over the safety wrapper without rerunning/reviewing the hold; that can restore the old notice/clock function. Rerunning the hold preserves its original cutoff.
4. Verify owners, safe paths, role grants, mode/cutoff, old ledger amounts, no provider-driven new notice clocks and no direct helper bypass. Use `COLLECTION_FEE_HOLD_INSTALLED=true` only after its schema exists. Keep `FULFILMENT_V2_ENABLED=false` for the initial fee-off release; do not publish/collect acceptance of the revised charging policy while its notice semantics remain unapproved. Collection authorization remains separately controlled.
5. Deploy compatible application to staging. Test manual flag false and true; old unpaid/paid links; legacy and manual producers; no duplicate batch mail; old direct collection payment rejection; verified bank payment → identity/storage → exactly one handover. Exercise distinct-session races on a real staging PostgreSQL database; local PGlite promise tests do not prove transaction contention.
6. Test the hold with a synthetic legacy accrued balance and a fresh order. Advance test time: legacy due must remain frozen, fresh due zero. Record a bounce, retry readiness, and confirm the hold sticks and billing stays off. Confirm reductions/payments remain audited and change no readiness or identity permissions. Suspension must not alter the original cutoff or delete audit history.
7. Review old/uncertain queue entries and perform an approved owned-inbox test only with explicit send approval. No automatic reminder or new schedule is required. Production migration, deployment, configuration and emails each still require explicit approval.

Rollback: retain fee freeze and financial/handover guards, pause delegated redemption independently if required, preserve all queues/ledger/audit/evidence, and fix forward. Do not drop safety functions, restore the old acceptance-driven clock, reset notice dates or replay uncertain emails to resolve a rollout error.

## Local verification

Added coverage for rollout-off/on email relevance and actual payment-page rendering, backward-compatible SQL producers, older-action rejection including read failure, fee-hold rerunnability, preserved debt/waivers, future-time freeze, notice evidence/hold persistence, suspension audit and helper/table permission denial. The full suite passed **100 tests** with outbound network access disabled. TypeScript, ESLint, the production Webpack build and diff whitespace checks passed. Production configuration, actual provider delivery and independent-session contention remain unverified.
