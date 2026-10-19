# Approved minimization implementation, inventory and staging plan

Prepared on 15 October 2026. **Review-ready local changes only. No remote SQL, Edge deployment, Google Sheet edit, sharing change, file creation, revision deletion or existing-data deletion was performed.** Google work was read-only discovery, metadata and revision inspection. SQL tests ran in disposable local PGlite databases.

## Implemented policy

Latest approved change: customer email and full phone are operational fields in warehouse_v3 (schema 3), appended as Orders columns 18/19. Addresses and transaction references remain excluded; earlier no-contact warehouse_v2 snapshots/callers must not be reused.

The database produces a fixed `warehouse_v3` profile, schema version 3. Fields are removed from the SQL projection itself, not hidden in Google. As subsequently approved for operational use, both collection and delivery orders include customer email and phone in the Orders dataset. Neither exports street/unit/postcode or transaction references. There is no HTTP flag, spreadsheet setting or alternate `kind` that unlocks delivery addresses with the warehouse key.

The warehouse copy keeps order code, product/batch/quantity, customer name/email/phone, fulfilment method, payment status/amounts and operational timestamps. Staff/recipient identities, internal order/activity UUIDs and arbitrary metadata were also removed as unnecessary for the general warehouse copy. Original data and audit history remain in Supabase and the authenticated admin application.

### SQL / Google column contract

The arrays are positional; these are the actual new SQL positions and matching Apps Script headers.

| Position (1-based) | Orders |
| --- | --- |
| 1 | Order code |
| 2 | Batch ID |
| 3 | Product |
| 4 | Customer name |
| 5 | Fulfilment method |
| 6 | Quantity |
| 7 | Payment status |
| 8 | Deposit due (SGD cents) |
| 9 | Deposit verified at (UTC) |
| 10 | Final total (SGD cents) |
| 11 | Balance due (SGD cents) |
| 12 | Balance requested at (UTC) |
| 13 | Balance paid at (UTC) |
| 14 | Ready at (UTC) |
| 15 | Fulfilled at (UTC) |
| 16 | Created at (UTC) |
| 17 | Handover clearance |
| 18 | Customer email |
| 19 | Customer phone |

| Position (1-based) | Payment & Collection History |
| --- | --- |
| 1 | Order code |
| 2 | Action |
| 3 | Created at (UTC) |
| 4 | Amount (SGD cents) |
| 5 | Final total (SGD cents) |
| 6 | Balance due (SGD cents) |
| 7 | Fulfilment method |

History includes only `deposit`, `legacy_deposit`, `balance_request`, `balance_paid`, `ready`, and `fulfil`. Amount metadata is converted only from unsigned 1–9 digit numeric values; unexpected text/objects become NULL, never copied as free text. Actor, reference, recipient and arbitrary metadata are excluded. Fulfilment method comes from the constrained order column, not arbitrary event metadata. Unknown actions are not exported. The original full audit remains available in admin; this feed is deliberately not a finance/audit replacement.

All money is integer SGD cents. A due amount is NOT proof of receipt; use payment status and verification/payment timestamps. NULL means unknown, not zero. Refunded orders retain historical amounts/timestamps, so they must not be treated as current cash received.

### Preventing unpaid or duplicate handover

`Handover clearance` is computed in SQL:

- `refunded`: payment status is REFUNDED; do not hand over.
- `fulfilled`: a fulfilment timestamp already exists; do not hand over again.
- `ready_for_handover`: nonblank order code and positive quantity, deposit status VERIFIED, ready timestamp present, final total/deposit/balance all known and arithmetically consistent, and either zero remaining balance or a balance-paid timestamp. Arithmetic uses bigint to avoid overflow on inconsistent legacy integer amounts.
- `not_cleared`: all other cases, including unpaid deposits, unknown legacy deposits, inconsistent totals, unpaid positive balances and orders not marked ready.

Fulfilment method and quantity remain visible so staff distinguish pickup from delivery and hand over the correct units. The fulfilled timestamp prevents a previously completed order appearing eligible in the snapshot. These are snapshot-time signals, not a live write/checkoff mechanism: a daily copy can miss later payments/handovers. Continue using the authenticated dashboard for final clearance and collection marking. Use a separately controlled outage incident log and reconcile before repeated handover if the dashboard is unavailable.

No application registration, payment verification, balance request/payment, ready, collection or delivery action was changed. `order_fulfilment.sql`, the orders data, existing transaction references and audit ledger are preserved. The existing transactional operation guards remain authoritative. Tests prove snapshot creation does not modify source orders and retain the existing lifecycle suite.

## Operational contact and conditional dispatch access

Customer email and full phone are now explicitly approved for operational contact and included in the Orders dataset for all orders. They are not duplicated into activity history. Phone is sent as a RAW string, preserving `+` and leading zeros. Anyone with workbook access can read these fields: share the dedicated workbook only with named operators/groups that need customer contact, ordinarily as Viewers. Keep the standalone script and export secret private to trusted maintainers and review group membership. A warehouse Viewer can now read these approved contact fields; earlier statements that phone/email were inaccessible are superseded.

Delivery addresses remain excluded from the entire general export, including delivery orders. An administrator handling a specific dispatch task uses the existing order detail page, guarded by an active Supabase session and server-side `ADMIN_EMAILS` allowlist. Current admin access is broad administrator access, not dispatch-specific RBAC; do not grant full admin to helpers just to expose an address. A separate restricted dispatch export would require an additional reviewed implementation and approval. No such feed, new credentials, address-unlock option or new permissions are created here. Record justified address access without copying addresses into the general workbook.

## Legacy snapshots and fresh workbook requirement

Existing snapshot rows receive `schema_version=1` when the column is added. They are never relabelled or rewritten as minimized data. New snapshots explicitly record version 3 and return `schema_version:3, profile:"warehouse_v3"` in the manifest. Start retries and page RPCs refuse live version-1 or version-2 snapshots with `EXPORT_SCHEMA_CHANGED`; the public Edge response remains generic. Existing version-3 retries remain idempotent, including during cooldown.

The Google script checks the manifest version/profile before staging data. It requires a **newly created warehouse v3 workbook**, with its profile marker in `Export Status!B12`, exact current/previous-tab headers, and no unexpected tabs. Versioned staging names prevent cleanup/renaming of legacy staging tabs. The old workbook is not silently converted and its old current tab is not carried forward as a hidden previous copy. The create function writes the marker only when initializing a NEW workbook; users must not manually relabel a legacy file.

The marker/header checks prevent accidental reuse; they are not proof against a malicious editor or a previously copied file's hidden history. Create from the new script's blank workbook function, not by copying a legacy Google file. Prefer a new standalone script project so its per-file grant does not inherit the old project's access. Any property resets, new file creation, key rotation and cutover are future actions requiring approval.

Existing version-1/version-2 rows/files still require normal expiry cleanup or an explicitly approved remediation. This patch does not include an immediate DELETE of historical snapshots or source data.

## Read-only Drive inventory and history findings

The connected Drive account was searched for SamaSama spreadsheets and “Operations Backup”. No file titled/matching the new operations backup was returned. This is **not proof that no exports exist** in another account, under a different title or outside the accessible Drive. The actual production Apps Script `SPREADSHEET_ID`, if configured elsewhere, must be matched to the inventory before sign-off. Script properties were not fetched or modified.

One relevant older file was inspected: [Sama Sama - Pilot Ops Tracker](https://docs.google.com/spreadsheets/d/1jG4D2ChEBtW0lsJJjgTQaPchxPJlG6-4NFLfI0sRGBI/edit?usp=drivesdk), created in June 2026, before this integration. Metadata returned an `anyone` / `writer` permission with link discovery disabled: **anyone with the link can edit**. This is a high-priority access finding if the file is used for live orders; it is not evidence that customer records were actually leaked.

The connector returned revisions `1`, `2`, and `23`. All three were fetched read-only. Revisions 1/2 returned empty representations; revision 23 contained operational template instructions and headers including Phone, Email, PayNow Reference and Delivery Address. No populated customer records appeared in the returned revision content. We did not establish that this file ever received operations-export submissions. No customer contact values were copied into this report.

Limitations: Google's revision API can omit historical revisions; returned text is not a forensic dump of all stored history, hidden content, comments, downloads or downstream copies. Check the owner-visible version-history UI, published links, inherited permissions, Workspace audit/retention settings and the actual configured backup IDs before declaring historical data remediated. Google documents [revision-list incompleteness and native revision deletion limits](https://developers.google.com/workspace/drive/api/guides/manage-revisions).

## Proposed retention and access remediation — NOT executed

Obtain approval for each file's access change or deletion before acting:

1. **Inventory first:** match deployed `SPREADSHEET_ID` and script owner to file IDs. Include current/previous/staging tabs, copied workbooks, shared-folder inheritance, published versions, downloaded XLSX/CSV, email/chat attachments, manual trackers, Trash and third-party backups. Record IDs, owners, recipients, last use, data categories, approved business retention/holds and disposition; avoid duplicating customer data in the inventory itself.
2. **Contain access after approval:** change the public-editable pilot tracker and any similarly exposed operational file to Restricted, remove unnecessary direct/inherited permissions and publishing, and allow only named trusted custodians. Review parent-folder and group membership. Existing downloads/copies are not recalled by changing permissions. Google's [sharing guide](https://support.google.com/docs/answer/2494893) explains inherited access and publishing considerations.
3. **Stop legacy writes after approval:** pause old export triggers. Create a separate blank v3 workbook and preferably separate standalone Google script project, assign restricted staff Viewer access, and validate the new SQL/caller with synthetic data. Do not create the new copy by duplicating the old workbook. Rotate the dedicated export secret during approved cutover if the old project should lose access; stop/revoke unused script access explicitly.
4. **Quarantine necessary history:** keep old files accessible only to the small approved retention/audit group while their business need/holds are reviewed. Warehouse staff receive only the new minimized workbook. Do not copy old PII into new sheets to preserve the old layout. General Sheets revision access cannot be isolated from the file simply by hiding columns/tabs.
5. **Approve disposal:** select the retention period based on the actual operational/audit need, then obtain explicit approval for deletion of specified old file IDs/copies and, separately, permanent Trash removal when appropriate. Do not assume native Google Sheets revisions can be individually deleted: Google does not expose that capability as it does for binary blob revisions. Clearing columns does not erase old versions. Retire the whole old workbook when its retention/holds permit; preserve necessary financial/audit records in their authoritative restricted systems, not this warehouse copy.
6. **Verify and record:** confirm live/previous v3 tabs contain only the new contract; old recipients no longer have access; legacy scripts are stopped; actual cleanup jobs run; and approved disposal is reflected in the inventory. Workspace/Vault holds, retention and provider backups may retain data even after user deletion. Do not claim irreversible erasure without the relevant administrator/provider confirmation. Notify holders of offline copies of their approved handling/disposal requirements.

Suggested working-copy practice: retain the current minimized snapshot and one previous successful minimized snapshot, as the script already does. Review access when staff roles change and review copies at batch closure. When the integration is retired, set an explicit owner-approved retention/disposal date; a stopped timer does not automatically expire Google files. No new Google deletion timer is introduced.

## Safeguards preserved

The Edge Function, server-only key handling, constant-work secret comparison, missing/wrong-secret denial, request/body validation, 2 KB limit, per-isolate token budget, four in-flight RPC slots and redacted responses are unchanged. SQL retains the five-minute global new-snapshot cooldown, nonblocking advisory lock, cached manifest counts, fixed page ordering/250-row cap, idempotent v2 retries, two-hour retrieval expiry, 50,000 rows/dataset bounds, RLS, revoked browser grants, explicit trusted owner and qualified safe search path. The separate owner-only 15-minute Cron cleanup and timeouts are unchanged. These remain subject to the prior real-staging verification gates.

The new v3 field projection changes only stored export payloads and manifests, not the source order/contact data. Full service-role compromise remains broader than the export's scope; that key stays server-side and must not be given to Google or warehouse staff. Existing Google sharing checks, RAW writes, file-scoped OAuth, locking, failure cleanup and atomic publication are retained.

## Local tests and staging acceptance plan

Local tests assert approved email and phone are present at columns 18/19 for both collection and delivery orders, and absent from activity history. They also seed excluded-field sentinels for street/unit/postcode, deposit/balance/activity references, tokens, staff/recipient identities and arbitrary metadata. Tests inspect the actual SQL snapshot rows/pages, including delivery orders, and reject any appearance of excluded sentinels. Numeric-only history fields reject PII disguised as amounts. Unknown activity actions are not exported. Row/manifest shapes match the new 19/7-column headers.

The handover matrix covers thirteen cases: cleared pickup, pending deposit, unpaid positive balance, already fulfilled, cleared delivery, refunded, unknown legacy deposit, inconsistent total, zero balance, not ready, integer-overflow legacy values, missing order code and missing quantity. Source order rows are compared before/after export to prove the copy does not modify live workflow data. Existing lifecycle tests still cover verification, balance payment, payment mismatch/reference checks, readiness, repeated fulfilment and browser-role denial.

Legacy replay tests exercise version-1 and version-2 snapshots with forbidden data, rerun the migration, and confirm start/page deny it without rewriting/deleting its stored payload. Existing v3 snapshot retries still return the identical manifest. Apps Script tests reject missing/old profiles, legacy workbook markers/headers, incomplete copies, wrong sharing, and schema mismatches before publication. Formula-like customer names remain RAW text.

Executed locally: **`npm test` — 41 passed, 0 failed; `npm run lint` — passed; `npm run typecheck` — passed; `git diff --check` — passed.** The final missing-code/quantity cases also passed a subsequent targeted minimization test. No Edge deployment/runtime, real cross-session PostgreSQL contention, live Google writes or real scheduler execution was performed. Those are staging gates, not claims established by local mocks. No dependency or source workflow changes were needed for this minimization work; pre-existing package/config edits were left intact.

Staging steps below require approval before any remote operation:

1. Approve staged SQL/code application, Cron verification and creation of a separate synthetic-data workbook/project. Do not interpret the data-policy approval as deployment approval.
2. Apply the revised SQL to isolated staging as postgres, retaining existing RLS/EXECUTE/owner checks. Confirm legacy snapshots stay version 1 and are denied; do not relabel version-1/version-2 snapshots as version 3. Create new snapshots with the same ID retry/cooldown tests from the prior review. Match metadata version/profile and column order to this report.
3. Seed the full handover matrix with obviously synthetic contact/address/reference sentinels. Test both collection and delivery. Inspect actual REST/Edge page JSON and snapshot tables for exclusion, not merely the displayed Google headers. Verify approved email/phone retain their exact values and no query option unlocks addresses or references.
4. Use a NEW v3 workbook created by the revised script. Confirm its marker/header checks; a legacy workbook or manifest must fail safely. Compare every mapped field, amount, quantity, handover state and timestamp against the synthetic admin order. Test RAW customer names, restricted sharing, stopped/failed pages, retries and atomic replacement. Confirm only minimized previous tabs are retained.
5. Exercise the live admin workflow against synthetic staging orders: unpaid orders cannot be cleared, amounts/references are verified in admin, zero/positive balances behave correctly, already collected orders cannot be collected twice, and delivery and collection remain distinct. Re-run the two-session PostgreSQL and scheduled expiry tests in `database/tests/operations_export_concurrency.md`; local PGlite cannot validate cross-backend contention or actual Cron execution.
6. Verify delivery-address access remains only behind authenticated/allowlisted admin access; the warehouse export includes approved email/phone but cannot retrieve addresses. Review `ADMIN_EMAILS` membership without disclosing credentials. Do not give general warehouse users admin access as a workaround.
7. Review the actual old file IDs, permissions, histories and disposition approvals. Resolve the pilot tracker's public-write access before entering live customer data. Test the new blank workbook on staging before any production cutover, remediation edit or deletion is approved.
8. Only after explicit production approval: pause legacy triggers, apply approved additive SQL/function and caller changes, activate/verify approved cleanup, create the approved fresh production workbook/project, set restricted access and approved secrets, perform an approved initial export, then resume its timer. Re-audit legacy copies separately. No immediate destructive snapshot/file cleanup is bundled into the version migration.

Rollback: stop the new timer, retain the last valid minimized workbook, and fix forward while keeping legacy replay denied and cleanup safeguards active. Do not restore the old full-PII export or relabel legacy files/snapshots to make an old caller work. Source admin workflows remain available. No remote rollback/delete operation is executed by this preparation.
