import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export const revalidate = 0; // Fetch fresh data on every request

export const metadata: Metadata = {
  title: "Useful Home Appliances Group Buy Singapore",
  description:
    "SamaSama sources practical home appliances and organises transparent group buys for Singapore homes. Better quality, better prices, brought in together.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SamaSama | Useful Home Appliances Group Buy Singapore",
    description:
      "Practical home appliances sourced carefully through transparent group buys for Singapore homes.",
    url: "/",
    images: [
      {
        url: "/samasama-home-banner.png",
        width: 1536,
        height: 1024,
        alt: "Air fryer on a warm kitchen table with neutral home styling",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SamaSama | Home Appliance Group Buys in Singapore",
    description:
      "Useful home appliances, sourced carefully and brought in through transparent group buys.",
    images: ["/samasama-home-banner.png"],
  },
};

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

  return (
    <div style={{ backgroundColor: "var(--color-bg)", minHeight: "100vh" }}>
      <style>{`
        .home-shell {
          overflow: hidden;
        }

        .hero-section {
          background:
            radial-gradient(circle at 78% 8%, rgba(226, 220, 208, 0.48), transparent 28%),
            linear-gradient(135deg, var(--color-bg) 0%, var(--color-surface) 100%);
          border-bottom: 1px solid var(--color-border);
          padding: 0;
          overflow: hidden;
        }

        .hero-section .container-site {
          max-width: 1440px;
        }

        .hero-grid {
          display: grid;
          grid-template-columns: minmax(420px, 0.74fr) minmax(560px, 1.26fr);
          gap: 0;
          align-items: stretch;
          min-height: clamp(560px, 72vh, 760px);
        }

        .hero-title {
          font-family: var(--font-display);
          font-size: clamp(2.7rem, 4.6vw, 4.7rem);
          font-weight: 500;
          color: var(--color-text);
          line-height: 1.12;
          margin-bottom: 1.5rem;
          letter-spacing: -0.01em;
          max-width: 10.9em;
        }

        .hero-copy {
          font-size: var(--text-base);
          color: var(--color-primary-muted);
          line-height: 1.75;
          max-width: 520px;
          margin-bottom: 2.25rem;
        }

        .hero-actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .hero-copy-block {
          padding: clamp(4rem, 7vw, 6.5rem) clamp(2rem, 5vw, 4.5rem) clamp(4rem, 7vw, 6.5rem) 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
          z-index: 2;
        }

        .hero-showcase {
          border: 0;
          background: transparent;
          overflow: visible;
          box-shadow: none;
          margin-left: clamp(-4.5rem, -5vw, -2rem);
          min-height: 100%;
        }

        .hero-image {
          height: 100%;
          min-height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          position: relative;
        }

        .hero-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          border-radius: 0;
          mask-image: linear-gradient(to right, transparent 0%, black 18%, black 100%);
          -webkit-mask-image: linear-gradient(to right, transparent 0%, black 18%, black 100%);
        }

        .section-tagline {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--color-primary);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 1rem;
          display: inline-block;
        }

        .method-section {
          background: var(--color-bg);
          padding: clamp(5rem, 9vw, 8rem) 0;
        }

        .method-heading {
          text-align: center;
          max-width: 720px;
          margin: 0 auto 4rem;
        }

        .method-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 2rem;
          position: relative;
        }

        .method-card {
          background-color: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 2.5rem;
          text-align: center;
          min-height: 100%;
        }

        .method-number {
          width: 3rem;
          height: 3rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-full);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-primary);
          font-family: var(--font-display);
          font-size: var(--text-md);
          margin-bottom: 1.25rem;
        }

        .method-card h3 {
          font-family: var(--font-body);
          font-size: var(--text-md);
          font-weight: 600;
          color: var(--color-text);
          margin-bottom: 0.75rem;
        }

        .method-card p {
          font-size: var(--text-sm);
          color: var(--color-primary-muted);
          line-height: 1.7;
        }

        .deals-section {
          background: linear-gradient(180deg, var(--color-surface) 0%, var(--color-bg) 100%);
          padding: clamp(5rem, 9vw, 7.5rem) 0;
          border-top: 1px solid var(--color-border);
          border-bottom: 1px solid var(--color-border);
          scroll-margin-top: 88px;
        }

        .deals-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 2rem;
          margin-bottom: 3rem;
        }

        .deal-card {
          display: grid;
          grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.1fr);
          background: rgba(255, 255, 255, 0.86);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          transition: all var(--transition-base);
          box-shadow: var(--shadow-sm);
        }

        .deal-card:hover {
          transform: translateY(-2px);
          border-color: rgba(74, 83, 60, 0.36);
          box-shadow: var(--shadow-md);
        }

        .deal-image-box {
          min-height: 360px;
          background: var(--color-bg);
          border-right: 1px solid var(--color-border);
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

        .deal-content {
          padding: clamp(1.75rem, 4vw, 2.75rem);
          display: flex;
          flex-direction: column;
        }

        .deal-title-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1.5rem;
          margin-bottom: 1rem;
        }

        .deal-price {
          text-align: right;
          white-space: nowrap;
        }

        .deal-price strong {
          display: block;
          color: var(--color-text);
          font-size: clamp(1.5rem, 3vw, 2rem);
          font-weight: 500;
          line-height: 1;
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
          border-radius: var(--radius-lg);
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
          font-weight: 600;
        }

        .collection-dots {
          display: flex;
          justify-content: center;
          gap: 0.55rem;
          margin-top: 1.5rem;
        }

        .collection-dot {
          width: 0.45rem;
          height: 0.45rem;
          border-radius: var(--radius-full);
          background: var(--color-border);
        }

        .collection-dot-active {
          background: var(--color-primary);
        }

        .care-section {
          background: var(--color-bg);
          padding: clamp(5rem, 9vw, 8rem) 0;
          border-bottom: 1px solid var(--color-border);
        }

        .care-layout {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          gap: clamp(3rem, 7vw, 5rem);
          align-items: start;
        }

        .care-copy {
          font-size: clamp(1.75rem, 3.5vw, 2.75rem);
          line-height: 1.18;
          color: var(--color-text);
          font-weight: 500;
          letter-spacing: -0.01em;
          margin-bottom: 1.5rem;
        }

        .care-body {
          font-size: var(--text-base);
          line-height: 1.8;
          color: var(--color-primary-muted);
          max-width: 620px;
        }

        .trust-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .trust-card {
          border-top: 1px solid var(--color-border);
          padding: 1.5rem 0 0;
        }

        .trust-icon {
          width: 2.5rem;
          height: 2.5rem;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-full);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
          margin-bottom: 1rem;
          background: var(--color-surface);
        }

        .trust-icon svg {
          width: 1.2rem;
          height: 1.2rem;
          stroke-width: 1.6;
        }

        .trust-card h3 {
          font-size: var(--text-base);
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .trust-card p {
          font-size: var(--text-sm);
          line-height: 1.7;
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

        .loop-section {
          background:
            linear-gradient(90deg, rgba(245, 242, 235, 0.96), rgba(245, 242, 235, 0.72)),
            url("/samasama-home-banner.png");
          background-size: cover;
          background-position: center 58%;
          border-bottom: 1px solid var(--color-border);
          padding: clamp(3rem, 6vw, 4.5rem) 0;
        }

        .loop-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
          gap: 2rem;
          align-items: end;
        }

        .loop-form {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .loop-input {
          width: 100%;
          min-width: 0;
          height: 3rem;
          border: 1px solid var(--color-border);
          background: rgba(255, 255, 255, 0.78);
          color: var(--color-text);
          border-radius: var(--radius-lg);
          padding: 0 1rem;
          font-size: var(--text-sm);
          outline: none;
        }

        .loop-input:focus {
          border-color: rgba(74, 83, 60, 0.6);
        }

        .loop-button {
          width: 3rem;
          height: 3rem;
          flex: 0 0 3rem;
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-primary);
          background: var(--color-primary);
          color: white;
          cursor: pointer;
          font-size: var(--text-lg);
          line-height: 1;
          transition: background var(--transition-base), border-color var(--transition-base);
        }

        .loop-button:hover {
          background: var(--color-accent-dark);
          border-color: var(--color-accent-dark);
        }

        @media (max-width: 900px) {
          .hero-grid {
            grid-template-columns: 1fr;
            gap: 2rem;
            min-height: auto;
          }

          .hero-title {
            max-width: 10.9em;
          }

          .hero-copy-block {
            padding: clamp(3rem, 8vw, 4rem) 0 0;
          }

          .hero-showcase {
            height: auto;
            margin-left: 0;
            min-height: auto;
          }

          .hero-image {
            height: 360px;
            min-height: 360px;
          }

          .hero-image img {
            mask-image: linear-gradient(to bottom, transparent 0%, black 18%, black 100%);
            -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 18%, black 100%);
          }

          .method-grid {
            grid-template-columns: 1fr;
          }

          .deals-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .deal-card {
            grid-template-columns: 1fr;
          }

          .deal-image-box {
            min-height: 300px;
            border-right: 0;
            border-bottom: 1px solid var(--color-border);
          }

          .deal-title-row {
            flex-direction: column;
            gap: 0.75rem;
          }

          .deal-price {
            text-align: left;
          }

          .care-layout {
            grid-template-columns: 1fr;
          }

          .trust-grid {
            grid-template-columns: 1fr;
          }

          /* On small screens in deal cards, hide marker text labels to prevent overlap */
          .deal-card .tier-marker-label {
            display: none;
          }

          .deal-card .progress-with-markers {
            padding-bottom: 0.75rem;
          }

          .loop-layout {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 560px) {
          .loop-form {
            align-items: stretch;
          }

          .loop-button {
            width: 3rem;
          }
        }
      `}</style>

      {/* ── HERO SECTION ───────────────────────────────────────── */}
      <section className="hero-section">
        <div className="container-site">
          <div className="hero-grid">
            <div className="hero-copy-block">
              <span className="section-tagline">Limited Group Release</span>
              <h1 className="hero-title">
                Useful home<br />
                essentials,<br />
                <span style={{ whiteSpace: "nowrap" }}>sourced together.</span>
              </h1>
              <p className="hero-copy">
                We source practical home appliances and organise group buys for Singapore homes. Better quality. Better prices. Together.
              </p>
              <div className="hero-actions">
                <Link href="#deals" className="btn btn-primary btn-lg">
                  View current batches
                </Link>
                <Link href="/how-it-works" className="btn btn-secondary btn-lg">
                  How it works
                </Link>
              </div>
            </div>

            <div className="hero-showcase">
              <div className="hero-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/samasama-home-banner.png" alt="Air fryer on a warm kitchen table with neutral home styling" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS SECTION ───────────────────────────────── */}
      <section className="method-section">
        <div className="container-site">
          <div className="method-heading">
            <span className="section-tagline">How SamaSama works</span>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", fontWeight: 500, color: "var(--color-text)", marginBottom: "1rem" }}>
              A simple way to unlock better prices.
            </h2>
            <p style={{ fontSize: "var(--text-md)", color: "var(--color-primary-muted)", lineHeight: 1.7 }}>
              Join a batch with a deposit. As more verified buyers come in, everyone moves toward a better final price.
            </p>
          </div>

          <div className="method-grid">
            <div className="method-card">
              <div className="method-number">01</div>
              <h3>Choose a batch</h3>
              <p>
                Browse active curated batches and review the product details, deposit, milestones, and estimated collection timeline.
              </p>
            </div>

            <div className="method-card">
              <div className="method-number">02</div>
              <h3>Place a deposit</h3>
              <p>
                Place a deposit to reserve your unit. Once verified, your order counts toward the group-buy progress.
              </p>
            </div>

            <div className="method-card">
              <div className="method-number">03</div>
              <h3>Unlock better pricing</h3>
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
                Active collections
              </h2>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)", maxWidth: "520px", lineHeight: 1.7 }}>
                Practical home essentials, opened in batches once they pass our sourcing checks.
              </p>
            </div>
            <Link href="#deals" className="btn btn-secondary">
              View all batches
            </Link>
          </div>

          <div style={{ display: "grid", gap: "2rem" }}>
            
            {activeDeals.length > 0 ? (
              activeDeals.map(({ batch, product }) => {
                const progressPercent = Math.min(100, (batch.confirmed_quantity / batch.target_capacity) * 100);
                const tierMarkers = getTierMilestoneMarkers(batch.target_capacity, batch.confirmed_quantity);

                return (
                  <div key={batch.batch_id} className="deal-card">
                    <div className="deal-image-box">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={product.image_url || "/samasama-home-banner.png"} alt={product.name} />
                      <div style={{ position: "absolute", top: "1rem", left: "1rem" }}>
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
                          Active batch
                        </span>
                      </div>
                    </div>
                    
                    <div className="deal-content">
                      <div className="deal-title-row">
                        <div>
                          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 500, color: "var(--color-text)", marginBottom: "0.75rem" }}>
                            {product.name}
                          </h3>
                          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)", lineHeight: 1.7 }}>
                            {product.description}
                          </p>
                        </div>
                        <div className="deal-price">
                          <span className="deal-meta-label">From</span>
                          <strong>S${batch.tier_1_price}</strong>
                        </div>
                      </div>
                      
                      <div className="deal-meta-grid">
                        <div className="deal-meta">
                          <span className="deal-meta-label">Deposit</span>
                          <span className="deal-meta-value">S${batch.deposit_amount}</span>
                        </div>
                        <div className="deal-meta">
                          <span className="deal-meta-label">Current price</span>
                          <span className="deal-meta-value">S${batch.tier_1_price}</span>
                        </div>
                      </div>
                      
                      {/* Progress and pricing status */}
                      <div style={{ marginBottom: "2rem", marginTop: "auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
                          <span>{batch.confirmed_quantity} joined</span>
                          <span>{batch.remaining_capacity} to unlock next tier</span>
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
                          <span style={{ color: "var(--color-primary)" }}>Batch target: {batch.target_capacity} units</span>
                          <span style={{ color: "var(--color-text-light)" }}>{Math.round(progressPercent)}% filled</span>
                        </div>
                      </div>

                      <Link href={`/group-buys/${batch.batch_id}`} className="btn btn-primary" style={{ width: "100%", textAlign: "center" }}>
                        Join this batch
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              /* Empty state placeholder */
              <div className="deal-card" style={{ borderStyle: "dashed", backgroundColor: "transparent" }}>
                <div className="deal-image-box">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/samasama-home-banner.png" alt="Neutral home appliance setting" />
                </div>
                <div className="deal-content" style={{ justifyContent: "center" }}>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
                    Vetting next batch
                  </h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-light)", lineHeight: 1.5 }}>
                    We are checking supplier details, packaging, and after-sales support before opening the next batch.
                  </p>
                </div>
              </div>
            )}
          </div>

          {activeDeals.length > 0 && (
            <div className="collection-dots" aria-hidden="true">
              {activeDeals.map(({ batch }, index) => (
                <span key={batch.batch_id} className={`collection-dot ${index === 0 ? "collection-dot-active" : ""}`} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── SOURCED WITH CARE ─────────────────────────────────── */}
      <section className="care-section">
        <div className="container-site">
          <div className="care-layout">
            <div>
              <span className="section-tagline">Sourced with care</span>
              <h2 className="care-copy">
                We do not list every product. We choose what is worth bringing in.
              </h2>
              <p className="care-body">
                SamaSama checks product quality, supplier reliability, packaging, after-sales support, and suitability for Singapore homes before opening a batch.
              </p>
            </div>

            <div className="trust-grid">
              <div className="trust-card">
                <span className="trust-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M12 3 5 6v5c0 4.3 2.9 8.3 7 10 4.1-1.7 7-5.7 7-10V6l-7-3Z" />
                    <path d="m9 12 2 2 4-5" />
                  </svg>
                </span>
                <h3>Quality first</h3>
                <p>We look for useful appliances with dependable build quality, sensible features, and everyday value.</p>
              </div>

              <div className="trust-card">
                <span className="trust-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M4 18V7l5 3 3-5 3 5 5-3v11H4Z" />
                    <path d="M4 18h16" />
                  </svg>
                </span>
                <h3>Trusted suppliers</h3>
                <p>We check whether suppliers can deliver reliably, pack properly, and support the batch after arrival.</p>
              </div>

              <div className="trust-card">
                <span className="trust-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M7 3h8l4 4v14H7V3Z" />
                    <path d="M15 3v5h4" />
                    <path d="M10 13h6" />
                    <path d="M10 17h6" />
                  </svg>
                </span>
                <h3>Transparent process</h3>
                <p>Deposits, batch progress, and pricing milestones are shown clearly so buyers know what is happening.</p>
              </div>

              <div className="trust-card">
                <span className="trust-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="m21 16-9 5-9-5V8l9-5 9 5v8Z" />
                    <path d="m3.5 8.5 8.5 5 8.5-5" />
                    <path d="M12 13.5V21" />
                  </svg>
                </span>
                <h3>After-sales support</h3>
                <p>We stay involved with collection, delivery questions, replacements, and supplier coordination.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STAY IN THE LOOP ───────────────────────────────────── */}
      <section className="loop-section">
        <div className="container-site">
          <div className="loop-layout">
            <div>
              <span className="section-tagline">Stay in the loop</span>
              <h2 style={{ fontSize: "clamp(1.75rem, 3vw, 2.4rem)", fontWeight: 500, marginBottom: "0.75rem" }}>
                Get notified when new batches open.
              </h2>
              <p style={{ fontSize: "var(--text-sm)", maxWidth: "520px" }}>
                Leave your email for future batch updates. This is a placeholder newsletter form for now.
              </p>
            </div>

            <form className="loop-form" aria-label="Newsletter signup placeholder">
              <input className="loop-input" type="email" name="email" placeholder="Email address" required />
              <button className="loop-button" type="submit" aria-label="Submit email newsletter signup">
                →
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
