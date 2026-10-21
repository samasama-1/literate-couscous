# Automatic order workers

Owner-approved setup: 21 October 2026, Asia/Singapore. Scope: existing email and CRM workers only; customer reminders are not enabled by this scheduler.

## Architecture and credentials

Supabase Cron runs two jobs, `samasama-order-email` and `samasama-order-crm`, every five minutes (`*/5 * * * *`). The dispatcher calls only the fixed canonical HTTPS website endpoint. Manual terminal requests using the existing bearer secret remain supported.

Vault secret name: `order_worker_secret`. Its value is the existing Vercel Production `ORDER_WORKER_SECRET`, not the encryption key or a Zoho token. No secret values belong in git, cron command text, screenshots, URLs or support messages. The owner saved the entry; setup corrected its name and removed surrounding whitespace after format validation, without displaying it.

Hosted pg_net transport tables are owned by supabase_admin and may be readable by broader SQL roles. A postgres-issued REVOKE was found not to remove owner-issued PUBLIC grants. For that reason, **the permanent secret is never sent through pg_net**. Instead the postgres-only dispatcher obtains it from Vault internally and computes HMAC-SHA256 over `kind:invocation_uuid:issued_unix_seconds`.

HTTP carries only the invocation UUID, issue time and signature. The website verifies the signature, channel and five-minute age window, then atomically consumes the invocation through a service-only RPC before running any jobs. A used invocation cannot be replayed, even against another website replica. Altered channels/signatures and expired calls fail before database access. The signature is still temporary authentication material: restrict transport/SQL access and do not expose net or Vault through the Data API. It cannot reveal the permanent key, but an actor able to manipulate transport tables could disrupt dispatches; this is not isolation from database administrators.

The dispatcher has a four-minute per-channel cooldown and a transaction advisory lock to avoid duplicate network requests. No database lock is held while Zoho runs. HTTP timeout is 180 seconds, matching the route's configured maximum duration. Existing email delivery claims, uncertain-send quarantine and CRM workflow suppression are unchanged.

## Installation / activation

1. Apply `database/sql/order_worker_schedule.sql` as postgres. It enables pg_net if absent, creates protected invocation state and dispatch/claim functions, and creates missing jobs **paused**. Reapplication preserves existing job activation states.
2. Verify the Vault name and 64-character hex format without selecting the value. Ensure the matching Vercel secret and worker enabled flags are deployed.
3. Deploy the website's signed-request verification before activation.
4. Apply `database/sql/order_worker_schedule_activate.sql` as postgres. It requires a valid Vault entry and both installed jobs; it activates them together.
5. Check HTTP responses and consumed invocation state after an automatic tick. Cron success alone means an asynchronous HTTP call was queued, not that emails were sent.

No email/CRM job backlog should be enabled without review. Setup audit found one sent email job and one sent CRM job, no pending or failed jobs. No real test order or payment is created by scheduling setup.

## Status checks (metadata only)

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('samasama-order-email', 'samasama-order-crm');

SELECT d.kind, d.dispatched_at, d.used_at,
       r.status_code, r.timed_out,
       r.error_msg IS NOT NULL AS transport_error
FROM public.order_worker_dispatches d
LEFT JOIN net._http_response r ON r.id = d.request_id;
```

Successful healthy responses are HTTP 200 with `enabled:true`. `processed:0` is expected with an empty queue. A response with `enabled:false` requires the corresponding Vercel enabled flag/redeployment. A 401 usually means mismatched secrets, invalid signatures, clock differences or the signed-verification code is not deployed. A 409 means the invocation was already used/expired. A 503 means configuration or invocation/queue validation failed. Check job status before retrying uncertain sends.

pg_net responses are transient. The protected dispatch table retains only the latest request ID/timestamps per worker (two rows), never credentials, customer details or provider response bodies. Long-term alerts and end-to-end test orders remain separate checklist items.

## Pause / recover

```sql
SELECT cron.alter_job(jobid, active := false)
FROM cron.job
WHERE jobname IN ('samasama-order-email', 'samasama-order-crm');
```

Pausing stops future ticks; an already accepted worker invocation may still finish. To rotate credentials, pause both jobs, change the server secret and matching Vault value privately, redeploy, then re-enable. Do not change ORDER_EMAIL_LINK_KEY as part of worker-secret rotation.

## Capacity and tests

Each worker currently claims at most three jobs per call, so the theoretical rate is 36 jobs/hour/channel (and lower when serial per-order processing or provider failures intervene). Two jobs every five minutes generate 576 calls/day. Monitor backlog before a public launch; this schedule does not increase queue batch size or claim throughput.

Local tests emulate Cron, Vault and pg_net interfaces in embedded PostgreSQL, checking paused/idempotent installation, grants, cooldown and single-use claims. Node tests verify real HMAC computation, channel binding, signature expiry and rejection before dispatch. Hosted HTTP and cron verification are additionally required; local tests do not prove real multi-session scheduling.

References: https://supabase.com/docs/guides/functions/schedule-functions and https://supabase.com/docs/guides/database/vault.
