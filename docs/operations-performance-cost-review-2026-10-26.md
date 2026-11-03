# SamaSama operations: performance, capacity and cost review

26 October 2026 · prepared locally for review · **not a deployment approval**

Named-collector follow-up: [the local replacement](named-collector-rollout.md) retires pickup codes in favor of a one-use 24-hour owner form and original-photo-ID handover. The older pickup-code findings below are historical; other launch gates remain. No production changes were made.

Current action tracking: [public-launch checklist](website-launch-checklist.md) and [email draft register](customer-email-drafts.md). Marcus will dictate exact email copy and collection-reminder offsets later; prepare drafts first and keep new unapproved send flows inactive.

The current mailbox is the main throughput constraint. Database work can be kept small and predictable at the requested order volumes, but low average traffic does not make a simultaneous verification-code or payment-email wave safe. Use an approved transactional sender for time-sensitive automation and a consent-aware campaign service for routine updates before launching those features at scale.

The owner confirmed Vercel Hobby and Supabase Free today, with upgrades to the next tiers at launch, and Zoho Mail “Standard”. Budget below assumes **Vercel Pro, one Supabase Pro Micro project, and four weekly updates per customer across 30 days**. Zoho's exact subscribed SKU, account-specific limits, actual traffic, and billing dashboards have not been inspected. Production settings, SQL, schedules, customer emails and Google Sheets were not changed.

## Owner decisions and clarification — 26 October follow-up

- **Commercial policy:** owner approves the currently proposed policy for now, subject to monitoring and later revision. Preserve versioned acceptance; later material changes require an explicit new policy and appropriate notice, rather than silently changing accepted historic terms. This approval does not authorize automatic forfeiture, cancellation, resale or an unspecified refund calculation, or production deployment.
- **Demand:** owner expects no more than approximately 50 new orders/hour; this is a planning estimate, not a hard traffic guarantee. Fifty order confirmations/hour alone exceeds the disabled draft lifecycle ceiling of 35/hour, before existing customers' payment emails, interest confirmations, OTPs or manual mailbox traffic.
- **Email cadence — confirmed:** routine progress updates are weekly (days 7, 14, 21 and 28 in the 30-day planning model). Overdue collection reminders follow the individual order's collection dates and applicable deadlines; the weekly cadence does not apply to these reminders. Exact reminder offsets, rescheduling rules and interactions with storage deadlines still need to be specified before activation. Immediate security/payment/authorization messages are unchanged. The model falls from 19 to 17 emails/order (about 11%); 2,000 orders still average 47.2 emails/hour. Only local planning assumptions were changed; no live sender or cadence was activated.
- **Collector retention — confirmed:** keep active collector information until collection/cancellation, then for 14 days, with cleanup eligibility no earlier than ready+14 days. Thus eligibility is the later of ready+14 days and collection/cancellation+14 days. Uncollected active orders remain retained. Preserve minimal audit/financial evidence separately; this approval does not authorize production deletion without the separately approved rollout.
- **Failed email jobs:** retain unresolved jobs until admins resolve or cancel them. Terminal status must be explicit and provider uncertainty reconciled before any retry. Proposed terminal cleanup removes unnecessary recipient/content/link payloads after an approved grace period, retaining minimal outcome/idempotency/audit records. The grace period remains to be confirmed; do not delete rows merely to clear a backlog.
- **Operational backup — confirmed:** retain only the latest successful emergency spreadsheet snapshot. A new export must stage and validate completely before replacing the existing successful copy. If an export fails, preserve the last successful copy regardless of age and report staleness. This is a current-state emergency copy, not point-in-time recovery. Spreadsheet revision history, trash, temporary Supabase export snapshots and provider database backups have separate retention controls; this decision does not authorize purging them or deleting production data.
- **Ownership:** existing authorized admins handle failures, discrepancies, collection exceptions and system alerts. Apply least-privilege admin access; designate an on-duty admin so an alert is acknowledged rather than assumed handled by the group. No personal contact details were added to reporting.

The baseline tables below now use the confirmed weekly progress cadence. The approved decisions above supersede earlier statements that commercial-policy approval is wholly outstanding; implementation, retention details, security gates, test-send approval and production approval remain separate.

## 1. What is prepared, and what remains blocked

This package prepares the performance foundation. It does not finish the collection-security programme. See the owner-decision addendum above for commercial-policy approval and remaining clarifications.

| Area | Local implementation | Activation condition / limitation |
|---|---|---|
| Queue | Indexed bounded claims; security, lifecycle and routine lanes; protected send capacity; independent preparation-failure counter | `ORDER_RUNTIME_V2` is opt-in; database provider controls initially disabled |
| Provider pacing | Database-serialized shared mailbox budget for order emails and interest confirmations; rolling minute buckets | The 40/hour draft budget is an internal ceiling, **not** a Zoho entitlement or approval for automated bulk mail |
| Reads and transactions | At most ten lease-checked contexts per call, one sender preparation per invocation, final state recheck and revision-guarded send marker | No provider call is made while holding database locks; external delivery cannot be part of a database transaction |
| Dashboard | 50-row seek pagination with one look-ahead row; indexed searches; only page-related product/batch reads; latest 100 audit entries | Complete audit history is retained; dashboard summaries now explicitly describe the current page |
| Monitoring | Admin-only Operations health; fixed queue counters, oldest queued/due times, worker errors and database API latency histogram | Manual refresh, no polling; proposed alerts are not connected to a notification service |
| Cleanup | Indexed TTL cleanup, at most 500 rows per table per run; review-only paused 15-minute schedule | Does not delete customer, financial, audit or failed-job records; approved collector-retention rule; terminal-job grace period and cleanup rollout still pending |
| Scheduler | Separate, paused one-minute V2 schedules with existing Vault-backed, expiring, single-use signatures | Existing five-minute schedules must be paused at cutover; do not run both versions |

**Mandatory remaining launch gates:** staging acceptance of the named-collector one-use owner-link and photo-ID handover replacement; notifications on authorization changes; confirmed bounce/non-delivery fee suspension; independent fee/delegation kill switches; bank-reconciled collection safeguards; approved retention/redaction and commercial terms. The [security review](collection-hardening-review-2026-10-26.md) remains authoritative, including its reproduced vulnerabilities. These gaps were not silently marked resolved by this package.

OTP, collector-notification, reminder and weekly-update producers/templates are **forecast work, not implemented send flows**. The worker rejects unsupported email events rather than sending the wrong template. Do not enqueue these event names in production yet.

An additional integration gate: shared pacing can leave interest confirmations queued when capacity is unavailable. The existing interest flow does not have a general scheduled drain in this package. Before enabling V2 with campaign mail, add a bounded, lease-safe retry consumer for known-unsent queued confirmations, include its backlog in monitoring, and test automatic completion. Do not release this migration/flag as a standalone production fix.

## 2. Query bounds and contention

Files primarily involved:

- `database/sql/order_operations_runtime.sql`: additive schema, indexes, service-only RPCs, pacing, counters and bounded cleanup.
- `database/sql/order_worker_schedule_v2.sql`, `database/sql/order_runtime_cleanup_schedule.sql`: paused schedules only.
- `src/lib/order-integrations/worker.ts`: V2 contexts, priorities, send guards, instrumentation and runtime budget.
- `src/lib/campaigns/email.ts`, `src/lib/mail/delivery.ts`: shared capacity guard; known-unsent deferrals remain queued.
- `src/app/admin/page.tsx`, `src/app/admin/orders/[id]/page.tsx`: bounded lists and history.
- `src/app/admin/operations/page.tsx`, `src/lib/operations/telemetry.ts`, `src/lib/orders/db.ts`: authenticated reporting and safe telemetry.

The inherited campaign request limiter performed TTL deletion on customer calls. Its replacement performs a validated primary-key upsert only. Expired rows are removed by a separate maintenance worker. Cutoffs use indexable timestamps; a volatile clock evaluated for each stored row is avoided in range predicates.

Claims examine at most **150 candidates in each of four lane/priority groups**, then select at most ten jobs. Each group has fixed kind/lane/priority keys followed by due time and ID, so a large population of future jobs does not require scanning earlier priority ranges. Active/review and predecessor checks use indexed order/lane lookups. Recovery touches at most 20 expired leases. A try-advisory lock prevents simultaneous claimers doing the same work. Uncertain sends stay in review.

FIFO is preserved within an order/lane. Security has its own lane so a routine update cannot hold up a fresh verification message. Future reminder producers must atomically cancel obsolete queued reminders on payment/refund/fulfilment; they must not leave a stale reminder blocking later lifecycle mail. The 600-candidate fence may defer eligible jobs behind many blocked predecessors. Alert and resolve those orders; never bypass review to increase throughput.

Only the short send-authorization transaction locks the job, order version and one provider-control row. Provider calls happen after commit. The control row intentionally serializes quota decisions; at tens or hundreds of sends/hour it is preferable to duplicate sends or exceeded limits. Queue counts use eight shards and stable update ordering, avoiding a single registration counter hot spot. Separate sessions must still test contention and deadlocks in staging; PGlite is a serialized local fixture.

The default mail gap of 60 seconds limits a claim to one message, avoiding repeated ten-job claim/defer churn. An invocation stops starting new jobs after 60 seconds and releases untouched claims. Database API calls have a ten-second timeout; provider preparation/sends retain existing finite timeouts. The route allows 180 seconds so an in-flight operation can finish conservatively. These limits are not achieved by skipping verification.

Dashboard order lists use indexed `(created_at,id)` seek pagination, no exact total count or offset. Search requires at least three contiguous letters/digits and uses trigram indexes. Primary-key product/batch reads are capped at 50 IDs. New indexes cost disk and write amplification; inspect real staging plans before removing redundant indexes. **Do not drop audit/security constraints or disable RLS for performance.**

One-time index builds and counter initialization necessarily read existing data and acquire maintenance locks. The migration has 5-second lock and 45-second statement limits; it should abort safely rather than be forced through a busy checkout period. For much larger histories, split index creation into a separately reviewed concurrent-index migration and bootstrap during an approved pause.

## 3. Lifecycle workload assumptions

Per order/customer for a 30-day planning cycle:

| Work | Budget | Conditions |
|---|---:|---|
| Confirmation/payment/readiness emails | 5 | Order received, deposit receipt, balance request, balance receipt, ready notice |
| Owner verification codes | 2 | Assumed issue/reissue budget, not a maximum security policy |
| Collector authorization notice | 1 | More changes add notices and verification jobs |
| Conditional reminders | 5 | Deposit, balance, uncollected, pre-free-deadline, pre-review; timely customers receive fewer |
| Routine progress updates | 4 | Days 7, 14, 21, 28; merge/suppress redundant lifecycle updates where approved |
| **Email total** | **17** | Includes conditional work conservatively; retries, bounces and extra OTPs add demand |
| CRM sync jobs | 6 | Typical creation, deposit, balance request/payment, ready and fulfilled transitions |
| Customer/staff server invocations | 25 | Planning allowance, excluding workers, crawlers, assets and general browsing |
| Foreground database API calls | 48 | Planning allowance described below |

The five-reminder budget does not approve new reminder timings. Previously agreed deposit/balance reminder timings remain 24 hours/3 days. The latest instruction anchors collection reminders to each order's collection dates, superseding a generic three-days-after-readiness assumption; exact offsets and rescheduling behavior require specification. Pre-deadline warnings must still precede applicable fee/review deadlines. A changed appointment must not silently waive fees or reset accepted storage terms. Four weekly routine updates require appropriate preferences, unsubscribe handling and an approved sending channel. Do not reclassify marketing as security mail to bypass reserves.

The 48 foreground-call allowance is: registration 3; two order lookups 6; two balance views 6; two management views 8; two OTP issue/verify cycles 12; collector change 3; five staff operations with authorization plus mutation 10. These are estimates for the intended hardened flow, not measured counts for unfinished OTP code. Allow at least 10–20% contingency, then replace assumptions with staging measurements.

For the queue, budget roughly **11 row writes per job**: enqueue plus counter, claim plus two counter transitions, send marker plus two quota writes, finish plus two counter transitions. Thus 23 jobs/order imply approximately 253 queue/quota/counter writes plus about 20 core order/audit/authorization writes. Triggers, WAL, indexes, retries and future consent events can add work. One metrics upsert occurs per scheduled worker invocation. These are capacity units, not a Supabase per-query invoice.

Successful full batches need three per-job database API calls (final read, guarded marker, completion), one context call per batch, and fixed claim/metrics calls per tick. Ten-job batching amortizes these to roughly 3.3 calls/job when fully occupied. Mailbox one-job pacing is about six calls per occupied tick. Preserve the final state read and send marker even when optimizing.

The database performs indexed row/page reads, not one physical disk read per HTTP request. A context uses a bounded set of primary-key joins; each provider reservation reads at most 61 minute buckets. Queue reporting aggregates exactly 288 counter rows, twelve indexed oldest-row lookups and at most 120 recent metrics rows. Physical cache misses, table/index sizes and WAL must be measured; no exact physical-read count is claimed.

## 4. Capacity scenarios

Reproducible arithmetic is in [operations-capacity-scenarios.json](operations-capacity-scenarios.json), generated by `tools/operations-capacity.mjs`. All cohorts represent **new orders in one 30-day cycle**, not simultaneously active website users.

| Orders | Email jobs | CRM jobs | Average emails/hour | Vercel invocations/month | DB API calls, paced mailbox | Daily-export Edge calls/month |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1,700 | 600 | 2.36 | 88,900 | 186,260 | 120 |
| 500 | 8,500 | 3,000 | 11.81 | 98,900 | 240,100 | 390 |
| 1,000 | 17,000 | 6,000 | 23.61 | 111,400 | 307,400 | 750 |
| 2,000 | 34,000 | 12,000 | 47.22 | 136,400 | 442,000 | 1,470 |

The proposal makes two authenticated once-per-minute worker calls: **86,400/month**, versus 17,280 for two five-minute workers. They run on Vercel; they are **not** Supabase Edge Function invocations. Two fixed database calls per worker tick account for 172,800 monthly API calls in this conservative model. The CRM/mail provider gate can skip dispatches while disabled. Idle-adaptive scheduling is a later optimization; it must not delay OTPs or payments.

Queue/counter/quota writes range from 25,300 to 506,000 across the scenarios, plus core writes from 2,000 to 40,000, and 86,400 metrics writes. With a fully batching future sender, database API calls would be approximately 184,730 / 232,450 / 292,100 / 411,400 respectively. Export row materialization adds around `6N × 30` temporary row inserts over a month for a stable N-order dataset with five activity rows/order; deletion adds comparable work. Growing historical data, larger audit histories, housekeeping, admin refreshes and retry traffic are additional.

### Email bottleneck and burst behaviour

Zoho publishes dynamic external-mail limits of **50–500/hour**, shared across mailbox activity, aliases, delegates and automatic messages, and explicitly says bulk/burst sending is unsupported. The account is not entitled to 500/hour merely because it is paid. The exact current limit must be confirmed with Zoho. [Zoho Mail limits](https://www.zoho.com/mail/help/adminconsole/rates-and-limits.html)

The **disabled** draft budget is 40/hour shared by automated order and interest mail: routine/reminder work may use 30, lifecycle/payment mail up to 35, and security up to 40. The remaining margin does not track manual mail or third-party sends; these may still exhaust the real provider quota. A rolling 61-minute bucket window is deliberately conservative at boundaries.

Illustrative drain time if an entire 17-email lifecycle were queued at once, with no other traffic:

| Orders | Existing 36/hour worker ceiling | Draft 40/hour mailbox with priority reserves | Hypothetical approved 500/hour transactional channel with reserves |
|---:|---:|---:|---:|
| 100 | 47.2 h | 51.8 h | 4.1 h |
| 500 | 236.1 h | 258.9 h | 20.6 h |
| 1,000 | 472.2 h | 517.9 h | 41.1 h |
| 2,000 | 944.4 h | 1,035.7 h | 82.2 h |

This is a conservative fluid model that drains security, lifecycle and lower-priority pools in order, with reserve headroom intentionally unused by lower priorities. Minute pacing and per-order dependencies add delay. It is not an estimate that all messages should actually be sent at once. CRM at the provisional 300/hour cap takes at least 2 / 10 / 20 / 40 hours for those full cohorts; that cap needs verification against the separate CRM edition and API credits.

A simultaneous **order-confirmation-only** wave takes at least 2.9 / 14.3 / 28.6 / 57.1 hours at the draft lifecycle cap of 35/hour. This is unacceptable for a busy launch even where the 30-day average fits. To get one OTP/customer out within ten minutes requires **600 / 3,000 / 6,000 / 12,000 emails/hour**. Even a ten-job-per-minute worker tops out at 600/hour before latency. An approved higher-throughput transactional provider and a dedicated bounded urgent path are pre-launch requirements if that burst is plausible. Raising the database cap alone cannot solve it.

Keep `hello@samasama.sg` for replies/support; assess Zoho's transactional offering or another approved transactional sender, with domain authentication, signed bounce events, provider budgets and reconciliation. Routine campaign updates should use a consent-aware channel. Provider changes require an explicit cutover; never replay old uncertain jobs through a new provider.

## 5. Metrics and operating thresholds

The new authenticated Operations health report shows order queue counts by kind/lane/status, oldest queued and oldest currently due jobs, last-hour runs/sent/deferred/errors and database HTTP latency mean/max/p95 bucket. It performs no automatic polling. Queued count includes future work. An old due job may be held behind a review case. Missing metrics is unknown health, not a green check.

Structured logs contain only fixed event names, durations, counts, status and channel: `operations.worker`, `operations.worker_request`, `operations.action_result` and `operations.metrics_write_failed`. They exclude URLs, headers, tokens, email addresses, provider bodies and query text. Selected registration/collection/payment actions record failed results. This is **not** comprehensive website request tracing or a substitute for SQL execution metrics. Existing infrastructure logs still need the management-link redaction review.

Proposed alerts (not configured remotely):

| Signal | Warn | Critical/action |
|---|---|---|
| Oldest due security mail | >60 seconds | >3 minutes; investigate before codes expire |
| Oldest due payment/lifecycle mail | >5 minutes | >15 minutes |
| Routine mail age | >12 hours | >24 hours; review outdated content rather than blindly replay |
| Review/uncertain sends, confirmed bounces, security send failures | Any new case | Owner assigned; reconcile provider, suppress unsafe automatic retry and suspend affected fees |
| Worker heartbeat | No samples for 3 scheduled minutes | Check Cron, signed invocation, deployment and provider gate |
| DB API latency | p95 >250 ms for 10 minutes | >1 second for 5 minutes; compare network vs database execution |
| Errors | Any sustained increase | Investigate fixed-error counts with request volume; errors/runs is not necessarily a percentage because a run handles multiple jobs |
| Resource use | >70% CPU/connections/quota/usage budget | >85% capacity or repeated throttling: scale or reduce approved routine work |
| Memory | >80% sustained | Inspect queries/concurrency before moving compute tier |
| Backup | Latest successful snapshot >26 hours old | Retain prior success, investigate; do not use stale export as release authority |

Use staging `EXPLAIN (ANALYZE, BUFFERS)` and Supabase's query tooling for SQL execution latency, lock waits and index use. Avoid customer parameters/private tokens in copied SQL or exported observability. [Supabase query optimization](https://supabase.com/docs/guides/database/query-optimization)

The metrics table retains 30 days via the proposed bounded cleanup. Configure approved host-log retention and a protected alert destination separately. Cron run history, pg_net response retention, failed outbox payloads, collector data and provider logs need their own approved retention checks; this migration does not erase them.

## 6. Provider limits and scaling decisions

- **Vercel:** move to Pro before commercial launch; Hobby is restricted to personal, non-commercial use. Once-per-minute dispatch is Supabase Cron calling authenticated Vercel routes, not Vercel Hobby Cron. Confirm production function duration, region, memory, spend notifications and account allowances before activation. [Hobby terms](https://vercel.com/docs/plans/hobby)
- **Supabase:** Free lists 500 MB database and 5 GB egress; Pro starts at $25/month with 8 GB disk/project and 250 GB egress. Project inactivity pausing and production recovery matter as well as quotas. An extra isolated project starts from $10/month. [Supabase pricing](https://supabase.com/pricing)
- **Supabase compute:** start with Micro, measure CPU, memory, connections and p95 before choosing a larger instance. Connection pooling and query/index fixes come first. Published compute pricing lists Micro $10/month and Small $15/month, with $10 monthly compute credit on paid plans. [Compute pricing](https://supabase.com/docs/guides/platform/manage-your-usage/compute)
- **Edge:** published monthly included invocations are 500,000 Free and 2 million Pro, then $2/million on paid plans. At 2,000 orders the model's 1,470 daily-backup invocations are small; workers must not be counted twice here. [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase)
- **Zoho CRM:** Mail Standard does not identify the CRM edition. Confirm credit allowance, concurrency, settings-read permissions and any workflow limits independently; provisional CRM 300/hour is not an entitlement. [CRM API limits](https://www.zoho.com/crm/developer/docs/api/v8/api-limits.html)
- **Google Sheets:** published quotas include 300 requests/minute/project and 60/minute/user/project for each read/write category; use batching and backoff, and aim for payloads under the recommended 2 MB. [Sheets limits](https://developers.google.com/workspace/sheets/api/limits)
- **Apps Script:** execution time is limited to six minutes; URL fetch and daily trigger runtime depend on account type. Confirm whether the owner uses a consumer or Workspace account. [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)

At 2,000 orders and 10,000 activity rows, a daily snapshot needs 49 export requests (one manifest, eight order pages, forty activity pages) plus Sheets staging/format/publish/status writes and permission checks. Sheet writes can approach the per-user minute quota. Time and quota-test a synthetic backup before increasing volumes/cadence; batch more writes and add bounded backoff first. Preserve the existing successful snapshot on failure; replace it only once the new snapshot has been fully validated. Keep only the latest successful emergency copy after successful publication.

The current export materializes at most 50,000 rows per dataset off the customer path. At five activity rows/order, review capacity by roughly 8,000 cumulative orders/40,000 activities, before the hard 50,000 activity threshold. Actual raw activity can grow faster. Do not truncate records silently or delete audit evidence to fit Sheets.

**Remaining export-performance finding:** `operations_export.sql` still deletes expired snapshot parents with cascading row deletion during export start and in `cleanup_operations_exports()`. This is outside customer checkout, but a backlog could create a large maintenance transaction. Before expanding backup throughput, replace it with indexed, bounded expired-child deletion followed by empty-parent deletion, retaining expiry denial, snapshot identity, locking and current access controls. This package has not rewritten or applied that separate integration migration.

Image/visitor bandwidth may dominate operations costs. Illustratively, 20 visits/order at 1 MB of uncached Supabase-hosted assets means 40 GB at 2,000 orders—well beyond Free's 5 GB egress even though the email queue is small. Asset hosting, cache hits and actual image sizes determine the real figure. Measure those separately. Revisit scaling when resource use approaches the thresholds above or burst latency fails the service target; there is no guaranteed safe order count solely from this local test.

## 7. Rough monthly cost model

USD, before tax/exchange, using public prices checked on 26 October 2026; not a quote or forecast invoice.

`monthly cost ≈ $20 Vercel Pro + $25 Supabase Pro + Zoho invoice Z + transactional sender T + Google plan G + uncovered usage/add-ons`

That is **about $45/month base infrastructure**, assuming one billing developer, one Micro database project and no paid add-ons. The CEO's website admin login does not itself require an extra Vercel developer seat. Existing Zoho Standard is `Z`, using the actual invoice; its SKU/price has not been guessed. Google Sheets API use has no additional API charge, but Workspace subscriptions, storage and admin services may add costs. The [Vercel Pro price includes $20 usage credit](https://vercel.com/pricing); avoid adding covered metered usage twice.

Illustrative Vercel operations usage uses Singapore rates of $0.160/active CPU-hour and $0.0133/GB-hour provisioned memory, plus $0.60/million invocations. Assumptions per invocation: 2 GB memory; low case 0.05 CPU seconds / 0.5 wall seconds; higher case 0.20 CPU seconds / 3 wall seconds. These are planning inputs, not profiling results. [Function pricing](https://vercel.com/docs/functions/usage-and-pricing), [invocation billing](https://vercel.com/changelog/function-invocations-now-billed-per-unit)

| Orders | Modelled operations metering before included credit |
|---:|---:|
| 100 | $0.58–$2.81 |
| 500 | $0.64–$3.13 |
| 1,000 | $0.73–$3.53 |
| 2,000 | $0.89–$4.32 |

Public browsing, image optimization/transfer, builds, observability, slow providers, retries, bot traffic, staging, backups/PITR and other apps sharing the account are excluded. Actual Fluid Compute concurrency can change memory allocation costs. Supabase reads/writes consume compute, disk, WAL and transfer; do not attach an invented per-query dollar rate to the workload table.

For transactional mail, request a verified quote for the required **burst rate as well as monthly volume**. A generic model is `T = quoted fixed fee + ceil(billable emails / 1,000) × quoted per-1,000 rate`, adjusted to the supplier's real billing increments and included quota. Zoho's current transactional pricing page refers to credits; confirm product/SKU, price, validity and eligibility rather than assume a particular advertised price. [Zoho transactional pricing](https://www.zoho.com/zeptomail/pricing.html)

An isolated paid staging database may add approximately $10/month compute once the organization's existing credit is used. Do not create it without approval. Add a discretionary budget contingency, but never save money by disabling authentication, removing payment reconciliation/audits, extending bearer-link authority or allowing offline unchecked handovers.

## 8. Safe rollout, validation and rollback plan

1. **Resolve security/business blockers first.** Obtain explicit management decisions on uncapped fees, unit, notice/extension rules, cancellation/resale and refunds. Complete the mandatory security review fixes and regression tests; do not enable fees because a worker benchmark passed.
2. Confirm launch plans, real provider/API budgets, a transactional-mail burst target, reminder/template producers, a scheduled interest-confirmation drain and an alert owner. Keep routine updates disabled until approved and consent-aware.
3. Prepare isolated staging with fake customer records, separate credentials, no production database and mocked sending. Review migration dependencies: existing order fulfilment/integrations, campaign delivery tables, collection schema and the original scheduler's single-use invocation RPC. The currently reviewed collection schema still has blockers; do not apply it to production merely to satisfy this runtime dependency.
4. Apply the reviewed SQL **only in staging after approval**. Check postgres ownership, safe search paths, RLS and public/anon/authenticated denial. Check new-table ownership, trigger grants and intended service-only RPCs. Verify the migration reruns and counter bootstrap matches real job totals in maintenance, without adding a count scan to live requests.
5. Test with separate database connections: duplicate claimers/markers, simultaneous payment and handover, order changes during sender preparation, lock timeouts, quota reservations, expiry, uncertain sends and worker crashes. Test paused schedules, signed nonce replay, provider disable, bounded cleanup backlogs and no silent pagination loss. Mix future jobs, failed/review predecessors and high-priority traffic.
6. With explicit test-send approval, use only owned test inboxes and a CRM sandbox/test module. Verify OTP latency, inbox/bounce events, fee suspension, no duplicate sends and correct image/support content. Run a 30-day accelerated clock simulation for reminders/updates and stop conditions. Stress traffic must target staging, not a live mailbox or production database.
7. **Approved production cutover requires a short sending pause.** Pause V1 schedules and other campaign send entry points; allow in-flight workers to complete/reconcile. Record queue state and verify a recoverable backup. Apply reviewed runtime SQL; it denies old direct send markers, so an old application build must not continue sending against it. Deploy compatible code with V2 enabled, keep provider controls disabled initially, then test with explicit approval before enabling budgets and V2 schedules. Do not execute a live smoke test without permission.
8. Enable the bounded cleanup schedule separately, monitor telemetry/oldest due jobs and verify daily backup. Gradually increase an approved provider limit only after measured latency and provider confirmation. No new schedules are activated by the supplied SQL.

**Rollback:** disable provider controls first, pause V2 schedules and new mail enqueueing, preserve in-flight markers and review uncertain sends. Keep the compatible application/schema while fixing forward. Turning the app flag off alone is unsafe after migration because old direct-marker writes are rejected; do not revert to an old sender against the new guards. Do not remove send guards, audit rows or payment checks to clear a backlog. Fee-accrual/delegation suspension must use independently hardened controls from the security plan; a mail pause alone does not suspend existing fees. During an outage, warehouse staff may reconcile against the restricted backup, but must hold release until live, authenticated payment/storage/authorization/single-handover checks are restored or a separately approved exception process exists.

## 9. Local evidence and limits

Local tests use synthetic PGlite PostgreSQL and provider mocks; the complete test suite was run with external network calls disabled. The new tests exercise role denial, rerunnable counters, priority/review isolation, lease recovery, order revision changes, shared campaign quota, deferred sends, bounded cleanup/index plans, safe telemetry, scheduler creation paused and V2 worker behavior. Existing payment, email, CRM, registration and collection tests remain in the suite.

Synthetic fixtures intentionally retain the earlier, heavier 25-job stress scenario rather than the new 23-job forecast: 100 / 500 / 1,000 / 2,000 orders, 2,500 / 12,500 / 25,000 / 50,000 queue jobs and 20,000 expired limiter rows. The hot limiter leaves all expired rows untouched. Queue counter size remains 288. Candidate query plans use an index-only scan. See [local benchmark results](operations-local-benchmark.json); five timing samples (20 for limiter) are a smoke measurement, and their reported p95 is effectively the maximum sample. This does not establish production requests/second, true concurrent locking, cold starts, provider latency or delivered-email capacity.

Final local verification: **88 tests passed**, ESLint passed, TypeScript passed, the production Webpack build passed, and tracked diff whitespace checks passed. Tests and build ran with external network calls disabled. The final benchmark's claims took roughly 3.9–10.1 ms; report samples reached 23.2 ms in the 1,000-order fixture and 3.3 ms in the 2,000-order fixture. This variation illustrates why small embedded timing samples must not be presented as a production latency guarantee. No live load test or remote migration was run.

The prior collection vulnerability diagnostic intentionally reproduces outstanding defects; it is not evidence those defects are fixed. Staging contention, browser/provider acceptance, log-redaction verification, alerts, retention approval and production deployment all remain outstanding.
