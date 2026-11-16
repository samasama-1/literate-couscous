# Exact pricing tiers and minimum participation

Prepared locally, 16 November 2026. No production SQL, deployments, settings changes, emails or financial operations were performed.

## Customer and admin behaviour

- Each batch stores its own Tier 2 and Tier 3 starting verified-unit counts, plus a separate minimum verified participation to proceed. There is no percentage-derived fallback.
- The same pricing helper drives the displayed current tier, exact ranges, next unlock and milestone positions. Only admin-verified quantities in the existing private capacity counter count. Pending requests reserve nothing.
- The customer page shows the minimum separately from the hard cap. Reaching the minimum means eligible for admin review, not automatic supplier ordering, closure, final pricing or customer email.
- New-batch creation offers four approved presets. Presets populate pricing, deposits, thresholds and limits only; they do not fabricate product descriptions, evidence, imagery, dates or availability claims. Inspect fields before saving. No production batches are seeded or updated by migration.
- Manage batch shows live verified participation and a deliberate, confirmed **Approve batch to proceed** action. The server obtains the admin identity from authentication, never the form. The database locks that batch/counter, verifies the current minimum and revision, and records one private approval audit. Repeated clicks return the existing outcome.
- A configured batch requires recorded proceed approval and a currently met minimum before a new/changed final order total can be saved. Both manual and discount-aware quotation paths encounter the same database guard. Actual final prices, delivery charges, coupon arithmetic, deposit/balance verification and identity-checked handover remain separate existing workflows. Existing quotes are not silently repriced.
- If refunds subsequently reduce participation below the minimum, retain the approval audit and pause new/revised final quotes. Admins must review supplier commitments and existing quotes; this feature does not cancel procurement, unwind quotes or automatically refund customers.
- No reference retail price or savings percentage is invented when the product has no higher supplied retail price. This removes the old `current price × 1.5` comparison.

## Approved presets

SGD per unit. Deposit remains 50% of Tier 1, irrespective of later tiers or the separate campaign reward.

| Product | T1 / T2 / T3 | Deposit | Minimum | T2 starts | T3 starts | Hard cap |
|---|---|---|---|---|---|---|
| Studio-Air | 119 / 109 / 99 | 59.50 | 423 | 424 | 713 | 1,000 |
| Everyday Air | 109 / 99 / 89 | 54.50 | 448 | 449 | 725 | 1,000 |
| Single Stack Steamer/Airfryer | 219 / 209 / 199 | 109.50 | 461 | 462 | 783 | 1,103 |
| Double Stack Steamer/Airfryer | 229 / 219 / 209 | 114.50 | 490 | 491 | 801 | 1,109 |

## Historical-batch protection

The migration deliberately leaves existing thresholds/minimum **unconfigured**; it does not infer identity from product names or guess commercial terms from old percentages. Unconfigured batches stop accepting **new** checkout requests, including direct/legacy/coupon RPC inserts. The public page says they are being prepared, without advertising an inferred current tier.

Existing order records, amounts, accepted terms and payment/fulfilment actions are retained. Existing unconfigured batches retain their historical quotation workflow; this explicit compatibility exception is for existing orders only, not a new-launch proceed approval. Do not use it to bypass the minimum on a configured batch.

- **Empty batch:** explicitly enter reviewed thresholds/minimum in Manage batch, or create a new launch batch using a preset.
- **Batch with any orders:** prices, tier starts and minimum remain locked. Content, compatible capacity and dates/status remain editable. Close it and create a new launch batch, or request a separate historical-terms review; do not delete orders, disable triggers or run ad hoc updates to force configuration.
- Approval/history are retained. There is no unapprove action in this release; operational reversal and customer commitments require an admin review.

## Deployment — Marcus, separately approved

1. Keep public opening disabled. Review existing batches and identify which are empty versus ordered; take a database/schema backup under the existing operational procedure.
2. Confirm `verified_batch_capacity.sql` and the current order/collection/manual-balance/discount migrations are installed. Apply the entire **new** `database/sql/batch_pricing_rules.sql` in the correct Supabase project as `postgres`, **after** the capacity migration. No other old files need rerunning for this feature.
3. The migration adds configuration/approval fields, a private audit table, indexed order-history lookup, guard triggers, a service-only approval RPC and a revised batch-save RPC. It appends aggregate configuration/approval metadata to the public view; admin identities stay in the private audit table. It uses a transaction and bounded lock/statement timeouts. Table/index DDL can briefly block writes; perform it while traffic is closed. On failure investigate and rerun the full transaction, not selected fragments.
4. Deploy the reviewed application through Git/Vercel. **No new environment variables, Edge Function deployment, scheduler, Apps Script mapping or OAuth settings are needed.** Preserve existing feature flags and secrets. The application fails closed on unconfigured checkout; deploy in coordination with the SQL/configuration, rather than leaving the admin UI and schema at different versions.
5. In Admin → Batches → New batch, choose each approved product preset, supply the reviewed description/image/features and actual closing date, then save. For empty existing batches, enter exact values manually. Do not modify an ordered batch's history to reuse it.
6. Verify each public range/price/minimum/deposit and the admin approval controls using controlled records. Read the rollout acceptance checks below. Opening the site remains a separate decision.

Never reapply older `batch_management.sql`, `supabase_view_fix.sql` or `verified_batch_capacity.sql` over this migration: they replace the view/RPC definitions and can fail or regress compatibility. Coordinate future changes in migration order. Retain database guards on application rollback; restore a compatible application and keep public checkout closed until reconciled. Do not delete approval audits or bypass quote/capacity checks as a rollback shortcut.

## Acceptance and remaining limits

- Check zero, one below, at and above every tier boundary/minimum for all four products; ranges end at the hard cap. Check one-tier batches and invalid/missing/duplicate/out-of-range starts.
- Pending requests do not advance progress; actual deposit verification does. Approval below minimum fails; at minimum succeeds exactly once, with no jobs/customer emails created.
- Stale revisions, forged admin actors, missing confirmation, browser/public RPC calls and direct approval-field writes must fail safely. Public view access must not expose the admin identity/audit table.
- A final quote before approval fails in both quotation paths; after approval follows existing amount/coupon guards. Falling below the minimum blocks changed quotes while retaining old records. Verify final quotes do not automatically follow subsequent tier crossings.
- Rehearse two independent PostgreSQL sessions for approval versus last-slot verification/refund and quotation versus refund. PGlite serializes calls and cannot establish multi-connection lock timing. A lock timeout requires refreshing current state before retrying.
- Check desktop/mobile Admin → Batches, presets, edits, participation and public pages before opening. Local tests/build do not establish live provider or browser acceptance.

## Performance and safeguards

Public detail/checkout use their existing primary-key view lookup with extra metadata; pricing calculation is over at most three in-memory tiers. No order aggregation, timers, reservations or new background/email jobs are added. Registration adds one batch primary-key read for the configuration guard. New/changed quotes on configured batches use one batch lookup and one counter-row share lock; approval uses one batch lock, one counter lock, one audit insert and one batch update. History checks use an indexed `EXISTS`, not exact counts. Approval/quote guards have a two-second lock timeout. The one-time order-history index is maintenance work, subject to migration timeouts.

All new helpers use `SECURITY DEFINER`, `postgres` ownership and `search_path=pg_catalog,pg_temp` with qualified application relations. Trigger helpers and private audits have no public/service direct access; only the reviewed batch-save/approval RPCs grant service-role execution behind authenticated admin server actions. No credentials, personal customer details or private payment/collection links are added to the public view or approval audit.

Broader launch work remains in `website-launch-checklist.md`: campaign contact/consent/retry safety, final emails and product evidence, fulfilment instructions, worker/provider checks, backup/access checks and complete customer journeys.

## Local verification result

119 tests passed, zero failed; TypeScript, ESLint, the production webpack build and `git diff --check` passed. Tests/build ran with external network calls disabled. The additional focused historical-order check also passed: new legacy registrations are rejected while existing deposit/quote handling remains usable. Tests cover all four presets and boundary counts, invalid settings, revision/authentication/confirmation checks, approval idempotency, no approval-generated mail, quote gating after refunds, safe privileges/ownership/search paths, public-view minimization and migration reapplication. Independent PostgreSQL lock timing, actual browser acceptance and production installation remain release checks, not claimed local results.
