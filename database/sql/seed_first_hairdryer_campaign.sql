-- Optional development seed for the first campaign.
-- Run manually in local/dev Supabase. Do not run automatically in production.

INSERT INTO campaigns (
  name,
  slug,
  description,
  headline,
  subheadline,
  cta_text,
  confirmation_text,
  status
)
VALUES (
  'First Hairdryer Drop',
  'first-hairdryer-drop',
  'A pre-launch vote for the first SamaSama hairdryer shortlist.',
  'We went to the factories. We narrowed it down. You choose what we bring in.',
  'SamaSama shortlisted a few hairdryers we would actually consider bringing to Singapore. Tell us which one you would genuinely want.',
  'Register my pick',
  'We''ll let you know how the vote develops. If this product moves forward, you''ll get first access to the Founding Buyer offer.',
  'active'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  headline = EXCLUDED.headline,
  subheadline = EXCLUDED.subheadline,
  cta_text = EXCLUDED.cta_text,
  confirmation_text = EXCLUDED.confirmation_text,
  status = EXCLUDED.status;

WITH campaign AS (
  SELECT id FROM campaigns WHERE slug = 'first-hairdryer-drop'
)
INSERT INTO campaign_products (
  campaign_id,
  public_name,
  public_label,
  short_description,
  key_benefit,
  key_differentiator,
  specifications,
  tradeoff,
  estimated_price_cents,
  display_order,
  image_url
)
SELECT
  campaign.id,
  product.public_name,
  product.public_label,
  product.short_description,
  product.key_benefit,
  product.key_differentiator,
  product.specifications::jsonb,
  product.tradeoff,
  product.estimated_price_cents,
  product.display_order,
  product.image_url
FROM campaign
CROSS JOIN (
  VALUES
    (
      'Model A',
      'Light everyday dryer',
      'A lightweight daily dryer for smaller bathrooms and simple routines.',
      'Lightweight everyday use',
      'Compact body with steady airflow and a simple control layout.',
      '["Approx. 89,000 rpm BLDC motor", "3 heat settings", "Cool shot", "Fold-flat handle"]',
      'Lower maximum airflow than the larger models.',
      8900,
      1,
      NULL
    ),
    (
      'Model B',
      'Balanced BLDC pick',
      'The middle option with stronger airflow, quieter operation, and a travel-friendly weight.',
      'Best balance of power and price',
      'Good airflow from a reliable BLDC platform while staying under the S$100 target.',
      '["Approx. 110,000 rpm BLDC motor", "Negative ion mode", "Magnetic nozzle", "Overheat protection"]',
      'Slightly larger body than Model A.',
      9900,
      2,
      NULL
    ),
    (
      'Model C',
      'Premium finish option',
      'A more polished shortlist option with higher airflow and a nicer finish.',
      'Fast drying with a more premium feel',
      'Highest airflow of the shortlist with a quieter, more refined shell.',
      '["Approx. 120,000 rpm BLDC motor", "4 heat modes", "Low-noise ducting", "Magnetic styling nozzle"]',
      'Higher launch price and a little heavier.',
      10900,
      3,
      NULL
    )
) AS product(public_name, public_label, short_description, key_benefit, key_differentiator, specifications, tradeoff, estimated_price_cents, display_order, image_url)
ON CONFLICT (campaign_id, public_name) DO UPDATE SET
  public_label = EXCLUDED.public_label,
  short_description = EXCLUDED.short_description,
  key_benefit = EXCLUDED.key_benefit,
  key_differentiator = EXCLUDED.key_differentiator,
  specifications = EXCLUDED.specifications,
  tradeoff = EXCLUDED.tradeoff,
  estimated_price_cents = EXCLUDED.estimated_price_cents,
  display_order = EXCLUDED.display_order,
  image_url = EXCLUDED.image_url,
  active = true;
