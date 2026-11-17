# Internal shortlist source register

Historical evidence recorded 22 September 2026; planned lineup updated 16 November 2026; local preview aligned 17 November 2026. Internal reference only; do not copy supplier names, model codes or this document into public campaign fields without approval.

## Planned launch lineup — confirmed 16 November

Marcus confirmed two hairdryers and two air fryers for the launch-copy review:

| Category | Supplier | Model supplied on 16 November | Public name / starting price — confirmed 16 November |
| --- | --- | --- | --- |
| Hairdryer | Ryaca | BY-5988 | Studio-Air / S$119 |
| Hairdryer | VGO | VGO-1 | Everyday Air / S$109 |
| Air fryer | Biyi | AFS-729 | Single Stack Steamer/Airfryer / S$219 |
| Air fryer | Careline | TTDS-1101-A | Double Stack Steamer/Airfryer / S$229 |

The model labels above are the current planning input, not proof of specifications or image compatibility. Earlier VGO evidence uses **VH01** and Biyi evidence uses **AFS-729A**. Confirm whether these are the same units or revised models before reusing their photos, specifications, certifications or test results. Do not silently equate them. The historical source records below do not authorise publishing supplier names. No live campaign data has been changed.

### Approved three-tier product prices — 16 November

Revised at Marcus’s request: **S$10 added to every tier**, superseding the earlier 16 November prices. Deposits are recalculated at 50% of the revised Tier 1 price. Tier quantities and hard limits are unchanged.

All amounts are SGD per unit, before the separate eligible campaign reward and any agreed delivery charges. Do not present the best tier as guaranteed or deduct the reward from the advertised starting price without showing its separate conditions.

| Public product | Tier 1 / starting | Tier 2 | Tier 3 / best |
| --- | --- | --- | --- |
| Studio-Air | S$119 | S$109 | S$99 |
| Everyday Air | S$109 | S$99 | S$89 |
| Single Stack Steamer/Airfryer | S$219 | S$209 | S$199 |
| Double Stack Steamer/Airfryer | S$229 | S$219 | S$209 |

### Approved tier separators — 16 November

Ranges are inclusive and refer to verified units, not interest submissions or customer counts. Multi-unit verified orders contribute their quantity. These ranges describe the batch participation level that selects its per-unit tier; they are not marginal price bands charging early units differently from later units.

| Public product | Tier 1 | Tier 2 | Tier 3 | Hard order limit |
| --- | --- | --- | --- | --- |
| Studio-Air | 1–423 units · S$119 | 424–712 units · S$109 | 713–1,000 units · S$99 | 1,000 |
| Everyday Air | 1–448 units · S$109 | 449–724 units · S$99 | 725–1,000 units · S$89 | 1,000 |
| Single Stack Steamer/Airfryer | 1–461 units · S$219 | 462–782 units · S$209 | 783–1,103 units · S$199 | 1,103 |
| Double Stack Steamer/Airfryer | 1–490 units · S$229 | 491–800 units · S$219 | 801–1,109 units · S$209 | 1,109 |

Store explicit Tier 2/Tier 3 starting quantities per batch: **424/713**, **449/725**, **462/783**, **491/801** respectively. The earlier public batch page derived tier starts from 25%/70% of target capacity, with inconsistent milestone rounding. The replacement explicit-tier implementation is complete and Marcus reported the preceding rollout completed; verify actual installed versions/configuration and consistency across price tables, current price, next-unlock text, progress markers and admin/final-pricing workflow. Test each boundary immediately below, at and above the threshold, including a multi-unit order crossing it. Starting-price display before any verified order should remain Tier 1; the maximum-capacity endpoints do not define the minimum-to-proceed counts specified below, or an automatic batch-success/cancellation rule.

### Approved deposits and hard limits — 16 November

Marcus confirmed a deposit of **50% of the Tier 1 price per unit**, fixed independently of later tier reductions. The existing approved campaign reward does not reduce the deposit; deduct it from the final product total/balance. Multiply the per-unit deposit by order quantity using integer cents.

| Public product | Tier 1 price | Deposit per unit | Deposit in cents | Hard unit limit |
| --- | --- | --- | --- | --- |
| Studio-Air | S$119 | S$59.50 | 5,950 | 1,000 |
| Everyday Air | S$109 | S$54.50 | 5,450 | 1,000 |
| Single Stack Steamer/Airfryer | S$219 | S$109.50 | 10,950 | 1,103 |
| Double Stack Steamer/Airfryer | S$229 | S$114.50 | 11,450 | 1,109 |

The range endpoints are hard order limits, not only progress targets. Marcus approved **verified-only allocation**: pending order submissions and interest registrations do not reserve capacity or advance price tiers. There is no expiry job or automatic cancellation. Units are allocated only when an admin verifies the deposit and the database atomically confirms remaining capacity. The same guard covers concurrent/multi-unit orders with and without a coupon. Near capacity a customer may pay before availability is confirmed; admins must reconcile the receipt and resolve any approved refund instead of over-confirming. See [the local implementation](verified-batch-capacity.md). Existing explicit refund-status changes retain the previous verified-count semantics; this feature adds no automatic refund or stock-return process.

### Approved minimum verified participation to proceed — 16 November

Marcus confirmed that the **upper end of Tier 1** is the minimum verified unit count needed before each batch can proceed:

| Public product | Minimum verified units | Price at that minimum | Tier 2 starts | Hard unit limit |
| --- | --- | --- | --- | --- |
| Studio-Air | 423 | S$119/unit | 424 | 1,000 |
| Everyday Air | 448 | S$109/unit | 449 | 1,000 |
| Single Stack Steamer/Airfryer | 461 | S$219/unit | 462 | 1,103 |
| Double Stack Steamer/Airfryer | 490 | S$229/unit | 491 | 1,109 |

Interest registrations and unpaid orders do not count towards these verified-participation minimums. Below the minimum a batch cannot proceed; at the minimum it meets the participation requirement at Tier 1 pricing. The next verified unit unlocks Tier 2 for that batch, under the agreed final-price rules for eligible orders. The minimum is distinct from its hard capacity limit.

Meeting the minimum does not itself close a batch, lock final prices, approve procurement, send outcome emails or trigger a refund. Keep those lifecycle actions separate; the exact closing deadline and handling of reductions/refunds before final approval still need an operational rule. The confirmed minimum must gate the decision to proceed, rather than relying on a presentation-only milestone. Test minimum minus one, minimum, and minimum plus one, and re-check authoritative verified quantities at the decision point.

These are copy/configuration decisions recorded locally; no production batch/campaign records or checkout configuration have been changed.

## Historical shortlist and evidence — 22 September

| Public card | Supplier / model supplied by Marcus | Displayed price | Public asset |
| --- | --- | --- | --- |
| Everyday Air / Hairdryer A | VGO VH01 | S$99 | `/campaign-products/hairdryer-a.webp` |
| Studio Air / Hairdryer B | Ryaca BY-5988 | S$109 | `/campaign-products/hairdryer-b.webp` |
| Double Stack Steamer/Airfryer / Air fryer A | Careline TTDS-1101-A | S$219 | `/campaign-products/air-fryer-a.webp` |
| Single Stack Steamer/Airfryer / Air fryer B | Biyi AFS-729A | S$209 | `/campaign-products/air-fryer-b.webp` |

Marcus provided these updated listing names and prices on 22 September 2026. The interest question has two answers (yes/no), without price-testing language. Prices remain visible on the cards and are retained with the response for historical context; a yes response indicates product interest, not a commitment to pay.

## Source evidence and limitations

- **VGO:** `VH01 (1).png` from the supplied VH01 series is the white front view used on the card. The photos support the visible controls, base intake and white/graphite finishes. No technical specification sheet was supplied; wattage, motor speed and weight remain unconfirmed.
- **Ryaca:** `Ryaca BY-5988.pptx` identifies BY-5988 on slide 3. Slides 4–7 describe 1,600 W at 220–240 V, a 110,000 rpm BLDC motor, LED display, three speed/heat settings, cool air and a rotating folding handle. The public image is the blue/gold two-view image extracted as `ppt/media/image18.jpeg`. Both views depict one model, not a two-product bundle. Final colour and included accessories need confirmation. Specifications are supplier claims, not independent test results.
- **Careline:** `2025Q301-自研TTD11L+ST-20260902.pptx` describes the Double Stack TTD+ST: 11 L total, 4.5 L upper steam/steam-bake zone, 6.5 L lower air-fry/roast/toast zone, 600 ml water tank and 270 × 412 × 446 mm dimensions (width × depth × height). The exact TTDS-1101-A mapping comes from Marcus; confirm it against the final supplier specification. Power differs by regional version in the deck, so it is omitted pending confirmation of the Singapore unit. The source product image is `ppt/media/image2.png`. Its printed Careline wordmark was removed with an AI image edit for the neutral preview; approve the edited image against final launch photography before publication.
- **Biyi:** `photo_2026-09-22_17-06-37.jpg` supplies the three-quarter view used on the card; the other supplied JPEG is the front view. The photos support a single drawer, viewing window and digital front panel. The Steamer/Airfryer naming was subsequently supplied by Marcus. Capacity, wattage and specific cooking modes were not supplied and are not guessed.

Only the four optimized WebP images are served publicly. Original presentations and unused supplier images have not been copied into the public directory. Public names stay neutral.

## Updating the shortlist

Use **Admin → Campaign pages → Edit content** to change names, prices, specifications and image paths, then save and preview. See `campaign-owner-manual.md` for the full workflow. Existing saved campaigns retain their saved content; this update changes the instant preview and the template for newly created test campaigns. Prepare a separate live campaign with approved prices and content when ready.

## Local preview alignment — 17 November

The four-product visual preview and future test-campaign template now use the approved Tier 1 prices above and Studio-Air naming. Preview selection/submission remains local-only and creates no saved registration, coupon or email. Offer terms are visible when the preview is explicitly configured to show the offer; this does not enable real issuance. Existing saved live campaigns must be checked/edited separately in Admin. Specifications/images remain subject to the evidence/model-mapping checks above; price alignment does not approve those claims.
