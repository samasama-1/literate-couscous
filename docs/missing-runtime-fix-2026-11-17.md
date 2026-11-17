# Fix missing V2 runtime objects

17 November 2026. Marcus confirmed no website traffic/historical submissions; his screenshot showed NULL for the runtime limits table and both runtime/send-guard functions. This is a missing SQL installation, not a service-plan restriction. No remote SQL, settings, sends or deployment were performed while preparing this fix.

## Exact installation

Keep campaigns closed and these settings false during installation: ORDER_RUNTIME_V2, CAMPAIGN_REGISTRATION_V2, CAMPAIGN_CONFIRMATION_RETRIES_ENABLED. Existing order/collection/campaign/discount baseline schemas are still required; no old baseline migration should be reapplied blindly.

1. In the intended Supabase project, open SQL Editor, create a new query, select postgres.
2. Open `database/sql/order_operations_runtime.sql` locally. Copy the complete file, including BEGIN/COMMIT, into the query and run it. This installs the missing runtime tables, indexes, guarded sending RPCs and counters. It preserves order/discount/collection financial functions and does not create a sending schedule. Sending controls start disabled.
3. In another query, run the complete `database/sql/campaign_registration_safety.sql` **after** runtime SQL. Do this even if the current campaign safety file was applied before: its definitions must be last, and reapplication is tested. It preserves issued coupons/original expiry and does not create owner reconfirmation.
4. Run `database/sql/campaign_registration_preflight.sql` and `database/sql/campaign_registration_postcheck.sql`. Required functions must be installed, postgres-owned with safe search paths and service-only execution; anon/authenticated false is correct. The postcheck's private report table must have RLS and no direct browser/service SELECT.
5. Deploy matching application commit b50c5be or a compatible later revision before enabling ORDER_RUNTIME_V2=true and CAMPAIGN_REGISTRATION_V2=true. Keep CAMPAIGN_CONFIRMATION_RETRIES_ENABLED=false for initial controlled tests. Keep CAMPAIGN_EMAIL_PROVIDER=zoho and verify the existing campaign discount installation/issuance control separately.

Run each file as a separate complete query. A Supabase result saying success/no rows is expected for the installation files. If either file errors, stop and retain the error: do not skip statements, rerun older financial migrations or remove the security guards. SQL files are transactional; if an editor/session remains in an aborted transaction, ROLLBACK before retrying the corrected complete file.

## Verify the missing objects

```sql
SELECT
  to_regclass('public.order_runtime_limits') AS runtime_limits,
  to_regprocedure('public.claim_order_jobs_v2(text,integer)') AS runtime_worker,
  to_regprocedure('public.begin_campaign_mail_send(uuid,timestamp with time zone)') AS campaign_send_guard;
```

All three must now contain object names, not NULL.

```sql
SELECT kind, enabled, hourly_limit, reserved_urgent,
       reserved_security, minimum_gap_seconds
FROM public.order_runtime_limits
ORDER BY kind;
```

On first installation expect CRM: false/300/30/0/0 and email: false/40/10/5/60 (columns in query order). These are disabled defaults, not a verified Zoho plan allowance. Reapplication preserves existing configured values. No provider upgrade is required to create these objects.

## What this fixes, and what remains

This resolves the missing table/functions and installs shared paced sending support. It does not enable actual provider budgets, coupon issuance, customer traffic or extra schedules. Those are separate controls. Next, approve/configure conservative limits for controlled owned-inbox testing, verify automatic email/CRM outcomes and then enable campaign retries. No historical data replay/cleanup is needed based on Marcus's report; any unexpected existing sending/review jobs must still be reconciled rather than reset.

Do not set ORDER_RUNTIME_V2=false as a standalone rollback after runtime guards are installed: older direct send markers are deliberately rejected. Keep compatible code/schema and pause sending controls while resolving an issue.

## Local evidence

15 targeted tests passed with outbound network blocked. Added an integration regression that starts with no runtime table, installs current runtime plus campaign safety against existing campaign/discount/collection schemas, reapplies both, checks all preflight functions and private privileges, verifies budgets remain disabled and confirms a new no-consent registration retains its original coupon pointer. Existing runtime tests cover claims, guarded markers, priority budgets, bounded cleanup and metrics. This is local evidence, not confirmation of remote installation or separate PostgreSQL-session contention.
