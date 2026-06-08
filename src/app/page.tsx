import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export const revalidate = 0; // Fetch fresh data on every request

type Product = Database["public"]["Tables"]["products"]["Row"];
type BatchProgress = Database["public"]["Views"]["batch_progress_view"]["Row"];
type ActiveDeal = {
  batch: BatchProgress;
  product: Product;
};

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

export default async function Home() {
  // Fetch open batches from our progress view
  const { data: batches } = await supabase
    .from('batch_progress_view')
    .select('*')
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false });

  // Fetch corresponding product details
  let productsMap: Record<string, Product> = {};
  if (batches && batches.length > 0) {
    const productIds = batches.map(b => b.product_id);
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds);
      
    if (products) {
      productsMap = products.reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {} as Record<string, Product>);
    }
  }

  const activeDeals = (batches || [])
    .map((batch) => ({ batch, product: productsMap[batch.product_id] }))
    .filter((deal): deal is ActiveDeal => Boolean(deal.product));
  const featuredDeal = activeDeals[0];

  return (
    <div style={{ backgroundColor: "var(--color-bg)", minHeight: "100vh" }}>
      <style>{`
        .home-shell {
          overflow: hidden;
        }

        .hero-section {
          background: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
          padding: clamp(3rem, 7vw, 6rem) 0;
        }

        .hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
          gap: clamp(2rem, 5vw, 4rem);
          align-items: center;
        }

        .hero-title {
          font-family: var(--font-display);
          font-size: clamp(3rem, 7vw, 5.75rem);
          font-weight: 500;
          color: var(--color-text);
          line-height: 0.98;
          margin-bottom: 1.5rem;
          letter-spacing: -0.02em;
        }

        .hero-copy {
          font-size: var(--text-md);
          color: var(--color-primary-muted);
          line-height: 1.75;
          max-width: 560px;
          margin-bottom: 2rem;
        }

        .hero-actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .hero-showcase {
          display: flex;
          flex-direction: column;
          border-radius: var(--radius-xl);
          border: 1px solid var(--color-border);
          background: white;
          overflow: hidden;
          box-shadow: var(--shadow-lg);
        }

        .hero-image {
          height: 420px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg);
        }

        .hero-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .hero-image-fallback {
          width: min(82%, 460px);
          height: auto;
          object-fit: contain;
          filter: drop-shadow(0 24px 32px rgba(46, 51, 38, 0.12));
        }

        .hero-deal-card {
          background: var(--color-bg);
          border-top: 1px solid var(--color-border);
          padding: 1.5rem;
        }

        .hero-deal-row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .hero-price {
          font-family: var(--font-display);
          font-size: clamp(1.8rem, 4vw, 2.5rem);
          color: var(--color-primary);
          line-height: 1;
          font-weight: 600;
        }

        .section-tagline {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--color-primary);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 1rem;
          display: inline-block;
        }

        .method-section {
          background: var(--color-bg);
          padding: clamp(4rem, 8vw, 7rem) 0;
        }

        .method-heading {
          text-align: center;
          max-width: 720px;
          margin: 0 auto 4rem;
        }

        .method-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1.5rem;
          position: relative;
        }

        .method-card {
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          padding: 2.25rem;
          text-align: center;
          min-height: 100%;
        }

        .method-number {
          width: 3rem;
          height: 3rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-md);
          background: white;
          border: 1px solid var(--color-border);
          color: var(--color-primary);
          font-family: var(--font-display);
          font-size: var(--text-xl);
          margin-bottom: 1.25rem;
          box-shadow: var(--shadow-sm);
        }

        .method-card h3 {
          font-family: var(--font-body);
          font-size: var(--text-md);
          font-weight: 700;
          color: var(--color-text);
          margin-bottom: 0.75rem;
        }

        .method-card p {
          font-size: var(--text-sm);
          color: var(--color-primary-muted);
          line-height: 1.7;
        }

        .deals-section {
          background: var(--color-surface);
          padding: clamp(4rem, 8vw, 7rem) 0;
          border-top: 1px solid var(--color-border);
          border-bottom: 1px solid var(--color-border);
        }

        .deals-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 2rem;
          margin-bottom: 3rem;
        }

        .deal-card {
          background: white;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          overflow: hidden;
          transition: all var(--transition-base);
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .deal-card:hover {
          transform: translateY(-2px);
          border-color: var(--color-primary);
          box-shadow: var(--shadow-md);
        }

        .deal-image-box {
          height: 300px;
          background: white;
          border-bottom: 1px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .deal-image-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .deal-meta-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .deal-meta {
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: 0.875rem;
        }

        .deal-meta-label {
          display: block;
          font-size: var(--text-xs);
          color: var(--color-text-light);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 0.25rem;
        }

        .deal-meta-value {
          font-size: var(--text-sm);
          color: var(--color-text);
          font-weight: 700;
        }

        .progress-track {
          height: 5px;
          background-color: var(--color-surface-2);
          border-radius: var(--radius-full);
          overflow: hidden;
          margin: 0;
        }

        .progress-fill {
          height: 100%;
          background-color: var(--color-primary);
          transition: width var(--transition-slow);
        }

        .progress-with-markers {
          position: relative;
          padding: 0 0 1.75rem;
          margin: 0.75rem 0;
        }

        .tier-marker {
          position: absolute;
          top: calc(100% - 1.75rem + 0.625rem);
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          pointer-events: none;
          z-index: 2;
        }

        /* Prevent the Goal marker at 100% from overflowing */
        .tier-marker:last-child {
          transform: translateX(-85%);
        }

        .tier-marker-dot {
          width: 0.55rem;
          height: 0.55rem;
          border-radius: var(--radius-full);
          border: 2px solid var(--color-bg);
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

        @media (max-width: 900px) {
          .hero-grid {
            grid-template-columns: 1fr;
          }

          .hero-showcase {
            height: auto;
          }

          .hero-image {
            height: 320px;
          }

          .method-grid {
            grid-template-columns: 1fr;
          }

          .deals-header {
            align-items: flex-start;
            flex-direction: column;
          }

          /* On small screens in deal cards, hide marker text labels to prevent overlap */
          .deal-card .tier-marker-label {
            display: none;
          }

          .deal-card .progress-with-markers {
            padding-bottom: 0.75rem;
          }
        }
      `}</style>

      {/* ── HERO SECTION ───────────────────────────────────────── */}
      <section className="hero-section">
        <div className="container-site">
          <div className="hero-grid">
            <div>
              <span className="section-tagline">Limited Group Release</span>
              <h1 className="hero-title">
                Premium home tech, unlocked together.
              </h1>
              <p className="hero-copy">
                We bring in useful home appliances at better prices through group buys. Join with a deposit, and the price drops for everyone as more people come in.
              </p>
              <div className="hero-actions">
                <Link href="#deals" className="btn btn-primary btn-lg">
                  Explore Active Collections
                </Link>
                <Link href="/how-it-works" className="btn btn-secondary btn-lg">
                  How Group Buys Work
                </Link>
              </div>
            </div>

            <div className="hero-showcase">
              <div className="hero-image">
                {featuredDeal?.product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={featuredDeal.product.image_url} alt={featuredDeal.product.name} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="hero-image-fallback" src="/placeholder-air-fryer.png" alt="Air fryer placeholder product preview" />
                )}
              </div>

              <div className="hero-deal-card">
                {featuredDeal ? (
                  <>
                    <div className="hero-deal-row">
                      <div>
                        <span className="section-tagline" style={{ marginBottom: "0.5rem" }}>Featured Lobang</span>
                        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 500, color: "var(--color-text)", marginBottom: "0.25rem" }}>
                          {featuredDeal.product.name}
                        </h2>
                        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)" }}>
                          {featuredDeal.batch.confirmed_quantity} verified units joined
                        </p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="hero-price">${featuredDeal.batch.tier_1_price}</div>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-light)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Batch price from</span>
                      </div>
                    </div>

                    <div className="progress-with-markers" aria-label="Group-buy tier milestones">
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${Math.min(100, (featuredDeal.batch.confirmed_quantity / featuredDeal.batch.target_capacity) * 100)}%` }}></div>
                      </div>
                      {getTierMilestoneMarkers(featuredDeal.batch.target_capacity, featuredDeal.batch.confirmed_quantity).map((marker) => (
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

                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", margin: "0.75rem 0 1.25rem", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", fontWeight: 600 }}>
                      <span>{featuredDeal.batch.confirmed_quantity} joined</span>
                      <span style={{ color: "var(--color-primary)" }}>{featuredDeal.batch.remaining_capacity} more to next tier</span>
                    </div>

                    <Link href={`/group-buys/${featuredDeal.batch.batch_id}`} className="btn btn-primary" style={{ width: "100%" }}>
                      Join This Deal
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="section-tagline" style={{ marginBottom: "0.5rem" }}>Next Release</span>
                    <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 500, color: "var(--color-text)", marginBottom: "0.5rem" }}>
                      New collections are being vetted.
                    </h2>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)", marginBottom: "1.25rem" }}>
                      Our next group-buy batch will appear here once it is ready for deposits.
                    </p>
                    <Link href="#deals" className="btn btn-primary" style={{ width: "100%" }}>
                      Browse Collections
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS SECTION ───────────────────────────────── */}
      <section className="method-section">
        <div className="container-site">
          <div className="method-heading">
            <span className="section-tagline">The Sama Sama Method</span>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", fontWeight: 500, color: "var(--color-text)", marginBottom: "1rem" }}>
              Better prices, unlocked together.
            </h2>
            <p style={{ fontSize: "var(--text-md)", color: "var(--color-primary-muted)", lineHeight: 1.7 }}>
              Join a batch with a deposit. As more verified buyers come in, everyone moves toward a better final price.
            </p>
          </div>

          <div className="method-grid">
            <div className="method-card">
              <div className="method-number">1</div>
              <h3>Choose a Lobang</h3>
              <p>
                Browse active curated batches and review the product details, deposit, milestones, and estimated collection timeline.
              </p>
            </div>

            <div className="method-card">
              <div className="method-number">2</div>
              <h3>Join with Deposit</h3>
              <p>
                Place a deposit to reserve your unit. Once verified, your order counts toward the group-buy progress.
              </p>
            </div>

            <div className="method-card">
              <div className="method-number">3</div>
              <h3>Unlock Better Price Together</h3>
              <p>
                As more verified orders join, the batch moves toward better pricing. We coordinate collection when the products are ready.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── ACTIVE DEALS SHOWCASE ────────────────────────────── */}
      <section id="deals" className="deals-section">
        <div className="container-site">
          <div className="deals-header">
            <div>
              <span className="section-tagline">Now Accepting Deposits</span>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", fontWeight: 500, color: "var(--color-text)", marginBottom: "0.75rem" }}>
                Active Collections
              </h2>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)", maxWidth: "520px", lineHeight: 1.7 }}>
                Time-limited batches for premium home essentials, curated for collective purchasing power.
              </p>
            </div>
            <Link href="/how-it-works" className="btn btn-secondary">
              View the Process
            </Link>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2.5rem" }}>
            
            {activeDeals.length > 0 ? (
              activeDeals.map(({ batch, product }) => {
                const progressPercent = Math.min(100, (batch.confirmed_quantity / batch.target_capacity) * 100);
                const tierMarkers = getTierMilestoneMarkers(batch.target_capacity, batch.confirmed_quantity);

                return (
                  <div key={batch.batch_id} className="deal-card">
                    <div className="deal-image-box">
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image_url} alt={product.name} />
                      ) : (
                        <div style={{ fontSize: "4rem" }}>📦</div>
                      )}
                      <div style={{ position: "absolute", top: "1rem", right: "1rem" }}>
                        <span style={{ 
                          fontSize: "var(--text-xs)", 
                          fontWeight: 600, 
                          padding: "0.25rem 0.625rem", 
                          borderRadius: "var(--radius-sm)", 
                          backgroundColor: "var(--color-primary)", 
                          color: "white",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase"
                        }}>
                          Active Deal
                        </span>
                      </div>
                    </div>
                    
                    <div style={{ padding: "2rem", flex: 1, display: "flex", flexDirection: "column" }}>
                      <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.375rem", fontWeight: 500, color: "var(--color-text)", marginBottom: "0.75rem" }}>
                        {product.name}
                      </h3>
                      
                      <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
                        {product.description}
                      </p>

                      <div className="deal-meta-grid">
                        <div className="deal-meta">
                          <span className="deal-meta-label">Batch price from</span>
                          <span className="deal-meta-value">${batch.tier_1_price}</span>
                        </div>
                        <div className="deal-meta">
                          <span className="deal-meta-label">Deposit</span>
                          <span className="deal-meta-value">${batch.deposit_amount}</span>
                        </div>
                      </div>
                      
                      {/* Progress and pricing status */}
                      <div style={{ marginBottom: "2rem", marginTop: "auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
                          <span>Deposit: <strong style={{ color: "var(--color-text)" }}>${batch.deposit_amount}</strong></span>
                          <span>Milestone: {batch.target_capacity} units</span>
                        </div>
                        
                        <div className="progress-with-markers" aria-label="Group-buy tier milestones">
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
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
                          <span style={{ color: "var(--color-primary)" }}>{batch.confirmed_quantity} Joined</span>
                          <span style={{ color: "var(--color-text-light)" }}>{batch.remaining_capacity} more units to tier lock</span>
                        </div>
                      </div>

                      <Link href={`/group-buys/${batch.batch_id}`} className="btn btn-primary" style={{ width: "100%", textAlign: "center" }}>
                        Explore Deal &amp; Tiers
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              /* Empty state placeholder */
              <div className="deal-card" style={{ borderStyle: "dashed", backgroundColor: "transparent" }}>
                <div style={{ height: "260px", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: "3rem", opacity: 0.3 }}>🔍</div>
                </div>
                <div style={{ padding: "2rem", textAlign: "center" }}>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
                    Vetting Next Batch
                  </h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-light)", lineHeight: 1.5 }}>
                    Our cooperative engineers are currently reviewing factory audits. Next premium batch will launch shortly.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── COMMUNITY OUTRO ─────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--color-primary)", color: "white", padding: "6rem 0" }}>
        <div className="container-site" style={{ textAlign: "center", maxWidth: "680px", margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-display)", color: "white", fontSize: "2.25rem", fontWeight: 500, marginBottom: "1.5rem" }}>
            Join the collective.
          </h2>
          <p style={{ fontSize: "var(--text-md)", color: "var(--color-accent-light)", lineHeight: 1.7, marginBottom: "2.5rem" }}>
            Receive private release alerts for highly-anticipated kitchen and home appliances. 
            No spam, just premium home products direct from manufacturer blueprints.
          </p>
          <Link href="#deals" className="btn btn-secondary" style={{ padding: "0.875rem 2rem", fontSize: "var(--text-sm)", border: "none" }}>
            Browse Active Collections
          </Link>
        </div>
      </section>
    </div>
  );
}
