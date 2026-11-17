# Campaign registration — single-step revision

Updated 17 November 2026 · supersedes the 16 November owner-review proposal

Marcus chose registration → acknowledgement/eligible personal discount code, with **no reconfirmation, private review page or second marketing checkbox**. His supplied E02 copy is implemented locally. See [the email register](customer-email-drafts.md) and [launch checklist](website-launch-checklist.md). Previous preview confirmation screens are obsolete; they do not describe the current journey.

## Customer and data flow

1. Customer selects a product and submits email, optional phone/Telegram and the optional unchecked marketing checkbox.
2. New contacts and their first campaign pick are saved immediately; selected marketing preference is single opt-in evidence, not proof of inbox ownership. No verification token/request is generated.
3. One acknowledgement includes the original personal code when eligible. No click, reconfirmation, marketing consent or payment is required to receive it.
4. Public repeat submissions cannot overwrite an existing contact's phone, Telegram, marketing preference/unsubscribe or existing campaign selection. Paid records remain protected. Customer corrections go through hello@samasama.sg; acknowledgement wording must not be interpreted as confirmation of an existing-record change.
5. Requests are idempotent. A ten-minute repeat-email cooldown suppresses another acknowledgement for an existing registration. Subsequent permitted messages reuse the original coupon and expiry; there is no new coupon or expiry extension.
6. Only known-unsent new-flow jobs qualify for bounded retries. Unknown sends, old queues and exhausted retries require admin reconciliation. Receipt is not verified payment or verified email ownership.

The initial checkbox is the only marketing choice in the public journey. An unchecked box on a repeat does not unsubscribe an existing contact, and a checked box never reverses an existing unsubscribe. The signed unsubscribe link remains available in the email. No old opt-in is retrospectively certified or rewritten.

## Email

Subject when an eligible code is available: **Your pick is in—here’s your S$10 thank-you**. Preview text: **Thanks for helping shape what SamaSama brings in next.**

The customer's body is preserved, with dynamic product/price/code/original Singapore-time expiry, “Hi,” when no first name is collected, a dynamic product in the support question, linked How It Works/offer-specific Terms and the existing unsubscribe link. The olive/linen presentation-table design includes a decorative parcel illustration; all offer/code/expiry information remains text and survives image blocking. The S$50 minimum is retained explicitly. No confirmation instructions or private review link appear. The neutral subject and no-code variant avoid promising an unavailable reward.

The sample 16 May 2027 expiry is not fixed in code. Coupon rules remain any eligible product, S$10/unit, maximum ten units, minimum S$50/unit before discount, first order, six calendar months from original issue, deposit unchanged. Marcus approved the wording “each eligible unit in your first order”; eligibility across SamaSama products is explicit. The dedicated /campaign-offer-terms page is prepared locally and linked from both email formats.

## Prepared changes

- `database/sql/campaign_registration_safety.sql`: safe first-write registration, two-argument `register_campaign_intent_v2(jsonb,jsonb)`, optional new-contact fields/consent, preserved existing records, repeat-message cooldown, indexed/bounded retry claims, redacted health RPCs and bounded rate-limit cleanup. RLS, postgres ownership, qualified safe search paths and service-only EXECUTE remain. No owner-request table or verification RPCs are installed by this revised draft.
- `src/lib/campaigns/messages.ts`: customer-approved text/HTML acknowledgement with escaped dynamic content, preheader, links and conditional reward.
- `src/lib/campaigns/email.ts`: sends that message through existing durable compare-and-set delivery and shared mailbox budget; no owner-link lookup or token generation.
- Registration form/actions: no additional confirmation; public result does not expose whether the email already existed, coupon material or actual delivery status.
- Existing authenticated email worker: urgent/order jobs first, then at most five campaign candidates using shared V2 pacing and cached provider preparation. No additional cron or scheduled invocation.
- Admin Campaign acknowledgement emails report: recent sample capped at 100, last worker counts and next candidate due; not a complete backlog count.
- Unshipped owner-review page/actions/crypto and their page-specific configuration are removed. Collection/payment owner links and identity/payment safeguards remain unchanged.

## Controlled rollout — separate approval still required

1. Review current deployment/schema, shared V2 mailbox runtime and actual provider allowance. Confirm the campaign/CRM/discount/runtime prerequisites, final offer terms, safe sender/reply configuration and campaign-specific success text. Reconcile historical jobs and opt-in evidence separately.
2. This file replaces an **unapplied local proposal**, not an upgrade script for an already-installed owner-review schema. If that earlier proposal was applied anywhere, stop and prepare a separate compatibility migration; do not delete historical data or blindly layer this file over old verification RPCs.
3. After approval, apply the revised complete SQL as postgres in the correct project. It uses five-second lock and 45-second statement timeouts; DDL/indexes can briefly block writes. Do not rerun older campaign hardening definitions afterward.
4. Deploy matching code. `CAMPAIGN_REGISTRATION_V2=true` selects the safe single-step RPC. `CAMPAIGN_CONFIRMATION_RETRIES_ENABLED=true` enables the bounded consumer only after acceptance. Both default off in source. Confirm compatible `ORDER_RUNTIME_V2=true`, `CAMPAIGN_EMAIL_PROVIDER=zoho` and reviewed actual shared sending limits; never enable unreviewed runtime settings just to turn this on.
5. Keep retries off for initial controlled owned-inbox checks, approved separately: new/no-consent registration, optional first opt-in, repeats, existing unsubscribe/contact preservation, original code/expiry, inactive campaign/price change, delivery ambiguity, CRM results and rendered email links/replies. Ensure the discount installation setting and campaign issuance control are enabled only when separately approved.
6. Enable retries after acceptance; confirm actual scheduler HTTP/outbox outcomes and report freshness. Historical jobs are excluded from automatic retry. Never reset uncertain sends to “not sent”.

Rollback: close public campaigns and disable new-flow/retry flags while resolving issues. Preserve safe SQL, existing preferences, coupon/financial records and job outcomes. Do not restore public overwrite/re-subscribe behavior. Other order/payment/collection workers remain separate.

## Performance and remaining operational checks

No extra owner-request reads/writes, token generation, confirmation endpoint or confirmation email. Registration uses indexed identity/request lookups and transaction locks. Known-unsent retries piggyback on the existing worker, at most five candidate claims/pass, six claims/job with bounded backoff. At five-minute scheduling this is at most 60 candidate claims/hour, not guaranteed deliveries; provider budgets, urgent reservations, ambiguity and preparation failures constrain throughput. Expected 50 registrations/hour can still build a backlog if immediate delivery fails.

Each worker pass deletes at most 100 expired rate-limit rows using an expiry index and SKIP LOCKED; no cleanup scan runs in customer requests. Anonymous-event linking is indexed/capped at 100. Reports are bounded. Delivery transport/time limits and provider-secret handling are unchanged. Fees, collection identity, bank verification, audits and operational exports are not weakened.

Independent PostgreSQL-session contention, actual sender allowance, owned-inbox acceptance, current production settings/log redaction and historical-queue review remain outstanding. This revision passed 127 local tests and the production webpack build with external network calls disabled. The prior 130-test result covered the superseded confirmation-page design; verification-only tests were replaced by single-step registration/consent/copy coverage. Local PGlite does not establish independent-session PostgreSQL lock timing. No real provider, inbox or database was contacted.
