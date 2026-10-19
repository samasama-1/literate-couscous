# Operations export: pre-deployment review and approval plan

Status: local changes prepared; **no Supabase SQL, scheduler or deployment applied**. This supersedes the earlier security review for the integration. Existing package.json/package-lock.json edits were present at the start of this review and were not changed here.

**Data-policy update:** the approved warehouse_v3 projection and fresh-workbook migration are now implemented locally. See `docs/operations-export-minimization-review.md` for the current field contract, read-only Drive findings and staging plan. Earlier review results below are historical; deployment remains approval-controlled.

## Findings and disposition

| Finding | Severity / disposition |
| --- | --- |
| Expired snapshot PII persisted until another export ran | Medium. Prepared owner-only cleanup and a separate Supabase Cron SQL script, running every 15 minutes independently of the website and Google. Requires approval, Cron enablement, and staging verification. |
| Snapshot starts queued on one blocking advisory lock and could repeatedly copy the entire dataset | Medium. Replaced with a nonblocking transaction advisory lock; added a global five-minute cooldown for NEW snapshots using one singleton control row. Existing-ID retries bypass cooldown. Cached manifest counts avoid repeated scans of exported rows on retries. |
| SECURITY DEFINER owner depended on who originally created each function; application schema was in search_path | Medium hardening. Pin tables/functions to trusted `postgres`; use `pg_catalog,pg_temp` and fully qualify every application relation. Revoke PUBLIC/anon/authenticated EXECUTE. Cleanup also denies service_role EXECUTE and is absent from the HTTP action allowlist. |
| No distributed HTTP traffic limit | Residual availability risk. Added per-isolate token budget (burst 20, refill 5/sec) and four in-flight RPC slots after authentication. No database counters or rate-limit scans are added to page requests. This is not an account-wide or IP-based limit and cannot stop an anonymous flood reaching/billing the Edge runtime. |
| Unexpected RPC exceptions were reported as malformed requests | Low. Exceptions now return generic 503; known busy/cooldown signals return 429 + Retry-After. Raw database error bodies never reach the caller. |
| Export copies substantial personal information | Resolved locally by approved warehouse_v3 projection; legacy-copy access remediation and staging verification remain approval-controlled. |

The other protections remain: secret authentication before body/database handling, fail-closed configuration, a 2 KB body bound, UUID/cursor validation, parameterized allowlisted RPCs, immutable snapshots, two-hour retrieval expiry, bounded indexed pages, rerunnable SQL, RLS and revoked browser grants, RAW spreadsheet values, restricted-sharing checks, and atomic publication preserving the previous complete copy.

## Cleanup and retention

`database/sql/operations_export.sql` now defines `public.cleanup_operations_exports()`, owned by postgres and executable only by its owner. It takes the same advisory lock using `pg_try_advisory_xact_lock`; if snapshot creation holds it, it skips that run rather than queues behind it. It deletes only expired parents; the existing `ON DELETE CASCADE` removes their rows. An expiry index supports finding old parents. Active snapshots are preserved. The existing start-time cleanup remains a fallback.

`database/sql/operations_export_schedule.sql` is a **separate approval-controlled activation step**. It requires an already enabled `pg_cron`, verifies execution as postgres, and schedules one named job every 15 minutes. Reapplying as the same owner updates that job. The job contains SQL only, no keys or HTTP requests, and uses a two-second lock timeout and 45-second statement timeout.

Under healthy operation, expired data is logically deleted on the next quarter-hour run, typically within 15 minutes after the two-hour expiry. Skips, outages or failed jobs can extend retention. A timeout rolls back the deletion, so repeated timeouts require investigation, not an assertion that cleanup succeeded. Test worst-case synthetic volume before production; if 45 seconds is insufficient, use bounded row deletion batches before rollout. PostgreSQL storage/WAL/backups and Google version history have separate physical retention; SQL DELETE is not secure media erasure.

Supabase exposes scheduler status through `cron.job_run_details`; configure an external owner alert for failed/missing runs and expired backlog before rollout. This repository does not currently have an alert channel to activate. See [Supabase Cron](https://supabase.com/docs/guides/cron) for job monitoring.

Read-only verification after approval:

```sql
SELECT jobid,jobname,schedule,username,active
FROM cron.job WHERE jobname='operations-export-expiry-cleanup';
SELECT r.jobid,r.status,r.start_time,r.end_time,r.return_message
FROM cron.job_run_details r JOIN cron.job j USING(jobid)
WHERE j.jobname='operations-export-expiry-cleanup'
ORDER BY r.start_time DESC LIMIT 10;
SELECT count(*) AS expired_snapshots, min(expires_at) AS oldest_expiry
FROM public.operations_export_snapshots WHERE expires_at<=now();
```

## Load, locks and retries

- **New snapshots:** a fail-fast global advisory lock serializes creation. The cooldown reads a single primary-key control row BEFORE source counts/materialization. It updates only on successful creation, transactionally; failed creations roll back. The 12-active-snapshot cap and 50,000 rows per dataset still apply. Cooldown/lock requests return generic 429 responses rather than waiting on a busy backend.
- **Same-ID retries:** return the same immutable snapshot and cached manifest within the two-hour lifetime, even during cooldown. A retry arriving while that snapshot is still being created may get 429 and should retry using the SAME ID. After expiry, that ID is no longer a guaranteed historical retry; treat it as expired and start a new export. This is the existing retention-bounded idempotency model, not permanent idempotency.
- **Pages:** no global advisory lock or new rate-limit SQL. The existing primary key `(snapshot_id,kind,ordinal)` supports up to 250 rows per page. Edge token limits are local to an isolate. Anyone holding the export secret can still download the operational copy and can spread reads across isolates. If risk/traffic warrants it, put a supported gateway/WAF in front of the Supabase hostname, limit requests there, and restrict bypass of that gateway. Cloudflare rules for `samasama.sg` alone do not protect the separate Supabase URL.
- **Cleanup:** shares the creation lock but skips contention. Cascading deletes still take ordinary row/table locks and generate WAL; timeout and staging-volume checks remain necessary. A page racing deletion of an already expired snapshot may fail/return incomplete rows; the caller's count checks prevent publishing a partial workbook. Active snapshots are not deleted by cleanup.
- **Google caller:** ScriptLock prevents overlaps inside one Apps Script project. Its request retries reuse the same start UUID and page cursor, and stop after three short backoffs. It does not wait five minutes inside Google's six-minute execution window. Manual exports started within five minutes of a prior successful NEW snapshot can fail safely; wait five minutes before rerunning. Multiple separate script projects are not coordinated by ScriptLock, but database cooldown/creation locking still applies.

## Ownership, RLS and privilege verification

Using postgres as the definer owner is deliberate: it is a trusted administrator, not a browser role, and these fixed SQL functions need to read protected orders. This is not a newly created least-privilege DB role; compromise of the existing service-role key would still have broad database power. Keep that key exclusively in trusted server environments. Function execution remains narrowly granted. PostgreSQL documents that replacement preserves an existing function owner, hence the explicit `ALTER ... OWNER`: [SECURITY DEFINER guidance](https://www.postgresql.org/docs/current/sql-createfunction.html).

The local PostgreSQL tests verify owner, SECURITY DEFINER, exact search_path, actual denied calls as anon/authenticated, service-role access to start, and denied service-role cleanup. A temporary `orders` table cannot shadow the qualified real table.

Before deployment, inspect ALL overloads in the actual project (not just the local test fixture), owners, ACLs and role memberships. Unexpected overloads/grants or a publicly assumable service role are blockers:

```sql
SELECT p.oid::regprocedure AS signature, r.rolname AS owner,
       p.prosecdef,p.proconfig,p.proacl,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS user_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
WHERE n.nspname='public' AND p.proname IN
 ('start_operations_export','page_operations_export','cleanup_operations_exports');
SELECT c.relname,c.relrowsecurity,c.relacl
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('operations_export_snapshots','operations_export_rows','operations_export_control');
SELECT roleid::regrole,member::regrole FROM pg_catalog.pg_auth_members
WHERE roleid IN ('postgres'::regrole,'service_role'::regrole);
```

Expected: exactly the reviewed signatures; all owned by postgres with `search_path=pg_catalog, pg_temp`; anon/user EXECUTE false; service EXECUTE true only for start/page; RLS enabled. No new permissive browser policies are created. `operations_export_control` has no browser/service direct grants. Existing snapshot table service-role grants are retained.

## Secrets and caller contract

Only production caller found: `integrations/google-sheets/Code.gs`. Other references are tests, SQL and documentation; no website/browser code invokes this endpoint.

1. Apps Script's `EXPORT_SECRET` Script Property contains the same dedicated 64-character hex secret as Supabase's `OPERATIONS_EXPORT_SECRET` environment secret.
2. Google sends a server-to-server HTTPS POST to `https://<project>.supabase.co/functions/v1/operations-export` with `X-Export-Secret`. It does NOT send Supabase's service key or a user JWT. Redirects are disabled.
3. `supabase/config.toml` disables Supabase JWT verification for this function only. The handler's shared-secret check replaces it; disabling JWT is not unauthenticated access. No CORS access is granted to browsers.
4. Body `{action:"start",id:"<UUID>"}` returns `{id,captured_at,expires_at,orders,activity}`. Body `{action:"page",id:"<same UUID>",kind:"orders"|"activity",after:0}` returns ordered `{rows,next}`. Each row is an allowlisted JSON array matching the existing Sheet headers. No credentials are returned.
5. `index.ts` obtains `SUPABASE_SERVICE_ROLE_KEY` only from `Deno.env`, and uses it only for its server-side Supabase REST RPC calls. It is not supplied to the factory, caller, workbook, docs or responses. The export secret is checked locally and never forwarded into SQL. There are no secret/request logging calls in the Edge files. Static errors redact provider/SQL diagnostic bodies; only two known busy signals are forwarded internally.
6. Google stages the arrays as RAW values, validates page/count completeness and atomically publishes both tabs. It has per-file OAuth, no Mail scope, and denies broad public/domain sharing. Script editors and named group members still need human access review. Export access is sensitive even though it cannot modify business orders.

Reviewed files contain environment/property NAMES and test-generated values, not live credentials. A scoped check against configured local secret values found no matches. This does not establish that historical repository commits, deployed provider logs or existing Google grants are clean. Do not paste secrets in commands, SQL, cron commands, commits or screenshots. Rotate any credential previously disclosed outside its intended secret store.

## Approved personal-data policy

The warehouse_v3 SQL now includes only order code, product/batch/quantity, customer name/email/phone, payment status/amounts and relevant operational timestamps/clearance. Approved email and phone are included for operational contact; address fields are omitted for ALL orders, including deliveries. Justified delivery-address lookups stay behind the existing authenticated admin allowlist; no dispatch feed or conditional unlock is exposed through the warehouse key. Transaction references, actor/recipient identities, tokens and arbitrary metadata are excluded. See the minimization report for the exact 19/7-column contract and conditional access controls.

Old snapshots retain schema version 1 or 2 and are denied by start/page RPCs; they are not rewritten or immediately deleted. A NEW v3 workbook and marker/profile checks prevent carrying legacy current/previous tabs into the new workbook. Existing old files/revisions still require the separately approved remediation plan; hiding/deleting columns does not sanitize version history.

## Tests and remaining release gates

Automated tests cover missing/wrong secrets, malformed/oversized payloads, unsupported actions, invalid pagination, snapshot expiry and cascaded cleanup without a new export, same-ID retries, singleton cooldown, owner/search_path/EXECUTE, actual browser-role denial, temporary-table shadowing, oversized rollback, concurrent in-flight Edge backpressure, token refill, thrown/returned RPC failures, redacted errors and retry signals. Existing Google publication/security tests remain.

Local results: **38 tests passed**, lint and application TypeScript checks passed. The Edge entrypoint also passed a separate TypeScript check with ambient Deno declarations; this is not a Deno runtime/deployment test. The schedule script's missing-Cron prerequisite was tested in the disposable PostgreSQL fixture. No SQL was applied to the remote Supabase project.

PGlite has a single PostgreSQL backend: overlapping promise tests verify idempotency but do **not** prove cross-backend lock contention. Neither real Supabase Cron nor Google's OAuth/API behaviour was executed here. Run the two-session and scheduler tests in `database/tests/operations_export_concurrency.md` on isolated staging after approval. Do not interpret mock API tests as a live integration pass.

## Approval-controlled migration plan

1. **Review/approve first:** revised SQL/Edge changes, cron activation, new-workbook cutover and staging test scope. The minimization policy is already approved; production actions are not. No SQL or deployment is applied by this review.
2. Record current policies/ACLs/functions and cron state. Pause the Google export trigger. Use staging first; retain the last successful workbook. The main script is rerunnable but must be applied as the trusted postgres administrator. Existing snapshot IDs/data survive; only nullable cached count columns, control state/index and cleanup function are added. Existing full-PII snapshots remain until expiry/cleanup.
3. After approval, apply revised `operations_export.sql` in staging. Enable Supabase Cron through the dashboard, then separately apply `operations_export_schedule.sql`. Verify job owner/schedule and the catalog checks above. Unknown overloads/grants are blockers.
4. Deploy the revised Edge Function to staging only after approved SQL is present. Keep its dedicated secret and per-function `verify_jwt=false`; do not disable JWT globally. Test missing/wrong secrets, actual anon/user RPC denial, same-ID retries, new-ID cooldown, two sessions, real scheduled cleanup with no exports, and maximum synthetic volume. Confirm error logs omit headers/customer data.
5. Perform one explicitly approved export into a restricted staging workbook using synthetic data. Confirm manifest counts, sharing refusal and preservation of prior published tabs on failure. Confirm authentication and Google per-file OAuth against real APIs.
6. Set up failed/missing cleanup/backlog alerts and verify the approved warehouse_v3 profile. Follow the new-workbook and legacy-copy remediation plan; do not reuse the old workbook or delete old data without approval.
7. Only after staging passes and you approve production: apply the SQL and separate cron activation, deploy the matching function, verify ACLs/authentication, perform one approved restricted-workbook export, then resume the Google timer. Monitor cleanup and export freshness at least through their first scheduled runs.

Rollback: pause the Google timer and disable the export function/rotate its secret if data access is suspect. Keep the owner-only cleanup schedule active to remove residual expired PII. If cron itself must be stopped, use the Dashboard to disable only `operations-export-expiry-cleanup`, record the retention impact, and arrange approved manual cleanup. Do not drop order tables or clear live orders. Do not blindly revert the SQL after changing clients: use a reviewed follow-up migration preserving revoked browser grants and SECURITY DEFINER protections.
