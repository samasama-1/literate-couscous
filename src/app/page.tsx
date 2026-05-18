import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export const revalidate = 0; // Fetch fresh data on every request

type Product = Database["public"]["Tables"]["products"]["Row"];

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

  return (
    <div style={{ backgroundColor: "var(--color-bg)", minHeight: "100vh" }}>
      <style>{`
        .hero-title {
          font-family: var(--font-display);
          font-size: clamp(2.5rem, 6vw, 4.25rem);
          font-weight: 500;
          color: var(--color-text);
          line-height: 1.15;
          margin-bottom: 1.5rem;
          letter-spacing: -0.02em;
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

        .pitch-card {
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          padding: 3rem 2.5rem;
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
          height: 260px;
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

        .progress-track {
          height: 5px;
          background-color: var(--color-surface-2);
          border-radius: var(--radius-full);
          overflow: hidden;
          margin: 0.75rem 0;
        }

        .progress-fill {
          height: 100%;
          background-color: var(--color-primary);
          transition: width var(--transition-slow);
        }
      `}</style>

      {/* ── HERO SECTION ───────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--color-surface)", padding: "6rem 0", borderBottom: "1px solid var(--color-border)" }}>
        <div className="container-site">
          <div style={{ maxWidth: "760px", margin: "0 auto", textAlign: "center" }}>
            <span className="section-tagline">Curated Collective Purchasing</span>
            <h1 className="hero-title">
              Premium appliances.<br />Vetted direct from sources.
            </h1>
            <p style={{ fontSize: "var(--text-md)", color: "var(--color-primary-muted)", marginBottom: "2.5rem", lineHeight: 1.7 }}>
              Sama Sama partners directly with world-class manufacturers to secure premium home technology. 
              By grouping orders together, we unlock wholesale pricing normally reserved for industrial importers.
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="#deals" className="btn btn-primary btn-lg">
                Explore Vetted Deals
              </Link>
              <Link href="/how-it-works" className="btn btn-secondary btn-lg">
                The Sourcing Process
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE COOPERATIVE PITCH SECTION ───────────────────────── */}
      <section className="section" style={{ background: "var(--color-bg)", padding: "5rem 0" }}>
        <div className="container-site">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "4rem", alignItems: "center" }}>
            
            <div className="pitch-card">
              <span className="section-tagline">Why Cooperative?</span>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", color: "var(--color-text)", marginBottom: "1.25rem", fontWeight: 500 }}>
                High-end utility, simplified.
              </h2>
              <p style={{ color: "var(--color-primary-muted)", fontSize: "var(--text-sm)", lineHeight: 1.7 }}>
                By pooling Singaporean household demand, we eliminate distributor markup, storefront overhead, and middleman commissions. 
                You secure your spot with a refundable deposit, and the price drops for everyone as more units join.
              </p>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
                <div style={{ fontSize: "1.75rem", color: "var(--color-primary)" }}>🛡️</div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-md)", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.25rem" }}>
                    Verified Quality Vetting
                  </h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)" }}>
                    Every product is independently sourced and strictly inspected by our local engineering team in Singapore.
                  </p>
                </div>
              </div>
              
              <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
                <div style={{ fontSize: "1.75rem", color: "var(--color-primary)" }}>📉</div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-md)", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.25rem" }}>
                    Dynamic Discount Tiers
                  </h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)" }}>
                    Unlock cheaper milestones collectively. If pricing tiers unlock, early deposits get credited the savings automatically.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
                <div style={{ fontSize: "1.75rem", color: "var(--color-primary)" }}>🇸🇬</div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-md)", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.25rem" }}>
                    Full Local Technical Support
                  </h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)" }}>
                    Includes 2-year manufacturer warranty and a dedicated local service hub for after-sales support.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── ACTIVE DEALS SHOWCASE ────────────────────────────── */}
      <section id="deals" className="section" style={{ background: "var(--color-surface)", padding: "6rem 0", borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="container-site">
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <span className="section-tagline">Now Accepting Deposits</span>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", fontWeight: 500, color: "var(--color-text)" }}>
              Active Curated Batches
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2.5rem" }}>
            
            {batches && batches.length > 0 ? (
              batches.map((batch) => {
                const product = productsMap[batch.product_id];
                if (!product) return null;

                const progressPercent = Math.min(100, (batch.confirmed_quantity / batch.target_capacity) * 100);

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
                      
                      {/* Progress and pricing status */}
                      <div style={{ marginBottom: "2rem", marginTop: "auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
                          <span>Deposit: <strong style={{ color: "var(--color-text)" }}>${batch.deposit_amount}</strong></span>
                          <span>Milestone: {batch.target_capacity} units</span>
                        </div>
                        
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
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
