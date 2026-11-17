# Campaign email appearance and offer terms

Prepared locally on 17 November 2026. No deployment, remote SQL, test/customer send or production settings change.

## Changes

- The existing renderer uses olive, warm linen and white with a selectable coupon panel, exact original Singapore-time expiry, legible 16px body copy, plain-text alternative and presentation-table HTML. All commercial data remains text when images are blocked. The existing durable delivery/queue/privacy protections are unchanged.
- Revised wording: “Get S$10 off each eligible unit in your first order, for up to 10 units. Use it on any eligible SamaSama product.” The S$50 minimum is explicit.
- `/campaign-offer-terms` explains issuance, any eligible product, per-unit/ten-unit discount, one-product/batch checkout, same email, verified-deposit first-order eligibility, six-calendar-month expiry, reservation, unchanged deposit, final balance, cancellation/refund scope and admin-approved reinstatement. No new fee, commercial right, automatic cancellation, expiry extension or marketing requirement is introduced. This is not a review of all existing general order terms.
- Both email formats link to the dedicated terms. The page uses the existing PolicyPage component, has canonical/social metadata, related-policy/support links and sitemap inclusion. No SQL or new environment variable is needed for these appearance/terms changes; earlier campaign-safety rollout requirements remain separate.
- Current campaign page/product/success wording review remains the next item after visual/terms acceptance, per Marcus’s instruction. Actual Gmail/Zoho/Outlook inbox rendering and replies still require an approved test send; browser QA alone does not prove client-specific rendering.

## Asset provenance

Final asset: `public/email/campaign-thank-you.jpg` (1200 × 400, approximately 86 KiB). Generated with the built-in image-generation tool, then resized/compressed locally for email delivery. Decorative only: it depicts no actual product, warehouse shipment or supplier evidence. The image uses a static first-party path without customer identifiers or tracking parameters. External inbox image loading remains optional.

Prompt: “Use case: ads-marketing. Asset type: decorative banner for SamaSama campaign thank-you email. Create a refined editorial still-life illustration of two small unbranded shipping parcels wrapped with olive paper bands, on warm linen paper, with subtle soft shadows and a restrained sage leaf silhouette. Wide horizontal composition about 3:1, parcels grouped on the right, generous quiet negative space on the left. Warm off-white #FAF8F5, olive #4A533C, pale sage #C0CBB1 and natural kraft paper. Sophisticated minimal paper-cut / softly textured gouache aesthetic. No text, no letters, no numbers, no coupons, no logos, no people, no appliances or product depiction. This is a decorative thank-you illustration, not evidence of a shipment or product.”

## Copy basis

Terms reflect the owner-approved rules and the actual discount SQL. Price/discount qualifiers remain near the offer rather than relying only on a generic terms link. Reference: Singapore CCS [Guidelines on Price Transparency](https://www.ccs.gov.sg/consumer-protection/legislation-and-guidelines/guidelines-on-price-transparency/). This does not assert legal certification or resolve the existing broader general-terms launch review.

## Verification

127 local tests passed, including updated wording, escaped HTML, dedicated terms links, no-code fallback and essential text without images. TypeScript, ESLint, production webpack build and git diff --check passed. The new route was emitted as a static page. Browser checks covered desktop/phone display, image blocking, long sample-code wrapping, terms navigation and no horizontal overflow at a 360px browser viewport. These do not replace approved owned-inbox client acceptance.
