# Named collector and photo-ID handover — replacement implementation

Prepared locally. Replaces the earlier pickup-code draft; no production SQL, deployment, settings, customer mail or data deletion has occurred. This document supersedes pickup-code instructions in older reviews. Wider storage/email/privacy launch blockers still apply.

## Customer and staff journey

1. The collection-ready email includes a private **collector authorisation form** link. This is for the owner, not the collector. The owner proves access through the secret link delivered to the order email; it is not accessible using an order code alone.
2. The owner enters the collector's full name as shown on original photo ID and confirms permission/authorisation. No collector phone, ID number, ID upload or pickup code is requested.
3. The signed link has a separate v2 purpose, is valid for 24 hours from generation and is consumed by incrementing the order's access version inside the same transaction as the authorization and owner-notification job. Replaying, replacing fields or racing two saves cannot reuse it. A GET or mail-security scanner cannot consume the form link: only the explicit POST action changes anything.
4. The owner receives a queued confirmation of authorization/revocation. For another change or an expired link, contact support. An authenticated admin verifies the request and uses **Email a fresh form link to the order owner**; the destination cannot be entered/overridden. Reissue has a five-minute database cooldown. There is deliberately no public form accepting just order code/email, and no admin screen displaying a newly minted owner bearer URL.
5. The collector arrives with the order code and original photo ID. Staff visually match the photo/person and full name to the currently selected owner/authorized collector, check all quantities, and confirm the ID checkbox. Do not record an ID number or retain an ID copy.
6. Record collection successfully **before releasing goods**. The server/database verify current authorization, method, owner/email/readiness/version, expiry/revocation, full product payment, current storage balance and one-handover status. The dashboard has no pickup-code input. Name mismatch/missing ID requires verified owner/support resolution, not an informal override.

The owner may collect personally after staff verify the owner's photo ID. A delegation does not prevent the actual owner collecting. Third-party authorizations expire after 30 days, can be replaced/revoked and permit one complete handover. Changes in email/readiness/method/payment status/access version revoke an existing grant. No photo-ID authenticity or visual matching can be performed by code; staff procedure remains essential.

## Scope and controls

- New `COLLECTION_AUTH_INSTALLED=true` routes all collection handovers through the ID-checked server RPC. It must be set for the compatible application after the named-authorisation migration is installed.
- New `DELEGATED_COLLECTION_ENABLED=true` enables the form/new owner-link emails at the app level. Database `collection_controls.delegated_enabled` is also false by default and must be separately approved/enabled. Both are needed for new authorization. SQL also checks the database control for delegated redemption. Pause that database control to suspend in-flight delegated handovers; existing owner handover/payment checks remain enforced. Owner revocation remains available through a valid link while new nomination is paused.
- Existing `FULFILMENT_V2_ENABLED` controls new storage-policy acceptance/UI. It is independent of delegation; the named collector feature can be staged with storage charging disabled. Never disable accepted fee obligations by toggling a UI flag. Existing storage defects/notice evidence still block activating revised charging.
- A protected handover receipt can be written only inside the service-only named handover RPC. An order trigger requires a receipt from the same transaction for a collection transition. Old payment/integration RPCs cannot bypass this by directly fulfilling. The receipt and order/audit changes roll back together when payment or storage validation fails. Only the first successful transition returns collection success; a repeated request returns `already_collected` and the app explicitly tells staff not to release again. If the first response is lost, hold and reconcile rather than assume a retry authorizes another release.
- Legacy pickup-code RPCs are dropped by the new migration. Existing draft authorizations missing the new owner binding fail closed; old-purpose management links fail signature validation. There is no fallback accepting an old pickup hash/code.
- The notification queue uses existing durable jobs and uncertain-send review. `collection_access` and `collector_changed` are recognized by the worker; V2 runtime places them in the security lane. Link reissues skip if order context has changed, and names are escaped in messages. New template wording is still a draft pending the owner's email-content review and approved inbox test.
- No financial transaction is authorized by this form. Full payment/bank reconciliation, storage settlement and staff authorization remain required.

## Retention

`cleanup_named_collectors(500)` is owner-only, indexed, bounded and skips retention-held rows. Completing a handover or refund records eligibility 14 days after the later relevant ready/terminal time. Active/uncollected rows are not purged merely because the authorization expires. This cleanup removes the collector profile row, not financial/audit evidence, sent mailbox content or outbox investigation payloads.

The current order model has fulfilment/refund terminal events, not a general cancellation ledger. Other approved cancellation outcomes need a deliberate terminal/retention marker before automatic cleanup; stopping a storage clock alone must not be treated as cancellation. Historical imported terminal rows without an eligibility timestamp require a separately approved backfill/reconciliation. Retention holds are controlled by the database owner pending an approved admin UI. Minimal existing recipient/handover audit fields still require their own retention decision.

`collection_named_cleanup_schedule.sql` creates a paused 15-minute job. No cleanup schedule has been activated and no production data has been removed.

## Review-only migration and release plan

1. Keep new flags/schedules off. Test only with isolated synthetic data; do not use production credentials for write tests.
2. Prerequisites: current `order_fulfilment.sql`, `order_integrations.sql`, revised `collection_management.sql`. Apply `collection_named_authorisation.sql` in isolated staging and reapply to prove rerunnability. The revised collection draft no longer creates pickup-code functions.
3. If an older draft exists, inventory/backup it before migration. The new SQL removes obsolete collector phone/hash columns and legacy RPCs. This is an explicit proposed data/schema change requiring approval, not authorization to delete existing production data now. Preserve relevant incident/audit evidence separately and communicate that old grants/links will be invalidated.
4. Review all function/table owners, safe paths, RLS and anon/authenticated denial; service role has only SELECT on collector profiles and approved RPC execution, no direct handover-receipt insert/update rights. Verify code cannot fall back to a legacy handover when controls are disabled.
5. Test distinct-session races: two form submissions; revoke/replace/email/method/refund change versus release; two staff releases; cleanup versus held/active authorization; lock waits across link/code-free grant expiry and fee boundaries. PGlite tests are serialized and do not prove real concurrency.
6. Verify the runtime/scheduler/provider capacity as a separate rollout. In production, pause old senders/in-flight operations, apply only the approved reviewed schema, deploy the matching application with `COLLECTION_AUTH_INSTALLED=true`, then separately approve/enable delegation flags/control. Mixed old application/new guarded schema fails closed; avoid leaving the collection desk in this state.
7. Obtain explicit approval before owned-inbox test sends. Check actual ready email → owner form → change notification → admin search → ID checkbox → single collection, plus reissue/revocation and declined payment. Final email wording remains a later owner task.
8. Activate the cleanup job only after separate approval. Verify aggregate cleanup outcomes without logging names, links or message content.

Rollback: pause delegated creation/redemption through the database control, retain compatible ID-checked owner handover and payment guards, then fix forward. Do not drop receipt/authorization guards or revert to the old pickup-code path to bypass a failed release. Preserve audit, payment and pending notification records. Disable new email production only after accounting for queued/in-flight work; do not replay uncertain jobs through another provider.

## Local verification coverage

`tests/collections.test.mjs` now covers one-use/24-hour links, names-only form validation, notification enqueue/worker ready-link behavior, replacement/revocation, photo-ID requirement and existing storage/payment checks.

`tests/collection-named.test.mjs` covers stale owner/method/readiness/refund state, expired grants, unpaid handover, old-RPC bypass, transactional notification rollback, reissue cooldown, cleanup holds/active rows and role restrictions. The obsolete pickup-code diagnostic script was retired; the earlier hardening review remains a historical record, not proof all remaining issues are fixed.

## Operating work and verification limits

There is no pickup-code issuance, storage, guessing counter or staff code entry. A typical authorization uses one existing ready email containing the form link and one owner-change confirmation; an admin-requested replacement adds one email. The existing generic order-update trigger may also enqueue a CRM metadata update when the owner-link version is consumed. These are conditional additions; the prior capacity model remains a conservative planning allowance, not measured provider throughput.

The owner form uses primary-key order/collector lookups and distributed keyed request limits. Mutations keep authorization, version consumption, notice job and audit atomic; no database lock spans an email/API call. Expiry and fee checks use wall-clock time after the relevant locks. The earlier rate-limiter cleanup fix/runtime migration and capacity/monitoring rollout still need their own approval; a simpler desk process does not remove those launch gates.

Local checks: the full suite passed **91 tests** with network access disabled; the two collection test files were rerun after the final SQL lock/timing adjustment (**9 passed**). ESLint, TypeScript/production Webpack build and diff whitespace checks passed. No production SQL, provider send, deployment or git staging/commit was performed. Real separate-session contention, actual inbox delivery, staff/browser acceptance and hosting log-redaction checks remain staging/release gates.

## Payment-at-collection update — 27 October 2026

See [manual-balance-rollout.md](manual-balance-rollout.md). Collection readiness and owner nomination may precede remaining-payment verification. Goods still cannot be released until the actual product balance is verified, applicable storage is cleared, identity/current authorization is checked and the single handover succeeds. No advance collection balance request or collection balance receipt email is produced in this flow; the ready notice carries any amount payable at collection. Delivery balance requests are manual and separate.
