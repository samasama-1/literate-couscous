# SamaSama campaign owner manual

## Start here

The homepage temporarily redirects to `/coming-soon` (307, preserving query parameters). Deploy this code to enable it on your public domain; no DNS changes are required for an already connected domain. The holding page has no header, footer or navigation links. To restore the original homepage, set the hosting environment variable `COMING_SOON_MODE=false` and redeploy/restart. Other routes, including admin and campaign previews, remain directly accessible; this is a temporary homepage destination, not site-wide access control.

You now have two ways to try the four-product page:

1. **Visual preview:** open `/campaign-preview` on the running site. It contains Everyday Air (hairdryer, S$99), Studio Air (hairdryer, S$109), Double Stack Steamer/Airfryer (S$219), and Single Stack Steamer/Airfryer (S$209). It works without campaign database setup. Picks stay in the page; nothing is saved or emailed. Reload to start over.
2. **Saved test campaign:** once database setup is complete, sign in at `/admin/login`, open **Campaign pages** at `/admin/campaigns/manage`, and click **Create four-product test campaign**. Each click creates a separate draft with a unique address. This is an editable copy, not your live launch page. It records test responses when activated but sends no confirmation emails. Test data is excluded from the default live dashboard.

The four cards now use your supplied product images. The displayed prices are S$99, S$109, S$219 and S$209 respectively, as provided by Marcus. The page asks about product interest, not willingness to buy at a particular price. Users choose either “Yes, I’m interested” or “No, I’m just voting”. Older Maybe responses remain in admin history but cannot be submitted through the current form. Technical details come from the supplier presentations where available; missing specifications are marked to be confirmed. Approve final specifications, images and prices before launching a separate live campaign. The internal supplier/model mapping is in `docs/campaign-product-sources.md`. Newly created test campaigns use these updated cards; previously saved campaigns must be edited separately. This is one favourite across four products, not one vote per category. You can instead create separate hairdryer and air-fryer campaigns if you want one choice in each category.

## Edit your page without code

1. Go to **Campaign pages** and choose **Edit content**.
2. Set the internal campaign name. This also appears as the small label above the headline.
3. Choose the page address, for example `first-home-drop`. The public URL becomes `/campaign/first-home-drop`. Use lowercase words and hyphens. Avoid changing this once you have shared links or started ads.
4. Edit the headline, introduction, search/share description, submit-button wording, and success message.
5. Edit each product's public name, category label, short description, “Best for”, “Why shortlisted”, trade-off, estimated SGD price, and specifications. Enter one specification per line, up to five.
6. Paste a public HTTPS image URL or a local site path. The included product images use `/campaign-products/hairdryer-a.webp`, `/campaign-products/hairdryer-b.webp`, `/campaign-products/air-fryer-a.webp`, and `/campaign-products/air-fryer-b.webp`, in the same order as the four products above. The editor does not upload images yet. For real photos, upload a resized image to your existing public image hosting/storage and paste its direct URL. Do not paste a private supplier file or link that needs a login.
7. Click **Move up** / **Move down** to arrange the cards. Use **Add product option** for another card. Uncheck **Show this option** to hide an existing option. Existing options are retained for historical leads; only unsaved new cards can be removed.
8. Save, then choose **Preview saved page**. Preview reflects saved changes, not unsaved edits. Preview submissions never save or email, including previews of live campaigns.

At least two visible options are required to make a campaign active. The editor supports up to 20; four is the intended initial setup. No supplier identities, costs, margins, or internal notes belong in these public fields.

## Draft, active, paused and finished pages

- **Draft:** preparation only. The public URL returns not found; use the authenticated admin preview.
- **Active:** accepts picks within any opening/closing times you set.
- **Paused / completed:** shows the campaign heading and a closed message; does not accept picks.
- **Archived:** hidden from the public URL, retained in admin.

Opening and closing times are entered in **Singapore time (UTC+08:00)**. Blank dates mean no scheduled limit. Merely choosing Active does not override a future opening time or an elapsed closing time.

Test mode is fixed when a campaign is created. A saved test campaign cannot be converted into a live one, so its practice votes never become your launch statistics. When ready, choose **Create live campaign** and enter your approved content there. Leave payments off; this page is for demand validation only.

## Review registrations and the journey

Open `/admin/campaigns`. By default, it shows **Live campaigns**. Switch **Data** to **Test campaigns** for your saved test page, select its campaign name, and apply filters.

Filter by campaign, product, intent, lifecycle status, UTM source, UTM campaign, creative (`utm_content`), email/phone search, or registration dates. Dates use Singapore time. The table displays 50 leads per page, but totals and CSV exports use the complete matching result set.

Click an email to see its selected product, recorded price, intent, consent, attribution, timeline and confirmation-email delivery records. New anonymous views/selections are associated with the lead at registration through its browser session. The event history retains previous/new choices when somebody re-votes.

The same email has one response per campaign, case-insensitively. A later vote updates that response rather than adding another lead. Original source attribution is retained, and subsequent attribution is recorded in event history. Lifecycle status does not reset when they re-vote. Paid selections cannot be changed through the public vote form.

A browser session is not a verified person: different devices, cookie clearing, repeat visits and shared browsers affect visitor metrics. The displayed registration/visit ratio is a segment ratio, not a guarantee of unique-person conversion. Test campaigns do not fire advertising pixels.

Use fake addresses such as `your-name-test@example.com` for stored testing. The instant visual preview is the best choice if you only want to examine layout and copy.

## Export a segment

For example: select your campaign, select Studio Air, choose **YES**, then **Apply filters → Export CSV**. The CSV contains all matches, not just the displayed page. It includes campaign/test labels and consent/unsubscribe columns. Spreadsheet-formula-like values are neutralized for safer opening.

An exported segment is **not automatically a marketing-permitted audience**. Before marketing, require both `marketing_consent = yes` and `unsubscribed = no`. This change does not add a broadcast-email tool, reservations or payments.

## Zoho CRM

See [Zoho voting sync setup](zoho-voting-sync.md) for the fourth migration, Leads authorization and enable flag. Admin lead details show CRM sync status and a manual retry button. Test campaigns never sync.

## Confirmation emails and unsubscribe

Email sending now requires an explicit `CAMPAIGN_EMAIL_PROVIDER=resend` setting; leave it unset while preparing Zoho Mail. Zoho Mail sending is not implemented yet.

A live registration saves first and creates a confirmation-email job in the same transaction. The app attempts delivery immediately. Missing email configuration or provider failures do not discard the pick.

In a lead's detail page:

- **Queued:** not yet sent; often configuration is missing.
- **Sending:** a delivery attempt has started.
- **Sent:** the provider accepted the request; this is not proof of inbox delivery or reading.
- **Failed:** see the error and retry after correcting the issue.

After configuring email, use **Retry confirmation** in the lead detail. There is no automatic scheduled retry worker in this version. Retries reuse the delivery's unique provider key. Ambiguous attempts older than 23 hours are blocked: check the provider log before asking for a manual resend, to avoid sending twice. Resend documents a 24-hour deduplication window: https://resend.com/changelog/idempotency-keys.

Test campaigns do not queue or send confirmation emails. The full live inbox/visitor journey test is intentionally deferred until your front end and sender are ready.

Marketing consent starts unchecked. A transactional confirmation can be sent without marketing consent. Unsubscribe links use a signed token, not an editable email-address parameter. Unsubscribing updates the central contact; it does not erase their vote or paid lifecycle stage. Old email-only unsubscribe URLs require a new signed link.

## One-time technical setup

These steps need to be completed on the selected test/deployment environment before the admin editor or stored registrations can work. They have not been applied to your live Supabase project by this implementation.

1. In Supabase SQL Editor, run the following files **in order** against the existing SamaSama schema:
   - `database/sql/add_campaign_lead_system.sql` (original campaign tables; if already applied, do not needlessly recreate them).
   - `database/sql/harden_campaign_lead_system.sql` (transactions, signed-session linkage support, durable outbox fields and shared rate limits).
   - `database/sql/campaign_content_editor.sql` (atomic content-editor save function).
2. These migrations retain existing contacts/leads and create no fake production campaign. Do not run the older hairdryer seed in production. Create the four-product test from admin instead.
3. Configure the existing Supabase URL, anonymous key, server-only service-role key and `ADMIN_EMAILS` allowlist. Use the existing admin login.
4. Set a long random **server-only** `CAMPAIGN_SIGNING_SECRET` before sending live emails. If absent, the service-role key is used as a fallback. Keep the signing secret stable; changing it invalidates existing unsubscribe links and session cookies.
5. When ready for live confirmation emails, verify your sender domain with Resend and set `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `SamaSama <hello@your-verified-domain>`), optional `EMAIL_REPLY_TO`, and `NEXT_PUBLIC_SITE_URL` (the full canonical `https://…` address). Never place secrets in variables prefixed `NEXT_PUBLIC_`.
6. Optional pixel IDs are `NEXT_PUBLIC_META_PIXEL_ID` and `NEXT_PUBLIC_TIKTOK_PIXEL_ID`. They are absent locally. Leave them unset while testing. Hooks run on live campaign pages only, not admin previews/test campaigns; confirm your desired consent setup before enabling them.
7. Deploy/restart after changing environment variables. The direct preview is `/campaign-preview`; admin editing is `/admin/campaigns/manage`.

For local work (Node 22.18+ or the current Node 26 runtime):

```sh
npm install
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

Tests use embedded PostgreSQL (PGlite) and never connect to your live database or send email. They exercise migrations, registration updates, history linking, idempotent request replay, inactive/foreign product rejection, consent, test-mode isolation, rate limiting and RLS. A real concurrent multi-connection deployment should still be checked during live-environment acceptance; the embedded database serializes its connection.

## When the front end is ready

Use a separate live staging campaign and your own email for one full test: tagged social URL → choice → Yes, I’m interested → registration → inbox → admin timeline → CSV → changed vote with the same email. Also verify non-admin access, declined consent, paused campaigns, and provider failure. This live test has not been represented as completed.

After launch validation, the next layer is refundable reservations with payment records linked to these lead IDs, then deposits/orders. That remains separate from this voting-page work.
