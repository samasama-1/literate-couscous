# Order workflow security review

Scope: local changes for address capture, order search, remaining payments and collection. Source review, embedded PostgreSQL permission/state tests, dependency audit, lint, TypeScript and production compilation. No production migration or customer/payment action was performed. This is not a penetration test or a guarantee that the system has no vulnerabilities.

## Fixes made during review

- Protected order and address reads/writes against browser roles, PUBLIC grants and older column-level grants. Admin pages and mutations check the authenticated admin allowlist independently of the route proxy. Payment/collection RPCs are service-role-only.
- Registered orders transactionally with a batch row lock and duplicate-order guard: batch closure or repricing cannot race the final insert; amounts and payment status are derived on the trusted server/database. Client-supplied amounts cannot mark an order paid.
- Increased newly generated order-code randomness to 64 bits and rate limited order lookup. Legacy codes remain valid. Anonymous duplicate registrations do not reveal an existing code or distinguish paid from unpaid orders.
- Private balance links use 256-bit random tokens with only SHA-256 hashes stored, expiry after 30 days and rotation on replacement. Pages expose only order/product/payment details, never the saved address/contact details. Invalid, expired or refunded links fail closed. These links are bearer credentials: anyone receiving one can view the limited payment details. Keep them private; hosting access logs may contain the URL.
- Missing/inconsistent balance snapshots now fail closed for readiness and collection. Exact payment amounts and bank references are required. Reused bank references across payments/orders are rejected, including historical order references. Admin identity, timestamp and recipient are written in the same transaction as each transition. Row locks make repeat handovers idempotent.
- Added no-store, no-referrer and frame-blocking headers for admin and balance pages.
- Removed automatic contact upsert/Deal creation from unverified public order submissions so a supplied email cannot overwrite an existing Zoho Contact. Campaign CRM sync remains a separate flow.
- Applied compatible dependency patches for the production advisories identified during the review.

## Remaining issues and limits

- Email ownership verification is still absent. The existing campaign contact/consent upsert can be impersonated by supplying another person's email; this is the earlier launch blocker. Anonymous batch orders may also contain fabricated contact details. Rate limiting and payment checks do not establish email ownership.
- Rotate the Zoho client secret previously pasted into the conversation, if not already done. Production secrets, role permissions, migrations and deployed code have not been independently verified in this review.
- Payment verification is manual. Staff must check bank records and the collector's identity/order details. No bank API independently confirms the payment, no partial/combined payment allocation is supported, and the whole order is marked collected. Corrections require a controlled review.
- Production npm audit reports zero known vulnerabilities after compatible patches. Five high findings remain in the development-only ESLint dependency chain involving braces/micromatch/fast-glob. npm's proposed force fix downgrades eslint-config-next to an incompatible major version; it was not applied. These findings remain unresolved, not assumed harmless. Avoid processing untrusted code/glob inputs in tooling and revisit a compatible upstream patch.

## Apply and validate

Run the updated `database/sql/order_fulfilment.sql` (rerunnable) before deploying. If the older copy was already run, rerun this updated file. Regenerate older unpaid balance links without expiry. Deploy the reviewed code and dependency lockfile. Test signed-out and non-admin access, wrong payment amounts, reused references, zero balance, refund rejection, token rotation/expiry, duplicate collection and the correct warehouse search results in a controlled environment. The tests cover database permissions and transitions; actual deployed Supabase/browser behavior still needs acceptance testing. Retain Coming Soon until launch blockers are resolved.
