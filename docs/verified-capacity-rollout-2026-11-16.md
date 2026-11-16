# Verified-only checkout rollout — 16 November 2026

Prepared for Marcus. Local implementation and verification only; no remote SQL, deployment, settings changes or customer sends were performed.

## What this release does

- Pending orders remain requests, without reservation or expiry jobs. Only admin-verified deposits allocate units, within the hard limit.
- A private per-batch counter enforces the limit atomically across order paths. Capacity failure rolls back confirmation, audit, coupon redemption and queued receipt/CRM changes together.
- Full batches stop offering checkout. Stale requests still encounter database enforcement. Detail-page and checkout buttons no longer promise that transferring payment alone secures a slot.
- The saved-order screen and order acknowledgement share the approved availability and original-payment-method refund assurance. Existing site colour tokens are retained; no theme or redesign rollout is needed.
- Refunds and capacity-exception contact remain admin-owned. No automatic refund, bank integration, exception email or new refund ledger is included. A failed confirmation does **not** mean money was not received.

## 1. SQL — Marcus, after review

New SQL required for **this feature only**: `database/sql/verified_batch_capacity.sql`.

1. Check the Supabase project matches Vercel's production Supabase project. Do not paste credentials into a query or chat.
2. Confirm the existing order/fulfilment, integrations and batch-management migrations are installed. The local tests also cover the installed named-collection, manual-balance, fee-hold and discount paths. This is not a request to rerun all older migrations.
3. While the public site remains closed, review existing data. This read-only preflight returns aggregate counts only:

   ```sql
   SELECT b.id AS batch_id, b.target_capacity,
          coalesce(sum(o.quantity), 0) AS verified_units
   FROM public.batches b
   LEFT JOIN public.orders o
     ON o.batch_id = b.id AND o.payment_status = 'VERIFIED'
   GROUP BY b.id, b.target_capacity
   ORDER BY b.id;
   ```

   Installation also rejects invalid quantities/capacities and pre-existing overbooking. Resolve discrepancies through the operational process; do not delete orders to make a migration pass.
4. Apply the **entire** new file in Supabase SQL Editor as `postgres`, after older files replacing `admin_save_batch` or `batch_progress_view`. It uses a transaction, one-time reconciliation and write-blocking maintenance locks, with five-second lock and 45-second statement timeouts. An error requires investigation, not partial execution or removing safeguards.
5. Check the public view's confirmed and remaining units against the preflight. Private counter-table access must remain revoked from anon, authenticated and service_role; the aggregate view is intentionally readable. The local automated tests check these privileges and helper ownership/search paths.

Do not later run `batch_management.sql` or `supabase_view_fix.sql` over this migration: they can replace its updated RPC/view. Coordinate future migrations with this dependency.

## 2. Vercel — Marcus

1. Commit the reviewed application, migration, tests and docs together, including the new `src/lib/orders/availability.ts`. Review the wider working tree: it also contains earlier launch-copy changes.
2. Push through the existing Git/Vercel deployment workflow **after the SQL installation succeeds**, with public opening still disabled. Confirm Vercel deployed the intended commit and the build succeeded.
3. **No new Vercel environment variables, Supabase Edge Function deployment, scheduler, Google Apps Script change or Zoho OAuth change are required for this feature.** Preserve existing secrets and feature flags. Existing email/CRM workers render the updated code templates after application deployment.
4. Do not enable coming-soon bypasses globally or turn on unrelated fee/discount/runtime flags as part of this release.

Git/Vercel deployment does not apply SQL. SQL does not deploy the website.

## 3. Controlled release checks — Marcus/Admins with Build support

- Open a batch and checkout on desktop/mobile; verify quantities, deposit totals, delivery disclaimer, availability notice, payment details and refund assurance.
- Submit a controlled request; confirmed/remaining units must not change. Verify its saved order, durable acknowledgement and CRM outcome through the existing worker schedule.
- Confirm only a genuinely received controlled deposit; check allocation, audit, one receipt and CRM together. Repeating confirmation must not allocate twice or duplicate receipts.
- Use two independent PostgreSQL connections against isolated test records to compete for final slots. The loser must remain unconfirmed, with no deposit receipt/coupon redemption. Local PGlite promises are serialized and do not prove multi-connection locking.
- Check full-batch detail and direct checkout URLs; no new payment invitation should appear. Check a previously opened stale form is rejected by the database when no capacity remains.
- Rehearse the paid-but-unavailable exception: reconcile the bank receipt, contact the customer proactively, refund the actual deposit to the original payment method and retain evidence. Never force verification just to issue an email. Do not infer refund completion from a failed confirmation.
- Confirm admin capacity edits cannot drop below verified units and existing payment, collection, delivery and coupon controls remain operational.

If a check fails, keep public opening off. Roll back the application if needed, retaining the SQL guard/counter; older application copy is not a reason to remove capacity protection. Reconcile any funds received while an operation was blocked. Do not disable triggers or edit counters directly.

## Before public opening — next work and owners

| Owner | Next task |
|---|---|
| Build | Implement explicit per-product Tier 2/Tier 3 starts and a separate minimum-to-proceed setting/check; align detail tables, markers, current prices and admin approval. Current percentage-derived tier logic is not the approved four-product model. |
| Marcus/Admins | Configure the four batches with approved prices, fixed deposits, hard limits and closing dates once the corresponding settings are supported. Reaching the minimum must not automatically place a supplier order or lock pricing. |
| Build | Close campaign contact/consent overwrite and known-unsent acknowledgement retry gaps; verify coupon issuance and redemption in the deployed setup. |
| Marcus + Build | Approve interest/coupon, order, receipt, balance and collection/delivery email copy. Supply actual collection instructions, delivery terms and product evidence; resolve model-name discrepancies. |
| Admins + Build | Verify scheduled email/CRM workers, failed-job ownership, backlog/alerts, latest successful Sheet backup and CEO/admin access. Review old queued jobs before allowing sends. |
| Marcus | Confirm cancellation eligibility/cutoff, warranty/support responsibility, registered entity details and provider/hosting readiness. Keep storage charging suspended until notice/bounce/reminder safety is complete. |
| Joint | Complete both interest and paid-order journeys, including discounted totals, actual bank receipt, delivery-only balance requests, collection payment, current authorised collector and duplicate-handover prevention. Authorise public opening separately. |

Approved batch configuration reference (SGD per unit; starts/minimum/capacity count verified units):

| Product | Prices T1/T2/T3 | Deposit | T2 starts | T3 starts | Minimum to proceed | Hard cap |
|---|---|---|---|---|---|---|
| Studio-Air | 119 / 109 / 99 | 59.50 | 424 | 713 | 423 | 1,000 |
| Everyday Air | 109 / 99 / 89 | 54.50 | 449 | 725 | 448 | 1,000 |
| Single Stack Steamer/Airfryer | 219 / 209 / 199 | 109.50 | 462 | 783 | 461 | 1,103 |
| Double Stack Steamer/Airfryer | 229 / 219 / 209 | 114.50 | 491 | 801 | 490 | 1,109 |

Detailed launch register: `website-launch-checklist.md`. Feature internals and operational limitations: `verified-batch-capacity.md`.

## Local verification

115 tests passed, zero failed. TypeScript, ESLint, the production webpack build and `git diff --check` passed. Tests/build ran with external network calls disabled. Coverage includes atomic capacity failure/rollback, repeat confirmations, private-table/helper privileges, owner/search-path checks, coupon compatibility, payment/collection controls and the updated text/HTML acknowledgement. Multi-connection PostgreSQL contention and live provider delivery remain the controlled release checks above; they were not performed locally.
