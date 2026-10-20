# Order email and dedicated Zoho Orders integration

Prepared 20 October 2026. **Deployment approved by Marcus on 20 October 2026.** The SQL was applied to linked Supabase project `slsbdpfocmotilvdbmwk`; order and audit integrity digests were unchanged, all five new function owners/search_paths/browser-role restrictions were verified, queue RLS is enabled, and no existing orders were backfilled. A private pre-migration recovery snapshot was saved outside the repository. The website release uses sending disabled by default; no credentials were changed and no emails/CRM records were sent by this work. Production email/CRM activation and the scheduler remain pending a controlled owner-inbox test. Existing interest-confirmation sending is unchanged.

## What the implementation does

A transaction-level orders trigger writes separate email and CRM jobs. Registration and payment/fulfilment operations cannot commit without their jobs. Repeating a guarded payment or collection action without changing the order does not create another notification. Existing records are not backfilled.

Email events: order received (payment explicitly pending), deposit verified, balance requested, balance verified, ready for collection/delivery. Refunds and fulfilment update CRM but do not yet send extra emails. Message source: `src/lib/order-integrations/messages.ts`; these immediate templates are still edited in code, not CRM. All five include product name, quantity, order code, batch ID and a public product/batch link loaded directly from website data. CRM does not need product/batch fields for these emails. The public link contains no private order credentials; only balance-request emails carry their separately encrypted private payment link.

A protected scheduled worker sends through the existing Zoho Mail connection and separately upserts into a dedicated CRM module. Claims are bounded, indexed and use SKIP LOCKED. One job per order/channel can be processing; a short per-channel advisory lock serialises claims only, never external network calls. Expired preparation leases can retry; once an external POST starts, an uncertain result becomes review-required and blocks later jobs for that order/channel. No automatic uncertain POST retry. This prevents duplicate sends at the cost of requiring manual reconciliation. Provider acceptance is not proof of inbox delivery.

Payment and collection eligibility is checked again after OAuth preparation. An order can still change between the last check and external acceptance; no distributed transaction exists with Zoho. Keep critical immediate notifications under website control. CRM writes suppress workflows (`trigger: []`) and explicitly skip insert/update cadences in this first phase.

## Owner setup: dedicated CRM module

1. Sign in to the **CRM account**, not the separate Mail account. Confirm your edition permits custom modules.
2. Under Setup → Customization → Modules and Fields, create a custom module labelled **SamaSama Orders**. Verify its API name is exactly `SamaSama_Orders`. The integration deliberately accepts only that module. If Zoho generates another name, provide it for a reviewed mapping change; do not substitute Deals.
3. The screenshot-confirmed primary field labelled **Order Code** has API name `Name`. Use it as the upsert duplicate key; do not add a second Order_Code custom field. Zoho documents `Name` as the standard duplicate-check field for custom modules. Do not mark Email, Customer_Phone or any other mapped customer field unique: a customer can have multiple separate orders.
4. The reduced mapping below supersedes the earlier full timestamp list:

| API name from your screenshot | Website source / meaning |
| --- | --- |
| `Name` | Order code; primary text field and upsert key |
| `Customer_Name` | Customer name |
| `Email` | Customer email (standard Email field, not Customer_Email) |
| `Customer_Phone` | Customer phone |
| `Quantity` | Integer order quantity |
| `Deposit_Cents`, `Final_Total_Cents`, `Balance_Cents` | Long integer amounts, in cents; null allowed when unknown |
| `Payment_Status` | Awaiting deposit, Deposit verified, Awaiting balance, Fully paid, Refunded, or Needs review |
| `Registered_At` | Actual website order creation time |
| `Fulfilment_Status` | Pending, Preparing, Ready, Collected, Delivered, Cancelled; inconsistent readiness/payment data becomes Needs review |
| `Status_Changed_At` | When the **fulfilment** status last changed, not the last sync time or payment-only update time |

**Two screenshot fields cannot be repurposed:** Product Name uses `Created_By`, and Batch ID uses `Modified_By`. These API names identify Zoho system audit fields; relabelling them does not make them writable product/batch text fields. Restore their original labels or hide them from your layout. The integration deliberately sends neither field. Product/batch identification remains in Supabase, the admin dashboard and order emails; it is currently absent from the CRM summary. Unused standard fields such as Owner, Record_Image, Connected_To__s, Secondary_Email, Email_Opt_Out and Tag are left untouched.

You do not need to restore the omitted fulfilment-method and six milestone timestamp CRM fields. All detailed payment and fulfilment history stays in Supabase. A single new website-only `fulfilment_status_changed_at` column and guarded BEFORE trigger preserve the exact timing of future fulfilment transitions. Unrelated edits and repeated syncs cannot reset it. Existing orders are not rewritten: known milestone timestamps are used as a fallback; unknown historical cancellation times stay null rather than inventing a date. The approved SQL migration includes this addition and has been applied to the linked production database.

If product and batch details must be visible in CRM, we need a real writable field first. One field-saving option for later review is replacing Registered_At with an Order Details text field containing product and batch; actual registration time would then remain website-only. The current implementation does not make that change or silently use another standard field.

5. Restrict module/field access to operations staff. Do not add extra required fields without changing/testing the mapping.
6. Ensure the CRM integration user/token has CREATE/UPDATE access to this custom module (and appropriate module/layout permissions). The new read-only schema preflight also requires `ZohoCRM.settings.fields.READ`. It checks field presence, types, API create/update permissions and customer-field uniqueness before attempting any order upsert, once per worker batch. If metadata is unavailable or mismatched, sending to CRM fails closed and no order write is made. Use the existing **CRM** OAuth client, never the Mail token. Authorisation may need to be renewed with the necessary custom-module scopes. Do not revoke or replace the working campaign token without preserving its existing permissions.
7. Keep Supabase authoritative. Customer identity remains within each order record; this worker does not upsert shared Contacts by unverified email. CRM workflow edits must not mark website orders paid or fulfilled.
8. The module API name was confirmed from Marcus’s screenshot on 20 October 2026: `SamaSama_Orders`. This matches the code and ORDER_CRM_MODULE. A controlled live metadata/read and one owner-approved order sync are still needed before claiming production compatibility.

Official references: [Zoho upsert API](https://www.zoho.com/crm/developer/docs/api/v8/upsert-records.html), [explicit workflow trigger control](https://help.zoho.com/portal/id/community/topic/kaizen-148-trigger-in-records-apis?page=1).

## Deployment configuration — leave sending off initially

The existing dedicated Zoho Mail environment variables remain unchanged. CRM uses existing `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ACCOUNTS_URL`, `ZOHO_API_DOMAIN` from the CRM account. This integration requires an exact supported Accounts/API data-centre pairing; do not infer the CRM region from Mail. For example, US is accounts.zoho.com + www.zohoapis.com, SG is accounts.zoho.sg + www.zohoapis.sg. Legacy .com.sg aliases are not silently accepted; verify the token's API domain before changing any shared CRM setting.

New **server-only** variables (no NEXT_PUBLIC prefix):

```dotenv
ORDER_INTEGRATIONS_INSTALLED=false
ORDER_EMAIL_ENABLED=false
ORDER_CRM_ENABLED=false
ORDER_CRM_MODULE=SamaSama_Orders
# Generate two DIFFERENT random 32-byte hex values privately:
ORDER_WORKER_SECRET=<64 hex characters>
ORDER_EMAIL_LINK_KEY=<different 64 hex characters>
```

`NEXT_PUBLIC_SITE_URL` must be the canonical HTTPS origin without a path. The AES-256-GCM link key encrypts payment tokens in the queue, authenticated to the order ID. Keep it stable and backed up securely; rotating it without draining/re-encrypting queued links makes those jobs unreadable. Secrets must not enter git, logs, screenshots, Sheets or CRM.

Activation order **after approval**:

1. Verify prerequisites and capture the current order RPC definitions/recovery plan. Apply `database/sql/order_integrations.sql` as postgres after `order_fulfilment.sql`. It adds the queue, enqueue/fulfilment-time triggers, website fulfilment timestamp column, wrapper and claim/helper functions; it sends nothing. Do not alter existing order/payment rules or grants.
2. Verify RLS, service-only table access, function owner/search_path/EXECUTE privileges and unchanged order/payment rows. Deploy code with both sending flags false.
3. Configure the link key and set `ORDER_INTEGRATIONS_INSTALLED=true`, then redeploy. This routes balance requests through the atomic encrypted-link wrapper. Set it even while sending is off, otherwise newly generated balance jobs will lack a usable envelope. Do not use earlier balance jobs lacking an envelope for live sending.
4. Arrange a controlled synthetic/new order with an owner-controlled inbox. Do not turn sending on against an unreviewed backlog: a newly claimed old order-received message could otherwise still be relevant. Inventory/suppress stale queued jobs with a separately approved data operation.
5. Enable only `ORDER_EMAIL_ENABLED=true`, redeploy, run one owner-authorised worker invocation and inspect order detail → Email & CRM deliveries. Verify one email and its reply destination. Repeat invocation; no duplicate should appear.
6. Configure the verified CRM module and token permissions. Enable `ORDER_CRM_ENABLED=true`, redeploy and process one controlled order's CRM jobs. Verify one record per order code and no CRM workflow emails.
7. Only after those checks, install two authenticated scheduler calls every five minutes (email and CRM). No scheduler is created by this change. Choose a scheduler supported by your hosting plan; do not expose the secret in a URL or browser.

Worker URL: `https://YOUR-CANONICAL-HOST/api/internal/order-integrations?kind=email` or `?kind=crm`. GET and POST are supported. Send `Authorization: Bearer <ORDER_WORKER_SECRET>` over HTTPS. Redirects must be disabled. Response contains counts only, no customer records/credentials. A disabled worker returns enabled:false without claiming jobs. Keep scheduler credentials outside customer-facing JavaScript. Monitor non-2xx responses and job statuses.

## Editable templates and timed emails in Zoho — next activation phase

Mail and CRM can remain separate accounts. Verify hello@samasama.sg as a CRM Organisation Email if CRM will send. Mail API authorisation does not automatically configure CRM senders or templates.

1. In CRM, create Email Templates for the custom Orders module; use order fields as merge values. Preview using owner-controlled data.
2. Define proposed reminder timings (for example, deposit +24 hours; collection +3 days) and exclusion conditions. Pending orders currently do not have an automatic 24-hour expiry worker; do not assume they do.
3. Under Automation → Workflow Rules, choose the Orders module and a specific status/timestamp transition. Attach a scheduled action. Confirm edition limits and sender availability.
4. Before allowing payment/collection reminders to send, implement an authenticated scheduled-function/website eligibility handoff checking **current Supabase state**, with a unique reminder event ID and suppression on paid/refunded/fulfilled/replaced-link states. A stale CRM record alone must not authorise a payment reminder. Do not expose the general worker secret to browsers or create a public send endpoint.
5. Give each message exactly one owner: website immediate receipt or CRM follow-up. Current CRM transport intentionally sends `trigger: []`; scheduled workflows cannot activate from these writes yet. A future reviewed change must selectively enable workflows only after duplicate/cancellation tests. With the reduced CRM field budget, detailed reminder clocks and final eligibility checks belong in the website queue, not in missing CRM milestone fields; that reminder scheduling extension is not implemented yet. Simply creating a workflow does not complete this handoff.
6. Never put raw private balance links into general CRM fields to support merge templates. Generate/retrieve a valid link through the restricted send handoff instead.
7. Do not run promotional sequences from order records unless separately authorised by recorded marketing consent. Order submission is not marketing opt-in.

Thus the local implementation provides durable immediate emails and a reliable CRM data channel, **not an activated Zoho reminder system or UI template editor**. The CRM account/module setup, timing choices and reminder handoff remain explicit next steps.

## Review, recovery and retention

Admin details show the latest 30 job summaries, never payloads or encrypted links. There is intentionally no “force resend” control. Preparation errors retry with bounded backoff, up to five attempts. A review-required job blocks later jobs on the same order/channel. Check Zoho Sent/CRM records before an operator resolves an ambiguous result; do not reset send markers/leases or delete jobs to bypass the guard. Responses/logs never echo provider bodies. A sent job stores the provider ID and clears its payload; skipped jobs clear payload too. Review/failed jobs retain recipient/snapshot/encrypted link for investigation, so restrict service-role access and agree a retention period before public activation. No automated historical deletion is included; prepare a separate approved retention cleanup once that period is chosen. Queue rows contain no addresses or payment transaction references, and are not part of operations-export.

Rollback: disable both workers/schedules first. Keep the link key and queued jobs. If reverting the order-action code, set ORDER_INTEGRATIONS_INSTALLED=false; the previous guarded order RPC remains intact. Removing the trigger/table/RPCs or clearing pending jobs is a separate reviewed SQL action, not automatic rollback.

## Test gate

Local tests cover transactional enqueue/rollback, duplicate payment operations, guarded balance handoff, exclusive/reclaimed leases, review blocking, permissions/search_path, malformed/unauthorised worker requests, stale/paid/refunded/collected order eligibility, encrypted-link tampering/key/order binding, reduced CRM mapping/upsert, field metadata validation, distinct orders for the same customer, human-readable payment/fulfilment summaries, stable fulfilment timing, and workflow/cadence suppression. Mocked transport tests make no external sends. Run all tests, lint, TypeScript and build.

Before public activation, use a staging project (or separately approved tightly controlled production smoke-test scope): two concurrent worker calls; network failure before/after POST; accepted-send persistence failure; replaced/expired balance links; payment before reminder; customer-email change; fulfilment before ready email; CRM permission/mapping error; actual mailbox reply/delivery; order create and each guarded transition. PGlite tests prove database semantics in a single backend, **not real multi-session timing**. No staging or external send test has been performed by this implementation.
