# Orders and collection dashboard refresh

Implemented the Calm operations workspace with Warehouse desk collection controls from the approved design previews. Applies to `/admin`, `/admin?mode=collection` and `/admin/orders/[id]`. Campaign pages and the public landing pages retain their existing design.

## What changed

- Scoped olive/neutral workspace, compact navigation, searchable order table, clear status badges and a collapsible new-batch form. New batch links open the form directly.
- Collection mode has a server-rendered queue and one selected order with contact details, product/quantity, deposit, balance, total and an explicit handover confirmation. Selecting an order preserves scroll position; selection cannot retrieve a record outside the authorized filtered page.
- Full order details separate customer/fulfilment information, payment evidence, action forms and activity history. Email remains available here and in the selected collection card; it remains searchable from the order table. Full collection recipient, staff and timestamp information remains in these details and the collected queue.
- Current page summaries are computed from the existing maximum 50 loaded rows. Only Matching orders uses the existing exact total across all matching pages; other cards are clearly labelled Current page only. No new aggregate queries or polling were added.
- Operational payment review is distinguished from a verified deposit. A missing/inconsistent final total, missing deposit amount or unpaid balance never produces a ready-for-handover badge. Completed/refunded orders have no collection action.
- Collection buttons require an explicit checkbox and disable while submitting or after a successful response. Both the desk and order detail use the same collection form. Delivery retains its proof/reference form.

## Existing controls retained

Admin allowlist/session checks run before database reads, on the page and again on each action. Searches and status filters remain server-side and paginated. The order-operation RPC remains authoritative for payment amounts, order state, duplicate handover prevention and audit entries. Database/schema, credentials, export integration and notification behavior were not changed.

## Validation

- ESLint, TypeScript and production webpack build.
- Full test suite, including database lifecycle tests for unpaid/duplicate handovers, plus new presentation tests for missing/inconsistent/refunded/zero-balance states.
- Visual review of real page components rendered locally with fictional orders only: order table, selected collection, blocked payment, completed collection, empty results and full details. Desktop and mobile layouts keep table/navigation scrolling inside their containers; no document-level horizontal overflow was observed.
- Static visual fixtures do not authenticate, query Supabase or submit actions. They do not establish that a real authenticated browser mutation succeeded. Run a synthetic staging order through search → deposit verification → balance verification → ready → confirmed collection when checking the deployed UI. Do not use real customer payments or handovers as test actions.

No deployment is included. Existing SQL/Google Sheets integration work remains separate.
