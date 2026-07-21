import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import CopyButton from "@/components/CopyButton";
import SamaSamaStandardSummary from "@/components/SamaSamaStandardSummary";
import { getProductStandardEvaluation } from "@/lib/samasamaStandard";

export const revalidate = 0; // Fetch fresh data on every request

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  const { data: batch } = await supabase
    .from("batch_progress_view")
    .select("*")
    .eq("batch_id", id)
    .single();

  if (!batch) {
    return {
      title: "Group Buy Batch",
      description: "View SamaSama group-buy batch details for Singapore homes.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", batch.product_id)
    .single();

  if (!product) {
    return {
      title: "Group Buy Batch",
      description: "View SamaSama group-buy batch details for Singapore homes.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = `${product.name} Group Buy`;
  const description =
    product.description ||
    `Join the SamaSama group buy for ${product.name}, sourced for Singapore homes with transparent batch pricing.`;
  const image = product.image_url || "/samasama-home-banner.png";

  return {
    title,
    description,
    alternates: {
      canonical: `/group-buys/${id}`,
    },
    openGraph: {
      title: `${product.name} | SamaSama Group Buy`,
      description,
      url: `/group-buys/${id}`,
      type: "website",
      images: [
        {
          url: image,
          alt: `${product.name} available through a SamaSama group buy in Singapore`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} | SamaSama Group Buy`,
      description,
      images: [image],
    },
  };
}

// TODO: Replace these presentation-only milestones with exact thresholds from a pricing_tiers table or per-batch tier configuration.
function getTierMilestoneMarkers(targetCapacity: number, confirmedQuantity: number) {
  const markers = [
    { label: "T1", percent: 25, units: Math.ceil(targetCapacity * 0.25) },
    { label: "T2", percent: 70, units: Math.ceil(targetCapacity * 0.70) },
    { label: "Goal", percent: 100, units: targetCapacity },
  ];
  const nextMarker = markers.find((marker) => confirmedQuantity < marker.units);

  return markers.map((marker) => ({
    ...marker,
    status: confirmedQuantity >= marker.units
      ? "unlocked"
      : nextMarker?.label === marker.label
        ? "next"
        : "locked",
  }));
}

export default async function BatchDetailPage({ params }: PageProps) {
  const { id } = await params;
  
  // Fetch batch details from our view
  const { data: batch } = await supabase
    .from('batch_progress_view')
    .select('*')
    .eq('batch_id', id)
    .single();

  if (!batch) {
    notFound();
  }

  // Fetch product details
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', batch.product_id)
    .single();

  if (!product) {
    notFound();
  }

  const progressPercent = Math.min(100, (batch.confirmed_quantity / batch.target_capacity) * 100);
  const tierMarkers = getTierMilestoneMarkers(batch.target_capacity, batch.confirmed_quantity);

  // Dynamic Tier Threshold Calculations
  const t1Max = Math.floor(batch.target_capacity * 0.25);
  const t2Max = Math.floor(batch.target_capacity * 0.70);
  const t3Min = t2Max + 1;

  // Determine current active price and active tier status
  let currentPrice = batch.tier_1_price;
  let activeTier = 1;
  
  if (batch.tier_3_price && batch.confirmed_quantity >= t3Min) {
    currentPrice = batch.tier_3_price;
    activeTier = 3;
  } else if (batch.tier_2_price && batch.confirmed_quantity >= t1Max + 1) {
    currentPrice = batch.tier_2_price;
    activeTier = 2;
  }

  // Calculate savings percentage vs retail price if available
  const retailPrice = product.retail_price || currentPrice * 1.5;
  const savingsPercent = Math.round(((retailPrice - currentPrice) / retailPrice) * 100);
  const standardEvaluation = getProductStandardEvaluation(product.id, product.features);

  return (
    <div style={{ backgroundColor: "var(--color-bg)", minHeight: "100vh", paddingBottom: "6rem" }}>
      <style>{`
        .breadcrumbs {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--color-text-light);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 1rem;
        }

        .product-title {
          font-family: var(--font-display);
          font-size: clamp(2.25rem, 5vw, 3.25rem);
          font-weight: 500;
          color: var(--color-text);
          line-height: 1.15;
          margin-bottom: 1.5rem;
          letter-spacing: -0.02em;
        }

        .pricing-box {
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          padding: 2.25rem;
          margin-bottom: 2rem;
        }

        .price-label {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--color-primary-muted);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 0.5rem;
          display: block;
        }

        .badge-savings {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-weight: 600;
          padding: 0.25rem 0.625rem;
          border-radius: var(--radius-full);
          background-color: var(--color-accent-light);
          color: var(--color-primary);
          letter-spacing: 0.02em;
        }

        .trust-bullet {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-family: var(--font-body);
          font-size: var(--text-sm);
          color: var(--color-primary-muted);
          margin-bottom: 0.75rem;
        }

        .trust-bullet svg {
          width: 16px;
          height: 16px;
          color: var(--color-primary);
        }

        .editorial-quote {
          font-family: var(--font-display);
          font-style: italic;
          font-size: var(--text-md);
          color: var(--color-primary-muted);
          border-left: 2px solid var(--color-border);
          padding-left: 1.25rem;
          margin: 2.5rem 0;
          line-height: 1.6;
        }

        .tier-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1.5rem;
        }

        .tier-table th {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-text-light);
          border-bottom: 1px solid var(--color-border);
          padding: 1rem 0.5rem;
          text-align: left;
        }

        .tier-table td {
          font-family: var(--font-body);
          font-size: var(--text-sm);
          color: var(--color-text);
          border-bottom: 1px solid var(--color-border);
          padding: 1.25rem 0.5rem;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          font-size: var(--text-xs);
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .gallery-thumbnail {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          aspect-ratio: 1;
          background-color: var(--color-surface);
          cursor: pointer;
          transition: border-color var(--transition-base);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--text-xl);
        }

        .gallery-thumbnail:hover {
          border-color: var(--color-primary);
        }

        .spec-card {
          padding: 2rem;
          border-right: 1px solid var(--color-border);
        }

        .progress-with-markers {
          position: relative;
          padding: 0.45rem 0 1.35rem;
          margin-bottom: 0.75rem;
        }

        .progress-with-markers .progress-track {
          margin: 0;
        }

        .tier-marker {
          position: absolute;
          top: 0.08rem;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
          pointer-events: none;
          z-index: 2;
        }

        .tier-marker-dot {
          width: 0.55rem;
          height: 0.55rem;
          border-radius: var(--radius-full);
          border: 2px solid var(--color-surface);
          box-shadow: 0 0 0 1px var(--color-border);
        }

        .tier-marker-label {
          font-family: var(--font-body);
          font-size: 0.625rem;
          font-weight: 700;
          line-height: 1;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .tier-marker-unlocked .tier-marker-dot {
          background: var(--color-primary);
        }

        .tier-marker-unlocked .tier-marker-label {
          color: var(--color-primary);
        }

        .tier-marker-next .tier-marker-dot {
          background: var(--color-warning);
        }

        .tier-marker-next .tier-marker-label {
          color: var(--color-warning);
        }

        .tier-marker-locked .tier-marker-dot {
          background: white;
        }

        .tier-marker-locked .tier-marker-label {
          color: var(--color-text-light);
        }

        @media (max-width: 767px) {
          .spec-card {
            border-right: none;
            border-bottom: 1px solid var(--color-border);
          }
          .spec-card:last-child {
            border-bottom: none;
          }
        }
      `}</style>

      {/* Main product showcase section */}
      <div className="container-site" style={{ paddingTop: "3rem" }}>
        
        {/* Back Link */}
        <Link href="/" style={{ color: "var(--color-primary)", fontSize: "var(--text-sm)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "2.5rem" }}>
          ← Back to Deals
        </Link>

        {/* 2-Column Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "4rem", alignItems: "start" }}>
          
          {/* Left Column: gallery */}
          <div>
            {/* Hero Gallery Container */}
            <div style={{ 
              backgroundColor: "white", 
              border: "1px solid var(--color-border)", 
              borderRadius: "var(--radius-xl)", 
              aspectRatio: "1.1", 
              overflow: "hidden", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              position: "relative",
              marginBottom: "1.5rem"
            }}>
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={product.image_url} 
                  alt={`${product.name} available through a SamaSama group buy in Singapore`} 
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                />
              ) : (
                <div style={{ fontSize: "5rem" }}>📦</div>
              )}
            </div>

            {/* Thumbnail Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
              <div className="gallery-thumbnail">🔍</div>
              <div className="gallery-thumbnail">⚡</div>
              <div className="gallery-thumbnail" style={{ color: "var(--color-primary-muted)" }}>▶</div>
            </div>
          </div>

          {/* Right Column: product info */}
          <div>
            <div className="breadcrumbs">HOME &gt; APPLIANCES &gt; BATCH DIRECT</div>
            <h1 className="product-title">{product.name}</h1>
            <p style={{ color: "var(--color-primary-muted)", fontSize: "var(--text-md)", lineHeight: 1.7, marginBottom: "2rem" }}>
              {product.description}
            </p>

            {/* Pricing Sand Box */}
            <div className="pricing-box">
              <span className="price-label">Current Group Buy Price</span>
              
              <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: "2.5rem", fontWeight: 500, color: "var(--color-text)" }}>
                  ${currentPrice}
                </span>
                {retailPrice && (
                  <span style={{ textDecoration: "line-through", color: "var(--color-text-light)", fontSize: "var(--text-lg)" }}>
                    ${retailPrice}
                  </span>
                )}
                <span className="badge-savings">SAVE {savingsPercent}%</span>
              </div>

              {/* Progress Tracker */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div className="progress-with-markers" aria-label="Group-buy tier milestones">
                  <div className="progress-track" style={{ height: "6px", backgroundColor: "var(--color-surface-2)" }}>
                    <div className="progress-fill" style={{ width: `${progressPercent}%`, backgroundColor: "var(--color-primary)" }}></div>
                  </div>
                  {tierMarkers.map((marker) => (
                    <span
                      key={marker.label}
                      className={`tier-marker tier-marker-${marker.status}`}
                      style={{ left: `${marker.percent}%` }}
                      title={`${marker.label}: ${marker.units} units`}
                    >
                      <span className="tier-marker-dot"></span>
                      <span className="tier-marker-label">{marker.label}</span>
                    </span>
                  ))}
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", fontWeight: 500 }}>
                  <span style={{ color: "var(--color-primary)" }}>
                    {batch.confirmed_quantity} units reserved
                  </span>
                  <span style={{ color: "var(--color-text-light)" }}>
                    Next goal: {batch.target_capacity} units
                  </span>
                </div>
              </div>

              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-primary-muted)", margin: 0, fontFamily: "var(--font-body)" }}>
                {activeTier === 3 ? (
                  "🎉 Maximum savings unlocked! Everyone gets the lowest tier price."
                ) : activeTier === 2 ? (
                  `Unlock the final tier price ($${batch.tier_3_price || batch.tier_2_price}) at ${t3Min} units.`
                ) : (
                  `Unlock the Tier 2 price ($${batch.tier_2_price || batch.tier_1_price}) at ${t1Max + 1} units.`
                )}
              </p>
            </div>

            {/* CTA Buy Action */}
            {batch.status === 'OPEN' ? (
              <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
                <Link 
                  href={`/group-buys/${batch.batch_id}/join`} 
                  className="btn btn-primary btn-lg" 
                  style={{ flex: 1, textAlign: "center", display: "block" }}
                >
                  Pay ${batch.deposit_amount} Deposit to Secure Spot
                </Link>
                <button 
                  className="btn btn-secondary" 
                  style={{ width: "56px", padding: 0, borderRadius: "var(--radius-md)" }}
                  title="Save to favorites"
                >
                  ♥
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary btn-lg" disabled style={{ width: "100%", marginBottom: "2rem" }}>
                Batch Closed
              </button>
            )}

            {/* Trust checkmarks */}
            <div style={{ marginBottom: "2rem" }}>
              <div className="trust-bullet">
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                <span>Evaluated through the SamaSama Standard before recommendation</span>
              </div>
              <div className="trust-bullet">
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span>Product-specific after-sales terms shown before batch fulfilment</span>
              </div>
            </div>

            {/* Editorial brand philosophy quote */}
            <blockquote className="editorial-quote">
              &ldquo;We do the homework before homeowners spend their money. This batch is open for a limited time, but the evaluation work comes first.&rdquo;
            </blockquote>
          </div>
        </div>

        <SamaSamaStandardSummary
          evaluation={standardEvaluation}
          productName={product.name}
        />

        {/* SECTION 2: Transparent Pricing Tiers */}
        <div style={{ marginTop: "6rem", borderTop: "1px solid var(--color-border)", paddingTop: "4rem" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", marginBottom: "1rem" }}>
            Transparent Pricing Tiers
          </h2>
          <p style={{ color: "var(--color-primary-muted)", fontSize: "var(--text-md)", maxWidth: "600px", marginBottom: "2.5rem" }}>
            The more people join, the cheaper the price gets for everyone. Once a tier is reached, all previous buyers are credited the difference when the batch closes.
          </p>

          <table className="tier-table">
            <thead>
              <tr>
                <th>Milestone Unit Count</th>
                <th>Price Per Unit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Tier 1 */}
              <tr>
                <td>1 &ndash; {t1Max} units</td>
                <td>${batch.tier_1_price}</td>
                <td>
                  {activeTier >= 2 ? (
                    <span className="status-badge" style={{ color: "var(--color-success)" }}>✓ Unlocked</span>
                  ) : (
                    <span className="status-badge" style={{ color: "var(--color-primary)" }}>● Active</span>
                  )}
                </td>
              </tr>
              
              {/* Tier 2 */}
              {batch.tier_2_price && (
                <tr>
                  <td>{t1Max + 1} &ndash; {t2Max} units</td>
                  <td>${batch.tier_2_price}</td>
                  <td>
                    {activeTier >= 3 ? (
                      <span className="status-badge" style={{ color: "var(--color-success)" }}>✓ Unlocked</span>
                    ) : activeTier === 2 ? (
                      <span className="status-badge" style={{ color: "var(--color-primary)" }}>● Active</span>
                    ) : (
                      <span className="status-badge" style={{ color: "var(--color-text-light)" }}>🔒 Locked</span>
                    )}
                  </td>
                </tr>
              )}

              {/* Tier 3 */}
              {batch.tier_3_price && (
                <tr>
                  <td>{t3Min}+ units</td>
                  <td>${batch.tier_3_price}</td>
                  <td>
                    {activeTier === 3 ? (
                      <span className="status-badge" style={{ color: "var(--color-primary)" }}>● Active</span>
                    ) : (
                      <span className="status-badge" style={{ color: "var(--color-text-light)" }}>🔒 Locked</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* SECTION 3: Community & Referral Widget Row */}
        <div style={{ marginTop: "4rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
          
          {/* Share savings widget */}
          <div style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xl)", padding: "2.5rem" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", color: "var(--color-text)", marginBottom: "1rem" }}>
              Share the Savings
            </h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              Every friend who joins brings us closer to the lowest tier price. Share your unique link and earn credit when they join.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input 
                type="text" 
                readOnly 
                value={`samasama.sg/gb/${batch.batch_id}`} 
                style={{ 
                  flex: 1, 
                  fontFamily: "var(--font-body)", 
                  fontSize: "var(--text-sm)", 
                  padding: "0.625rem 1rem", 
                  backgroundColor: "white", 
                  border: "1px solid var(--color-border)", 
                  borderRadius: "var(--radius-md)",
                  outline: "none"
                }} 
              />
              <CopyButton text={`samasama.sg/gb/${batch.batch_id}`} />
            </div>
          </div>

          {/* Sourcing process card */}
          <div style={{ backgroundColor: "var(--color-primary)", color: "white", borderRadius: "var(--radius-xl)", padding: "2.5rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", color: "white", marginBottom: "1rem" }}>
                Sourced Before Listed
              </h3>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-accent-light)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
                SamaSama does not list every product a supplier offers. We review the product, supplier, support plan and known trade-offs before recommending a batch.
              </p>
            </div>
            
            <Link
              href="/the-samasama-standard"
              className="btn btn-secondary" 
              style={{ width: "fit-content", padding: "0.625rem 1.25rem", borderRadius: "var(--radius-md)", fontSize: "var(--text-xs)", border: "none" }}
            >
              Read the Standard
            </Link>
          </div>

        </div>

        {/* SECTION 4: Horizontal Spec Row */}
        <div style={{ 
          marginTop: "6rem", 
          backgroundColor: "white", 
          border: "1px solid var(--color-border)", 
          borderRadius: "var(--radius-xl)", 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" 
        }}>
          
          <div className="spec-card">
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-primary)", marginBottom: "0.75rem" }}>01</div>
            <h4 style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "0.5rem" }}>
              Sourcing Checks
            </h4>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-primary-muted)", lineHeight: 1.5 }}>
              We investigate the supplier and product background before deciding whether a batch belongs on SamaSama.
            </p>
          </div>

          <div className="spec-card">
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-primary)", marginBottom: "0.75rem" }}>02</div>
            <h4 style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "0.5rem" }}>
              Claim Verification
            </h4>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-primary-muted)", lineHeight: 1.5 }}>
              Important claims should be supported by documents, sample use or clear notes before we present them as fact.
            </p>
          </div>

          <div className="spec-card">
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-primary)", marginBottom: "0.75rem" }}>03</div>
            <h4 style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "0.5rem" }}>
              Deposit Clarity
            </h4>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-primary-muted)", lineHeight: 1.5 }}>
              Deposits, batch progress and refund mechanics are explained before customers join a group buy.
            </p>
          </div>

          <div className="spec-card" style={{ borderRight: "none" }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-primary)", marginBottom: "0.75rem" }}>04</div>
            <h4 style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "0.5rem" }}>
              Support Planning
            </h4>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-primary-muted)", lineHeight: 1.5 }}>
              We plan the support route for faults, replacements and supplier escalation before launching.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
