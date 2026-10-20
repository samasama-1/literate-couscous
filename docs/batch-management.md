# Batch management — owner guide

The new `/admin/batches` section lists existing batches, opens their public pages, and provides editing/share controls. Batches are preorder/payment pages. They are different from voting campaigns; testing Zoho voting confirmations still uses a live campaign under Campaign pages.

## What is prepared

- Batches navigation in the operations dashboard.
- Public page links for existing batches, independent of the homepage's Coming soon redirect. Also corrected the public share widget from the nonexistent /gb/<id> route to the actual /group-buys/<id> URL, with reliable copy feedback. Sharing does not claim to create personal referral credits.
- Creation immediately returns the new batch ID and public `/group-buys/<id>` URL, with Copy link, Open public page and Manage batch actions.
- Batch editor for public name/description/features/image/retail reference price, capacity, deposit/tier prices, closing time and status.
- Open accepts new orders until closing time. Closed stops new orders and retains the public page/existing orders. Expired open batches are labelled Expired; reopening requires a future closing time. Completed requires all non-refunded orders to be fulfilled and does not itself mark any order paid/collected.
- Empty-batch deletion requires typing DELETE. Any order, including a pending/refunded order, permanently blocks batch deletion in this UI/RPC. Close it instead. Catalog products are retained; deleting a batch never deletes customer/order/payment records.

## SQL activation — applied 20 October 2026

Marcus approved applying [batch_management.sql](../database/sql/batch_management.sql), and it was applied to the linked SamaSama project `slsbdpfocmotilvdbmwk` on 20 October 2026. Prerequisite columns and registration's FOR SHARE lock were verified first. Post-migration checks confirmed postgres ownership, the restricted search_path and service-role-only execution for both RPCs. Counts remained four products, two batches and one order; no real batches or orders were created, edited or deleted during verification. The website changes still require your commit and deployment.

The new creation/edit/delete actions require this migration after the existing `order_fulfilment.sql`. The old two-step create action is replaced by a validated atomic action. When setting up another environment, apply SQL before deploying the new actions; otherwise reads/share links work, but mutations return a setup error instead of writing partial data.

The migration adds one `admin_revision` column and two service-role-only RPCs. It creates no example records. New product+batch creation rolls back together on failure. Existing product/batch/order rows are retained. Editing increments revision, and stale edits/deletions are rejected.

The RPC locks the batch with FOR UPDATE, conflicting with registration's existing FOR SHARE lock. Any existing order freezes deposit/tier prices. Capacity cannot fall below already ordered non-refunded units. Shared catalog products are copied on edit so another batch's content does not change. Function ownership is postgres, search_path is pg_catalog,pg_temp and all relations are explicitly public-qualified. PUBLIC/anon/authenticated EXECUTE is revoked; only service_role receives it. Existing table RLS/grants and payment/fulfilment RPCs are not relaxed.

For another environment, check the intended project and prerequisite columns before application. Local tests passed, including RPC permissions and atomic rollback. The synthetic two-session check in [the concurrency plan](../database/tests/batch_management_concurrency.md) has not been run: there is no staging environment currently configured. Production verification was limited to migration metadata and read-only record counts; a live create/edit/delete smoke test remains an owner-controlled step using a disposable empty batch.

## After activation

1. Open Admin → Batches. Your previously created batches should appear.
2. Choose Manage & copy link. Copy the Public batch link or open the page directly.
3. Edit the fields and Save batch changes. Refresh before another edit if prompted. Closing dates are Singapore time (UTC+08:00), including when your browser/server is elsewhere.
4. To stop registrations, set Closed and save. To reopen, choose Open and a future closing time.
5. To change pricing after orders exist, create a new batch rather than repricing the old one.
6. Only for a disposable batch with no orders, expand Delete empty batch, type DELETE and confirm. This is permanent. The old public URL then becomes unavailable; shared/retained products remain in the catalog.

The public origin comes from NEXT_PUBLIC_SITE_URL, defaulting to https://www.samasama.sg. Use your real canonical site origin in the hosting settings. Creation does not send email or generate a marketing campaign.

Local checks cover validation, exact money/time handling, atomic rollback, permissions/ownership/search_path, stale revisions, shared-product editing and blocked paid/pending/refunded-order deletion, plus server-action admin gates and generic errors. UI verification uses read-only batch screens; no real save/delete is required for visual checks.
