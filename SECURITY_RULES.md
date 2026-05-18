# Security Rules for This Project

This is a Singapore-based group-buy website for premium vetted Chinese home appliances.

Security and trust are critical because customers submit personal information, pay deposits via PayNow, and track order status.

## Core Security Rules

1. Do not hardcode secrets.
Never place API keys, database passwords, admin passwords, service role keys, email API keys, payment secrets, or private company credentials directly inside the codebase.

Use environment variables instead.

2. Never expose secrets with NEXT_PUBLIC_.
In Next.js, variables starting with NEXT_PUBLIC_ are exposed to the browser.

Do not store secrets in variables such as:
- NEXT_PUBLIC_ADMIN_PASSWORD
- NEXT_PUBLIC_DATABASE_SECRET
- NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_EMAIL_API_KEY

Only non-sensitive public values may use NEXT_PUBLIC_.

3. Keep .env.local out of GitHub.
Ensure the project has a .gitignore file containing:
.env
.env.local
.env*.local

4. Protect all admin pages.
Any route under /admin must require authentication or access protection.

Do not rely on hidden URLs for security.

Bad:
- /admin-secret-123

Good:
- proper login/session protection
- middleware protection
- server-side authorization checks

5. Protect admin API routes.
Any API route that changes order status, verifies payments, edits batches, exports customer data, or updates admin notes must be admin-protected.

Normal users must not be able to trigger admin actions from the browser.

6. Protect customer order lookups.
Customers should not be able to see order details using only an order ID.

Order lookup must require:
- Order ID + phone number, or
- Order ID + email, or
- secure magic link

Do not expose full customer data on the order status page.

7. Limit what customers can see.
Customer-facing order status should only show necessary information such as:
- deposit status
- batch status
- current unlocked price
- estimated timeline
- collection instructions
- support contact

Do not expose:
- full internal notes
- other customers’ orders
- payment screenshots
- admin comments
- supplier costs
- private margins
- internal supplier risk notes

8. Payment screenshots must be handled carefully.
If payment screenshot uploads are implemented:
- restrict file types to images or PDFs only
- set file size limits
- do not store uploads in a public folder unless access is intentionally public
- payment screenshots should be visible only to admins
- avoid exposing direct public URLs to uploaded screenshots

If secure uploads are not ready, use a transaction reference field first and handle screenshots manually via WhatsApp.

9. Validate all form inputs.
Validate inputs both on the frontend and backend where applicable.

Fields to validate:
- name
- phone number
- email
- quantity
- order ID
- payment reference
- uploaded files
- admin status updates

Use reasonable length limits and reject malformed data.

10. Batch progress must only count verified deposits.
The public group-buy progress tracker must count only admin-verified deposits.

Do not count all submitted forms.

This prevents fake submissions from inflating batch progress.

11. Do not expose rejected supplier details.
Do not publicly mention or name any rejected supplier.

Do not include allegations about:
- product liability
- patent litigation
- fake reviews
- supplier disputes

Public messaging should be positive:
“We work only with suppliers who pass our internal vetting for quality, reliability, and after-sales support.”

12. Do not expose internal business details.
Do not expose:
- factory cost
- procurement margins
- supplier contracts
- supplier risk notes
- private negotiations
- internal vetting documents
- internal legal concerns

13. Keep dependencies minimal.
Do not install new packages unless necessary.

Before adding a package, explain:
- why it is needed
- what problem it solves
- whether there is a simpler built-in alternative

14. Avoid destructive changes without approval.
Before large edits, database migrations, deleting files, or restructuring folders, explain the plan and wait for approval.

15. Run checks before completion.
After significant changes, run:
- npm run build
- relevant lint/type checks if available

Summarize:
- what changed
- what files changed
- how to test it
- any security concerns remaining

## Business Logic Rules

1. Customers do not need full account creation in MVP.
Use order lookup by Order ID + phone/email instead.

2. Deposit flow is PayNow-based.
Customers submit a form, receive PayNow instructions, then provide transaction reference and/or upload proof.

3. Admin manually verifies deposits.
Only verified deposits count toward batch progress.

4. Everyone in the same batch receives the final unlocked price.
Final price is based on the confirmed quantity when the batch closes.

5. Do not build full e-commerce checkout unless explicitly requested.
This is a group-buy deposit model, not a standard shopping cart model.

## Before Making Changes

Before editing files, always:
1. Read this SECURITY_RULES.md file.
2. Read PROJECT_CONTEXT.md if it exists.
3. Explain what you are about to change.
4. List the files you expect to create or edit.
5. Mention any possible security implications.
6. Wait for approval if the change affects admin, orders, payment, uploads, or database logic.
