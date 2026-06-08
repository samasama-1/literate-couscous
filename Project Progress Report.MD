# Sama Sama Platform: Progress & Roadmap Report

*Last updated: 20 May 2026*

This document consolidates the current state of the Sama Sama group-buy platform, the architecture in place, completed product work, and the remaining launch checklist.

---

## 1. Visual Design & Homepage

The frontend has been migrated toward a premium, editorial, wabi-sabi / Muji-inspired visual direction.

### Core Design System

- Warm linen off-white background (`#FAF8F5`), sand surface panels (`#F5F2EB`), soft warm borders (`#E2DCD0`), and olive / sage green accents (`#4A533C`).
- Serif-led editorial display typography direction via `var(--font-display)`, paired with readable sans body typography via `var(--font-body)`.
- Minimal rounded geometry, restrained shadows, warm spacing, and quiet premium UI surfaces.
- Google font runtime dependency has been removed from `next/font/google` so production builds do not fail when Google Fonts are unavailable. CSS still prefers the intended font stack.

### Homepage Redesign

The homepage (`/`) has been redesigned around the new editorial section order:

1. **Premium product-led hero**
   - Large editorial headline.
   - Featured active lobang card powered by the first active batch from `batch_progress_view`.
   - Hero image uses `product.image_url` when available.
   - Local static fallback image added at `public/placeholder-air-fryer.png`.

2. **The Sama Sama Method**
   - Three-step explanation:
     - Choose a Lobang
     - Join with Deposit
     - Unlock Better Price Together

3. **Active Collections**
   - Active group buys shown as curated product cards.
   - Cards continue to use the existing batch and product data.
   - Shows image, status, batch price, deposit, confirmed quantity, remaining units, progress, and CTA.
   - Progress bars include visual tier milestone markers using `batch_progress_view.confirmed_quantity` as the source of truth.
   - TODO: Exact tier thresholds are currently presentation assumptions at approximately 25%, 70%, and 100% of target capacity; these should eventually come from a `pricing_tiers` table or per-batch tier configuration.

4. **Community CTA**
   - Keeps the current community-oriented closing section.

No backend logic, Supabase client/admin files, order logic, payment logic, Zoho logic, SetMore logic, lookup logic, database schema, or package dependencies were changed as part of the homepage redesign.

---

## 2. Frontend Pages & Components

### Core User Journey

- `/` — Homepage with live active collections.
- `/how-it-works` — Process explainer. Its “Browse Active Batches” CTA currently routes back to the homepage active collections section (`/#deals`) until a dedicated products or collections index is needed.
- `/group-buys/[id]` — Batch detail page with product specs, tier display, progress, community/referral CTAs, and joining CTA.
- `/group-buys/[id]/join` — Checkout / reservation flow.
- `/lookup` — Customer order lookup via order code and phone/email.
- `/appointments` — SetMore appointment booking page with fallback placeholder when URL is not configured.
- `/admin` — Admin dashboard for order verification and lobang creation.

### Shared Components

- `Header.tsx` — Minimalist Sama Sama header.
- `Footer.tsx` — Multi-column footer with shop, learn, company, and policy links.
- `JoinGroupBuyForm.tsx` — Customer reservation form with country code selector, validation, and duplicate pending order resume state.
- `OrderLookupForm.tsx` — Secure customer lookup UI.
- `CreateLobangForm.tsx` — Admin lobang creation form.
- `PolicyPage.tsx` — Reusable renderer for internal policy/documentation pages.

---

## 3. Internal Documentation & Policy Pages

New customer-facing documentation pages have been created from the provided Google Doc source copy.

### Implemented Routes

- `/terms` — Terms & Conditions.
- `/privacy` — Privacy Policy / PDPA Notice.
- `/refunds-and-replacements` — Combined Refund & Cancellation Policy plus Replacement / DOA Policy.
- `/collection-delivery` — Collection & Delivery Policy.
- `/referrals` — Referral & Store Credit Terms.

### Excluded For Now

The following sections were intentionally left out for now:

- Product Safety & Usage Notice.
- Air Fryer Safety Addendum.
- Product-Specific Campaign Terms Template.

Policy content is stored in `src/lib/policies.ts` and rendered through `src/components/PolicyPage.tsx`.

---

## 4. Database Architecture (Supabase)

The platform is backed by a relational Supabase Postgres setup.

### Core Tables

- `products` — Product name, description, retail price, image URL, features, and metadata.
- `batches` — Active group-buy batches linked to products, including target capacity, deposit amount, tier pricing, closing date, and status.
- `orders` — Customer reservations linked to batches, including name, phone, email, quantity, order code, and payment status.

### Views

- `batch_progress_view` — Source of truth for homepage and batch progress display, including `confirmed_quantity` and `remaining_capacity`.

### Security & Privacy

- Public read access for products and batches.
- Orders are locked down from public SELECT access.
- Public order inserts are restricted to pending PayNow status.
- Pending duplicate orders are prevented through a partial unique index by batch and normalized phone.

### Required Migration

`database/sql/add_order_codes.sql` must be run in Supabase before live order-taking because the app expects `orders.order_code` and the duplicate pending-order index to exist.

---

## 5. Security & Authentication

### Admin Authentication

- Cookie-based Supabase Auth using `@supabase/ssr`.
- Admin route protection implemented through `src/proxy.ts` for Next.js 16.
- Admin allowlist controlled by `ADMIN_EMAILS`.
- Admin Server Actions call `verifyAdminAccess()`.
- Service role client uses `server-only` in `src/lib/supabaseAdmin.ts`.

### Server-Side Safety

- Supabase clients are typed using `src/types/database.ts`.
- Type definitions include Supabase relationship metadata needed by the current Supabase client.

---

## 6. Third-Party Integrations

### Zoho CRM

Implemented but pending production activation:

- New orders can sync contacts into Zoho CRM.
- New orders can create Zoho deals at `Deposit Pending`.
- Admin verification can move Zoho deals to `Deposit Verified`.
- Sync is non-blocking and does not block the customer order flow.

### SetMore

Implemented but pending production activation:

- `/appointments` embeds the configured SetMore booking URL.
- If `NEXT_PUBLIC_SETMORE_URL` is not set, a professional coming-soon placeholder is displayed.

---

## 7. Validation Status

The app currently passes:

```bash
npm run lint
npm run build
```

The latest build includes the following static and dynamic routes:

- `/`
- `/admin`
- `/admin/login`
- `/appointments`
- `/collection-delivery`
- `/faq`
- `/group-buys/[id]`
- `/group-buys/[id]/join`
- `/how-it-works`
- `/lookup`
- `/privacy`
- `/referrals`
- `/refunds-and-replacements`
- `/terms`
- `/why-factory-direct`

---

## 8. Directory & File Structure

```text
group-buy-app/
├── database/sql/
│   ├── add_order_codes.sql
│   ├── supabase_orders_security_update.sql
│   ├── supabase_schema.sql
│   ├── supabase_security_update.sql
│   └── supabase_view_fix.sql
├── public/
│   ├── logo.png
│   └── placeholder-air-fryer.png
├── src/
│   ├── proxy.ts
│   ├── app/
│   │   ├── page.tsx
│   │   ├── admin/
│   │   ├── appointments/
│   │   ├── collection-delivery/
│   │   ├── privacy/
│   │   ├── referrals/
│   │   ├── refunds-and-replacements/
│   │   ├── terms/
│   │   ├── actions/
│   │   ├── group-buys/
│   │   └── lookup/
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── JoinGroupBuyForm.tsx
│   │   ├── OrderLookupForm.tsx
│   │   ├── CreateLobangForm.tsx
│   │   └── PolicyPage.tsx
│   ├── lib/
│   │   ├── policies.ts
│   │   ├── supabase.ts
│   │   ├── supabaseAdmin.ts
│   │   └── supabaseServer.ts
│   └── types/
│       └── database.ts
```

---

## 9. Pending Launch Action Items

- [ ] Run `database/sql/add_order_codes.sql` in Supabase.
- [ ] Activate Zoho CRM by generating a refresh token and updating `.env.local` / Vercel env vars.
- [ ] Activate SetMore by setting `NEXT_PUBLIC_SETMORE_URL`.
- [ ] Create the admin user in Supabase Auth.
- [ ] Add the admin email to `ADMIN_EMAILS`.
- [ ] Replace placeholder business details in policy copy, including company name, email, phone / WhatsApp, and address where needed.
- [ ] Replace placeholder product image with production `product.image_url` values per batch.
- [ ] Review phone normalization and duplicate pending-order behavior before public launch.
- [ ] Decide whether pending PayNow orders should expire automatically after a defined window.

---

## 10. Roadmap

### Priority 1: Production Readiness

- Apply Supabase migrations.
- Finalize environment variables in Vercel.
- Verify admin login, order verification, lookup, and appointment pages in production.
- Review legal/policy placeholders.

### Priority 2: Account Creation & Referrals

- Customer accounts via Supabase Auth.
- Referral tracking table and customer referral links.
- Store credit visibility and usage rules.

### Priority 3: Notifications & Automation

- Build a server-only customer notification layer for transactional emails.
- Support template variables including customer name, order code, product name, quantity, deposit amount, deposit paid, payment status, final price, balance due, confirmed quantity, target capacity, current price, next price, next milestone, lookup URL, batch URL, appointment URL, collection address, collection window, and support WhatsApp.
- Start with two core email triggers:
  - Order created / deposit instructions after successful reservation.
  - Deposit verified after admin payment verification.
- Add reusable email template rendering so templates can use placeholders such as `{{customer_name}}`, `{{order_code}}`, and `{{lookup_url}}`.
- Keep sending non-blocking where possible so email provider failures do not break checkout or admin verification.
- Evaluate provider options such as Zoho ZeptoMail, Zoho Mail, Resend, SendGrid, or Postmark.
- Later notification types:
  - Batch price unlocked.
  - Batch closed.
  - Ready for collection.
  - Collection reminder.
  - Refund or cancellation notice.
- Admin or operations alerts for new pending orders.

### Priority 4: Payment Automation

- Dynamic PayNow QR or payment gateway integration.
- HitPay or Stripe evaluation.
- Webhook-driven auto-verification.
