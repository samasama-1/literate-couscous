# Dashboard implementation — 3 November 2026

The approved interactive preview is now connected to the local application workflows. Sample orders and simulated mutations from the preview are not included in production code. No remote SQL, deployment, customer emails, production settings, Git staging or commit was performed.

## Screens

- **Collection desk** (`/admin?mode=collection`): existing indexed search, status filters and selected order; final-total confirmation and bank-verified balance; current storage clearance and current authorised collector; original photo-ID/item confirmation and one guarded handover directly in the desk. Unpaid, unready, storage-due and unavailable safety states do not render a release action. Missing identity-check installation blocks collection in manual payment mode, including a direct server-action submission. Full-order management remains available for adjustments and investigation.
- **Delivery balance emails** (`/admin/delivery-payments`): delivery-only selection and recipient/amount preview, explicit approval and bounded batch enqueue through the existing worker. No new email schedule. After a successful batch, a full-page review link permits another manual batch without retaining the previous action state. Queue status remains distinct from provider acceptance/delivery.
- **Storage safety** (`/admin/storage-safety`): actual database hold mode/cutoff, up to 50 notification holds per page with one look-ahead row, exact order-code lookup and a controlled notification-hold form. No fee activation/resumption switch. Prior balances/audits remain preserved. New list excludes email, phone, address, bank references and credentials. Authentication precedes every read/action. Delivery, refunded and already-collected orders cannot receive a new collection-notice hold through the guarded SQL operation.
- **Operations health** retains its existing report, with corrected navigation highlighting. The approved olive/neutral dashboard styling and responsive layout are reused; no replacement branding or mock data is introduced.

## Performance and safeguards

The desk loads safety only for the selected order (one summary RPC and one primary-key collector read), not every listed order. Existing order pages remain bounded at 50 plus one. The new read-only `storage_safety_overview` RPC is postgres-owned, has a safe search path and a statement timeout, denies anon/authenticated access and grants service-role execution only. Its hold query uses an indexed timestamp/ID cursor, limits rows to 51 before primary-key joining orders, and performs no global count. No polling, provider call, cleanup or automatic email producer is introduced by these screens.

UI checks are advisory: database locks, current authorization, actual bank reconciliation, storage balance and one-handover guards remain the authority. A stale dashboard or emergency spreadsheet is not clearance to release goods. Expired/revoked collectors disappear from the desk; a concurrent change is still rechecked by the existing guarded handover RPC.

## Release prerequisites

Follow `payment-rollout-hardening-2026-10-28.md` and `manual-balance-rollout.md`. The latest `collection_fee_safety_hold.sql` now also includes the private paginated overview RPC/index and restricts new notice holds to outstanding collection orders. Reapply the reviewed latest file in isolated staging even if an earlier version was rehearsed; rerunning preserves the original cutoff. Do not enable its installation flag without the matching schema. No application deployment applies SQL automatically.

Enable the reviewed named collection setup for handovers (`COLLECTION_AUTH_INSTALLED`) and manual-payment mode only after the coordinated migration/application rehearsal. Keep storage charging off, retain the independent delegation controls, and reconcile existing queued/uncertain emails before cutover. Production migration, deployment/settings and owned-inbox sends still require explicit approval. Final email wording, effective-notice/bounce automation, reminder scheduling and billing resumption remain separate launch work.

## Verification

All **103 local tests passed** with outbound network access disabled. TypeScript, ESLint, the production Webpack build and diff whitespace checks passed. Added tests exercise server-component handover gates, missing safety data, current/revoked collectors, authentication before reads, eligible-only forms, bounded tie-safe pagination, minimal exported fields, function ownership/search path and role denial. Existing tests continue to cover bank verification, exact amounts, idempotent emails and single collection.

Real browser/staff acceptance, independent-session PostgreSQL contention and approved owned-inbox sending remain staging checks. No claim of production verification is made. Earlier staged versions predate these changes: review and re-stage the final file contents before committing to a deployment branch.
