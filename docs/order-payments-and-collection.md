# Orders, remaining payments and collection

## Activate the changes

1. In the website's Supabase project, run **database/sql/order_fulfilment.sql** in SQL Editor. Existing orders are preserved. Browser roles lose direct insert/update/delete access to orders; the website uses server-side actions instead.
2. Configure hosting variables: `PAYNOW_UEN` (your real registered UEN), `PAYNOW_PAYEE_NAME` (the name customers should see in their bank app), optional `PAYNOW_QR_IMAGE` (a local public image path, for example `/paynow.png`), and `NEXT_PUBLIC_SITE_URL=https://www.samasama.sg`. Use a real supplied QR; this implementation does not generate banking QR codes. Without UEN/payee, pages explicitly say payment instructions are pending.
3. Deploy after the migration. The order form also uses the existing campaign rate-limit RPC, installed by `harden_campaign_lead_system.sql`.
4. Test with your own details. No live migration, payment verification, customer messages or deployment was performed during implementation.

## What customers enter

Name, phone, email, quantity, street/block/building, optional unit, Singapore postal code and collection/delivery preference. Address is collected for both preferences now, so it is already saved for later fulfilment. Delivery availability and any charges must be agreed separately before the final amount is requested. An order records its deposit due in cents at submission time; later batch edits do not change that recorded amount.

## Admin flow

Visit **/admin**. Search by order code, customer name, phone or email. Filter by deposit status, ready or fulfilled; results are paginated in groups of 50. Product names appear alongside batch references. Refresh to see new submissions.

Open **Manage order**:

1. Check your bank transaction, enter the exact deposit amount and transaction reference, then choose **Verify deposit**. A customer saying they paid is not verification.
2. Once the final price is known, choose **Create / replace balance request**. Enter the total for the entire order, including all quantities and any agreed charges. The form's suggested value is the batch's tier-one price, not an automatically confirmed final price; review it. The system subtracts the verified deposit.
3. Copy the private link and send it using your existing customer contact channel. Automatic email/Zoho Mail delivery is not implemented. Links expire after 30 days. Generating another link invalidates the previous link. Keep the link private; it grants access to order-payment details. Only its hash is stored in the database, so copy it when created; regenerate if lost.
4. Customer opens the link, sees final total/deposit/balance, and pays using the order-code `-BAL` reference. The page never requests their address again and never marks payment verified based on their visit. If the balance is zero, no further payment is requested.
5. Match the remaining payment to your bank record; enter the exact amount and transaction reference in **Verify remaining payment**. Partial payments, overpayments and refunds require manual reconciliation; do not change a final amount to disguise them. This version supports one deposit and one final balance, not a general payment ledger.
6. When the goods are actually ready and fully paid, choose **Mark ready for collection / delivery**.
7. At collection, search the order code, check the customer's contact details and hand over the full order. Enter the name of the person collecting and choose **Confirm collection**. Delivery orders use **Mark delivered** with a recipient/proof reference. The whole order is marked fulfilled; partial handovers are not supported.

The database blocks fulfilment before full payment/readiness and prevents repeated clicks from recording a second handover. It records actor, time and relevant amounts/references in private `order_activity`. Fulfilled and refunded orders cannot proceed through payment/collection actions. To correct an erroneous verification or fulfilment record, arrange a controlled database correction; a reversal interface is not included.

## Existing orders

Existing addresses remain missing; no addresses are invented. Collect them directly where required and arrange an authorised update. Already-verified orders without a deposit snapshot require **Record historical deposit** using the bank record before balance requests become available. Review legacy collection/delivery preference, which defaults to collection, before fulfilment. Existing orders remain visible.

The old one-click verification action is disabled because it could skip payment evidence. Anonymous duplicate submissions no longer disclose a saved order code. Customers should retain their original code; support handles recovery.

## Controlled acceptance test

Submit a test order with a six-digit postal code. Find it by code and by email. Verify the deposit using a controlled bank record; set a reviewed final total; open the private balance link. Confirm that unpaid orders have no collection action. Verify the remaining payment, mark ready, and record collection; confirm timestamp/actor/recipient and that a repeated request does not create duplicate activity. Also test a zero balance, a refunded order, a wrong amount, a replaced link, admin sign-out and an older order missing an address. Keep test payments separate from actual customer demand.

Email verification, automated banking reconciliation, Zoho Books, payment-reminder emails, scheduled refresh and automatic delivery tracking remain separate integrations.

## Warehouse collection checklist

Open `/admin?mode=collection` (or click **Collection checklist** in the dashboard). Search for the customer’s order code, name, phone or email. The awaiting list shows collection orders with a verified deposit and marked ready. Inline check-off is available only when the final total is confirmed and all money is paid. Check the quantity and contact details, update **Collected by** if someone else is collecting, tick **Order checked and all items handed over**, then choose **Mark collected**. The order leaves the awaiting list; switch to **Collected** to see recipient, staff member and timestamp. Repeated clicks or two warehouse staff submitting the same order do not record a duplicate handover. This marks the entire order, not individual units. Undo is not an ordinary toggle; corrections require a controlled review. Refresh the list as needed during a warehouse session.

## Security review updates

Use the latest copy of `order_fulfilment.sql`: this review added a trusted transactional registration RPC, longer new order codes, expiring balance links, rejection of reused bank references and revocation of legacy column grants. If an earlier version was already applied, run the entire updated file again. Previously generated balance links without an expiry become unavailable; regenerate unpaid balance requests. New order registrations no longer automatically upsert Zoho Contacts or create Deals while customer email ownership is unverified. Campaign CRM sync is separate. Payments/collection continue to work in Supabase; email verification remains a public-launch prerequisite.

One bank reference cannot be reused across deposits/balances or different orders. If a customer combines orders into one transfer, reconcile it manually; split-payment allocation is not supported by this workflow. Lookup is rate limited. New codes are longer; existing codes still work.
