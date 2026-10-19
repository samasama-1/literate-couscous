# Two-session PostgreSQL staging test (approval required before running remotely)

Use an isolated staging database with the revised export SQL installed. PGlite
tests serialize operations in one backend and cannot prove cross-backend lock
behaviour. These steps must pass before enabling the production timer.

1. As postgres in session A, hold the export lock:

   ```sql
   BEGIN;
   SELECT pg_advisory_xact_lock(817430122);
   ```

2. In independent session B, calls must return promptly, rather than wait:

   ```sql
   SELECT public.start_operations_export(gen_random_uuid()); -- EXPORT_BUSY
   SELECT public.cleanup_operations_exports(); -- 0, skipped while locked
   ```

3. In A, `ROLLBACK;`. In B, start an export with a saved UUID. Repeat that same
   UUID in both sessions: both manifests should agree, with one snapshot and no
   duplicated rows. A different UUID within five minutes must fail with
   `EXPORT_COOLDOWN`. Repeat after five minutes: a new UUID should succeed.
4. Create an expired test snapshot in staging, then invoke cleanup from session
   B while exports/page reads run in A. Confirm active snapshots survive, expired
   parents/rows disappear, retries retain a consistent manifest and page rows are
   ordered. Pages for expired IDs must fail even if cron has not deleted them.
5. Enable the separately reviewed cron script in staging. With all export timers
   stopped, insert a dummy expired snapshot and child row (no real customer data).
   Wait for the next quarter-hour run and verify BOTH are deleted and
   `cron.job_run_details` records success. Repeat with maximum supported synthetic
   snapshots; measure cleanup time and table lock waits against the 45-second
   statement/2-second lock timeouts. If cleanup times out repeatedly, stop rollout
   and implement bounded deletion batches rather than raising limits blindly.
6. Repeat an RPC call with the staging anonymous key and an authenticated user
   JWT: both must be denied. Only the service role can start/page; even it must
   not have EXECUTE on cleanup. Verify with the catalog queries in the review.

Do not run these fixtures or reset cooldown state in production.
