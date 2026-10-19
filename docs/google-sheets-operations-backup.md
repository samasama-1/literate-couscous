# Daily Google Sheets backup — owner setup

**Pre-deployment approval hold:** read `docs/operations-export-minimization-review.md` and `docs/operations-export-predeployment-review.md` first. Do not apply SQL, activate cron, deploy, or export live data until the migration/test plan and production actions are explicitly approved. The data-minimization policy itself is already approved. The instructions below describe the later authorized setup.

The code is prepared locally. It is **not deployed or scheduled**, and no customer data has been sent to Google by this implementation work.

The flow is: Google Apps Script's daily timer → Supabase Edge Function → fixed database snapshot → private Google Sheet. The website does not need to be online. Supabase and Google must still be available. This is an operational fallback, not a replacement for database backups.

## 1. Prepare Supabase

1. Open your existing Supabase project → **SQL Editor** → **New query**.
2. Open `database/sql/operations_export.sql` from this repository. Copy its entire contents into the query editor and click **Run**. Run this only after `order_fulfilment.sql`, which added the address, balance and collection fields. Do not replace or delete existing tables. This script is safe to rerun.
   After approval, also enable Supabase Cron and separately apply `database/sql/operations_export_schedule.sql` as postgres. It schedules expired snapshot/row cleanup every 15 minutes, with no website or Google dependency. Verify actual scheduled deletion in staging before production; see the pre-deployment review.
3. Generate a new dedicated export password on your own computer:

   ```sh
   openssl rand -hex 32
   ```

   Save the result in your password manager. Do not paste it into this chat, the spreadsheet, Git, or a public website environment variable.
4. In Supabase → **Edge Functions → Secrets**, add:

   | Name | Value |
   | --- | --- |
   | `OPERATIONS_EXPORT_SECRET` | The 64-character password you just generated |

5. Deploy the included `operations-export` function. From the project directory, using the Supabase CLI:

   ```sh
   cd /Users/marcus/AntiGravity/group-buy-app
   supabase login
   supabase link --project-ref YOUR_PROJECT_REFERENCE
   supabase functions deploy operations-export
   ```

   Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) first if that command is unavailable. The project reference is in your Supabase project settings/URL. Select the same project that holds your live orders. Login is interactive; no password needs to be added to this repository.

   The included `supabase/config.toml` disables the default JWT check **only for this function**. The function checks `X-Export-Secret` itself, fails closed if the secret is missing, and exposes only the two export operations. Keep all other functions' authentication settings unchanged. If your existing deployment has its own config, merge this one function's setting rather than replacing that config.
6. Copy the deployed function URL, which should look like:

   `https://YOUR_PROJECT_REFERENCE.supabase.co/functions/v1/operations-export`

   Do not use your website URL. The Google script deliberately accepts only hosted Supabase function URLs. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside the deployed function; **do not copy the service role key into Google**.

## 2. Create a standalone Google script

1. Sign in to the Google account that should own the backup. Ideally use a company-controlled account with two-factor authentication.
2. Open [Google Apps Script](https://script.google.com/home) → **New project**. Name it **SamaSama Operations Backup**. Use a standalone project, not Extensions → Apps Script inside a staff-shared spreadsheet.
3. Replace the default contents of `Code.gs` with the entire contents of `integrations/google-sheets/Code.gs` from this repository.
4. Click **Project Settings** → enable **Show appsscript.json manifest file in editor**. Return to the editor, open that file, and replace it with `integrations/google-sheets/appsscript.json` from this repository. Save both files.
5. The manifest enables **Google Sheets API v4** and **Google Drive API v3** under Services. Drive is used only to inspect this workbook's sharing settings. If Google prompts you to enable these APIs, do so. If using a custom Google Cloud project, enable both APIs there too. See [Google's advanced Sheets service guide](https://developers.google.com/apps-script/advanced/sheets).
6. From the function dropdown, choose **createBackupSpreadsheet** → **Run**. Review Google's permissions and authorize your own script. It creates a NEW **SamaSama Warehouse Backup v3** workbook and stores its ID automatically. Do not copy or reuse a legacy workbook: its history/hidden tabs may retain old personal data. The v3 script rejects missing profile markers or legacy headers, rather than converting old copies. Open the workbook link from the execution log.
7. In the workbook's **Share** dialog, check **General access: Restricted**. Add only the staff who need it, usually as **Viewers**. Do not share the script project with general warehouse staff; script editors can access its credentials.
8. Return to Apps Script → **Project Settings → Script Properties**. Add these two properties. The third was already saved by the create function:

   | Property | Value |
   | --- | --- |
   | `EXPORT_URL` | The deployed Supabase function URL from step 1 |
   | `EXPORT_SECRET` | The same dedicated export password stored in Supabase |
   | `SPREADSHEET_ID` | Already populated automatically; leave it as it is |

   Use the exact names and no extra spaces or surrounding quotes. This script does not need your Zoho credentials, a Google service account, or a Supabase service role key.

The manifest requests `drive.file`, which limits Google file access to files used with this app, instead of account-wide spreadsheet access. Use the workbook created by `createBackupSpreadsheet`; pasting an arbitrary existing workbook ID does not grant this script access to it. This follows [Google's per-file scope guidance](https://developers.google.com/workspace/sheets/api/scopes). If you already authorized an earlier manifest with account-wide Sheets access, update the manifest, remove the old project's Google account connection at [Google Account connections](https://myaccount.google.com/connections), and authorize the revised script again. Do not broaden the manifest to bypass an access error.

## 3. Test before enabling the timer

Running the next function copies the existing orders and activity history into your restricted Google workbook. Check that this is the correct account and workbook first.

1. Choose **runDailyExport** → **Run**.
2. Open the workbook. It should have **Orders**, **Payment & Collection History**, and **Export Status** tabs. Check **Latest result: Success** and a recent **Last successful export** timestamp.
3. Compare synthetic test orders against the admin dashboard: order code, quantity, payment status, deposit verification, remaining balance, clearance and collection/fulfilment timestamps. Confirm email and phone are present at columns 18/19; addresses, transaction references and employee/recipient details are absent for BOTH collection and delivery orders. Use the privacy staging matrix in the minimization review.
4. Make an authorized change to that test order through the admin dashboard, run the export again, and confirm it appears once with the new state. Do not mark a real unpaid order as paid just to test this.
   Allow at least five minutes between manual exports that create new snapshots. Internal retries using the same UUID remain idempotent during cooldown; a newly started manual run uses a new UUID and can receive 429 during cooldown.
5. Optional failure drill: temporarily change only Google's `EXPORT_SECRET` to an incorrect 64-character value, run again, and verify the last successful Orders/History tabs are unchanged while the latest result says Failed. Restore the correct secret and run again.

## 4. Enable the daily run

1. Only after the manual test passes, run **installDailyTrigger** once.
2. Open Apps Script's **Triggers** screen. Confirm one `runDailyExport` time-driven trigger exists. Edit its failure notification setting to **Notify me immediately** if available. Notifications go to the Google account that owns the trigger; no Zoho Mail sender is required.
3. The schedule is approximately **00:30 Singapore time daily**. Google can vary the time around the requested minute. The script reads all data as of the snapshot; it is not limited to the prior calendar day. See [Google's trigger scheduling behaviour](https://developers.google.com/apps-script/guides/triggers/installable).
4. The next day, verify the last success timestamp actually advanced. Trigger installation alone does not prove the connection is working.

Running `installDailyTrigger` again replaces this script's existing export trigger instead of duplicating it. To stop the schedule, run **removeDailyTrigger**. That leaves existing backup data intact. Triggers belong to their creator, so change the owner/setup if that person's Google account is leaving the company. Google failure notifications also cannot report a total Google outage; check freshness before relying on the copy.

## What the workbook shows

- **Orders:** order code, batch ID/product, customer name/email/phone, quantity, fulfilment method, payment status/amounts/verification timestamps, ready/fulfilled/created timestamps and computed handover clearance. No address, transaction reference or staff/recipient identity is exported. Email and phone are approved operational fields; restrict workbook access accordingly.
- **Payment & Collection History:** approved payment/fulfilment actions, order code, time, numeric amounts and fulfilment method. No actor, recipient, transaction reference or arbitrary metadata is exported. This minimized feed is not a full audit ledger; the original audit remains in Supabase/admin.
- **Export Status:** last successful run, snapshot time, row counts, latest attempt/result and snapshot ID. Dates are explicitly labelled **UTC**. Money is labelled **SGD cents**: `21900` means S$219. A blank amount means unknown, not S$0. Deposit due and balance due are requested amounts; use verification/payment timestamps and payment status to tell whether money was received. Refunded orders retain their historical fields, so do not total those as current cash received.

The two data tabs are complete replacements on each successful run. This avoids duplicate rows and reflects deleted orders. One previous minimized successful pair is retained as hidden tabs for rollback inside the NEW v3 workbook. A version-1 or version-2 snapshot is rejected by both SQL and the Google caller; the script never relabels older stored data as minimized. If a run fails, both current tabs remain from the same previous success. Data tabs change their internal tab IDs during publication, so bookmark the workbook itself rather than a specific `gid` or depend on formulas linked to those tab IDs.

Use the authenticated website for payment/collection changes and any specifically justified delivery-address lookup. The warehouse export secret cannot retrieve those conditional fields. A separate dispatch export is not enabled. Use the website for payment/collection changes. Editing exported rows does not sync changes back and those edits will disappear at the next successful export. During an outage, use a **separate manual incident log** with order code, time, staff member and action; reconcile it against the live dashboard after recovery to avoid double collection. A daily copy can miss up to a day's transactions, or more after failed runs; check freshness before handing over stock.

## Security, retention and limits

- The export key can read the operational customer/payment/collection copy, but cannot call the app's order-update operations. Treat it as confidential. Rotate it in both Supabase secrets and Google's Script Properties if exposed.
- Browser database roles cannot read the snapshot tables or execute export RPCs. Only the service role inside Supabase can do so. Token hashes, payment links, Zoho credentials, and arbitrary activity metadata are excluded.
- Before requesting customer data and again before publication, the script checks sharing permissions and refuses public/anyone or domain-wide access. If the sharing check fails, the export stops. Named users/groups are allowed; you must still manage group membership and account access. This is a point-in-time check: it cannot prevent someone sharing the workbook later or remove data already in it. Changing sharing during a run may expose hidden staging rows; keep permission changes under the backup owner's control.
- Spreadsheet values are sent with `RAW` input handling to prevent formula injection. Staff should remain Viewers to prevent accidental changes. Hidden previous/staging tabs are **not** a privacy boundary: anyone who can access the workbook may access that data too.
- Snapshot pages expire after two hours. The separately approved Cron job deletes expired database snapshots/rows every 15 minutes; start-time cleanup remains a fallback. Outages, skipped/failed cleanup jobs or timeouts can extend retention and require monitoring. Failed staging sheets are removed immediately on a best-effort basis and again at the beginning of the next run if needed. Successful publication retains one previous pair and removes the older pair. Google may separately retain version history under your Workspace policies. Revoking the export key does not erase copies already in Google.
- The script supports up to **50,000 orders and 50,000 history rows per snapshot** and stops before publishing if those limits or its safe runtime are reached. The database also checks counts before creating the snapshot and rechecks captured counts to cover concurrent inserts, rolling back an oversized snapshot. Runtime limits are a second constraint and could be reached with fewer rows. Larger datasets need a resumable worker or a different backup format. Google quotas may also require adjustment. No production-volume capacity has been verified.
- Data is staged completely before one atomic Sheets API request publishes both tabs and their success marker. Failed writes preserve the prior published copy. Google documents [batch update atomicity here](https://developers.google.com/workspace/sheets/api/guides/batchupdate).
- No timer, real email notification, deployment or live customer export is performed by adding these files to Git. Local automated tests cover permissions, token exclusion, snapshot stability/paging/expiry, authentication, safe cell input and failed-run preservation. A manual deployed test remains necessary.

## If it fails

For the generic `Operations export failed` error, add the optional `integrations/google-sheets/Diagnostics.gs` as a separate **Diagnostics** script file in the same Apps Script project. Run `checkExportSetup` and inspect its execution log. It checks settings, advanced services, workbook access/sharing/profile and function authentication without creating a snapshot or writing/deleting any Sheet data. Only fixed check labels and HTTP status codes are logged; do not add raw provider errors, properties or headers. An intentional HTTP 400 / `Invalid request` means the authenticated probe reached the current handler and stopped before SQL. A passing preflight does NOT verify SQL, page export, Google writes or the scheduler.

If preflight passes but the export still fails, replace the existing **Code.gs** content with the latest local `integrations/google-sheets/Code.gs` (do not add a second copy). Keep Script Properties, Diagnostics and the manifest unchanged. On your next authorized manual `runDailyExport`, errors and Export Status report only fixed stage/detail codes:

- `START_SNAPSHOT / HTTP_503`: the function could not create/read the database snapshot. Check that the latest SQL and required tables exist in the same project, service-role RPC permissions and function configuration. This code alone does not prove a missing migration.
- `START_SNAPSHOT / HTTP_429`: cooldown/busy; wait at least five minutes after the last snapshot attempt before retrying. Do not repeatedly click Run or disable safeguards.
- `SNAPSHOT_VALIDATION / SCHEMA_MISMATCH`: SQL returned an incompatible snapshot contract; review the v3 migration before applying anything.
- `ORDERS_FETCH` or `HISTORY_FETCH` with `HTTP_503`: database page retrieval failed; snapshot expiry is one possible cause.
- `ORDERS_WRITE`, `HISTORY_WRITE`, `STATUS_WRITE` or `PUBLISH` with `CHECK_REQUIRED`: inspect Google edit access, storage and quotas; provider error text is deliberately hidden.
- `INVALID_JSON`: function returned an unexpected successful response. No body is logged.
- `CHECK_REQUIRED` means an unclassified exception at the named stage, not a confirmed provider cause. Share only this stage/detail code for troubleshooting.

Updating this local caller does not deploy the function or apply SQL. A full run still creates a temporary database snapshot and writes the backup workbook; the setup preflight remains read-only.

Deploying an Edge Function does not apply the SQL script. If preflight passes, check whether the latest `operations_export.sql` was applied to the same Supabase project and whether the schema/profile and column contract match; do not run migrations or activate production changes without the required approval.

1. Check **Apps Script → Executions** and **Export Status**. Errors deliberately omit customer details and credential values.
2. Check all three Script Properties, the Supabase function deployment and secret, and that the SQL migration completed in the same project. Check **Share → General access: Restricted** and that the script's Google Drive API service is enabled.
3. Check Supabase Edge Function availability/logs and Google quotas. The function returns generic 401 for a wrong export key and 503 for configuration/database errors. Never paste secret headers or customer response payloads into shared logs.
4. Correct the issue and run **runDailyExport** again. Do not delete your last successful tabs to fix a failed export.
