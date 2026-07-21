import Link from "next/link";
import type { Metadata } from "next";
import {
  ACTIVE_BATCHES_PATH,
  SOURCING_CIRCLE_URL,
  STANDARD_PILLARS,
} from "@/lib/samasamaStandard";

export const metadata: Metadata = {
  title: "The SamaSama Standard | How We Evaluate Home Products",
  description:
    "Learn how SamaSama investigates suppliers, verifies product claims, tests samples, checks Singapore requirements, reviews production quality and prepares after-sales support before recommending a product.",
  alternates: {
    canonical: "/the-samasama-standard",
  },
  openGraph: {
    title: "The SamaSama Standard | How We Evaluate Home Products",
    description:
      "How SamaSama checks suppliers, claims, samples, Singapore requirements, production quality and after-sales support before recommending a product.",
    url: "/the-samasama-standard",
  },
};

export default function SamaSamaStandardPage() {
  return (
    <div style={{ background: "var(--color-bg)", minHeight: "100vh" }}>
      <style>{`
        .standard-page-hero {
          background:
            linear-gradient(90deg, rgba(250,248,245,0.96), rgba(250,248,245,0.72)),
            url("/samasama-home-banner.png");
          background-size: cover;
          background-position: center 58%;
          border-bottom: 1px solid var(--color-border);
          padding: clamp(4.5rem, 9vw, 7.5rem) 0;
        }

        .standard-page-hero-inner {
          max-width: 820px;
        }

        .standard-eyebrow {
          display: inline-block;
          margin-bottom: 1rem;
          font-size: var(--text-xs);
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--color-primary);
        }

        .standard-page-hero h1 {
          max-width: 780px;
          font-size: clamp(2.4rem, 5.6vw, 4.85rem);
          font-weight: 500;
          letter-spacing: -0.015em;
          margin-bottom: 1.25rem;
        }

        .standard-page-hero p {
          max-width: 650px;
          font-size: var(--text-md);
          line-height: 1.78;
          color: var(--color-primary-muted);
          margin-bottom: 2rem;
        }

        .standard-hero-actions,
        .standard-cta-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .standard-section {
          padding: clamp(4.5rem, 8vw, 7rem) 0;
          border-bottom: 1px solid var(--color-border);
        }

        .standard-section-muted {
          background: var(--color-surface);
        }

        .standard-section-heading {
          max-width: 760px;
          margin-bottom: 3rem;
        }

        .standard-section-heading.centered {
          margin-left: auto;
          margin-right: auto;
          text-align: center;
        }

        .standard-section-heading h2 {
          font-size: clamp(1.9rem, 4vw, 3rem);
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .standard-section-heading p {
          font-size: var(--text-base);
          line-height: 1.8;
        }

        .market-compare {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1.5rem;
        }

        .market-panel {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: clamp(1.5rem, 4vw, 2.25rem);
          background: rgba(255,255,255,0.62);
        }

        .market-panel h3 {
          font-size: var(--text-lg);
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .market-panel ul {
          margin: 0;
          padding-left: 1rem;
          color: var(--color-primary-muted);
          line-height: 1.8;
        }

        .pillar-overview-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
        }

        .pillar-overview-card {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 1.4rem;
          background: rgba(255,255,255,0.72);
          min-height: 100%;
        }

        .pillar-number {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.5rem;
          height: 2.5rem;
          margin-bottom: 1rem;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-full);
          background: var(--color-surface);
          color: var(--color-primary);
          font-size: var(--text-xs);
          font-weight: 700;
          letter-spacing: 0.08em;
        }

        .pillar-overview-card h3 {
          font-size: var(--text-md);
          font-weight: 650;
          margin-bottom: 0.65rem;
        }

        .pillar-overview-card p {
          font-size: var(--text-sm);
          line-height: 1.65;
          margin-bottom: 0.85rem;
        }

        .pillar-overview-card a {
          color: var(--color-primary);
          font-size: var(--text-xs);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .pillar-detail-list {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .pillar-detail {
          display: grid;
          grid-template-columns: minmax(180px, 0.32fr) minmax(0, 0.68fr);
          gap: clamp(1.5rem, 5vw, 3.5rem);
          padding: clamp(1.75rem, 4vw, 2.5rem) 0;
          border-top: 1px solid var(--color-border);
        }

        .pillar-detail:first-child {
          border-top: 0;
          padding-top: 0;
        }

        .pillar-detail h3 {
          font-size: clamp(1.35rem, 2.5vw, 1.8rem);
          font-weight: 500;
          margin-bottom: 0.75rem;
        }

        .pillar-question {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          line-height: 1.65;
        }

        .pillar-detail-body p {
          font-size: var(--text-base);
          line-height: 1.75;
          margin-bottom: 1.25rem;
        }

        .pillar-detail-body h4 {
          margin: 1.25rem 0 0.5rem;
          font-size: var(--text-xs);
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .standard-list {
          margin: 0;
          padding-left: 1rem;
          color: var(--color-primary-muted);
          font-size: var(--text-sm);
          line-height: 1.8;
        }

        .standard-note {
          margin-top: 1.25rem;
          padding: 1rem;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          background: rgba(255,255,255,0.62);
        }

        .standard-note p {
          font-size: var(--text-sm);
          line-height: 1.7;
        }

        .verdict-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
          gap: clamp(2rem, 6vw, 4rem);
          align-items: start;
        }

        .verdict-points {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .verdict-point {
          border-top: 1px solid var(--color-border);
          padding-top: 1rem;
        }

        .verdict-point h3 {
          font-size: var(--text-base);
          font-weight: 650;
          margin-bottom: 0.5rem;
        }

        .disclosure-box {
          max-width: 880px;
          margin: 0 auto;
          padding: clamp(1.5rem, 4vw, 2.25rem);
          border: 1px solid rgba(179,107,33,0.3);
          border-radius: var(--radius-lg);
          background: var(--color-warning-bg);
        }

        .disclosure-box h2 {
          font-size: var(--text-xl);
          font-weight: 600;
          margin-bottom: 0.75rem;
        }

        .disclosure-box p {
          font-size: var(--text-sm);
          line-height: 1.75;
          color: var(--color-text-muted);
        }

        .closing-cta {
          background: var(--color-primary);
          color: white;
          padding: clamp(4rem, 8vw, 6rem) 0;
        }

        .closing-cta h2 {
          max-width: 760px;
          color: white;
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .closing-cta p {
          max-width: 620px;
          color: var(--color-accent-light);
          margin-bottom: 2rem;
        }

        @media (max-width: 900px) {
          .pillar-overview-grid,
          .market-compare,
          .verdict-grid,
          .verdict-points {
            grid-template-columns: 1fr;
          }

          .pillar-detail {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <section className="standard-page-hero">
        <div className="container-site">
          <div className="standard-page-hero-inner">
            <span className="standard-eyebrow">The SamaSama Standard</span>
            <h1>We sift through the thousands, so you do not have to gamble on which one is actually good.</h1>
            <p>
              Finding a product online is easy. Finding one that is safe,
              reliable, pleasant to use and genuinely worth its price takes more
              work. The SamaSama Standard explains what we check before a product
              earns our recommendation.
            </p>
            <div className="standard-hero-actions">
              <Link href="#pillars" className="btn btn-primary">
                See how products make the cut
              </Link>
              <Link href={ACTIVE_BATCHES_PATH} className="btn btn-secondary">
                Explore current batches
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="standard-section">
        <div className="container-site">
          <div className="standard-section-heading">
            <span className="standard-eyebrow">The market problem</span>
            <h2>Cheap is easy to find. Good takes more work.</h2>
            <p>
              Product listings can look almost identical while hiding major
              differences in build quality, performance, materials and support. A
              high rating, impressive specification or supplier promise does not
              always tell the full story.
            </p>
          </div>

          <div className="market-compare" aria-label="Marketplace listing signals compared with SamaSama checks">
            <div className="market-panel">
              <h3>What listings often show</h3>
              <ul>
                <li>Nice photos from the best angle</li>
                <li>Big numbers without much context</li>
                <li>Supplier claims repeated as facts</li>
                <li>Reviews that may not match your use case</li>
              </ul>
            </div>
            <div className="market-panel">
              <h3>What we want to know</h3>
              <ul>
                <li>Who made it and whether they can support it</li>
                <li>Whether the claims apply to the actual model</li>
                <li>How the sample behaves in a real home</li>
                <li>What happens if something goes wrong</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="pillars" className="standard-section standard-section-muted">
        <div className="container-site">
          <div className="standard-section-heading centered">
            <span className="standard-eyebrow">Six checks before recommendation</span>
            <h2>The six pillars</h2>
            <p>
              The Standard is our practical sourcing checklist. It keeps us
              honest about what we know, what we checked and what still needs to
              be explained on the product page.
            </p>
          </div>

          <div className="pillar-overview-grid">
            {STANDARD_PILLARS.map((pillar) => (
              <article key={pillar.id} className="pillar-overview-card">
                <span className="pillar-number">{pillar.number}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.question}</p>
                <Link href={`#${pillar.id}`}>Read this check</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="standard-section">
        <div className="container-site">
          <div className="pillar-detail-list">
            {STANDARD_PILLARS.map((pillar) => (
              <article key={pillar.id} id={pillar.id} className="pillar-detail">
                <div>
                  <span className="pillar-number">{pillar.number}</span>
                  <h3>{pillar.title}</h3>
                  <p className="pillar-question">{pillar.question}</p>
                </div>
                <div className="pillar-detail-body">
                  <p>{pillar.customerCopy}</p>
                  <h4>What SamaSama looks at</h4>
                  <ul className="standard-list">
                    {pillar.whatWeLookAt.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <h4>Examples of proof we may show</h4>
                  <ul className="standard-list">
                    {pillar.proofExamples.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {pillar.doesNotMean && (
                    <div className="standard-note">
                      <p>{pillar.doesNotMean}</p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="standard-section standard-section-muted">
        <div className="container-site">
          <div className="verdict-grid">
            <div className="standard-section-heading" style={{ marginBottom: 0 }}>
              <span className="standard-eyebrow">The SamaSama Verdict</span>
              <h2>Good enough to exist is not always good enough to recommend.</h2>
              <p>
                Once a product has cleared the Standard, we still ask whether it
                offers meaningful value for the homeowner at the price, waiting
                time and support level available.
              </p>
            </div>

            <div className="verdict-points">
              {[
                "Why we chose it",
                "What we liked",
                "What could be better",
                "Who it is for",
                "Who should skip it",
                "Our final take",
              ].map((item) => (
                <div key={item} className="verdict-point">
                  <h3>{item}</h3>
                  <p>
                    Product pages should answer this plainly, including the
                    trade-offs and the realistic alternatives.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="standard-section">
        <div className="container-site">
          <div className="standard-section-heading centered">
            <span className="standard-eyebrow">Transparency</span>
            <h2>We will tell you what we did not like too.</h2>
            <p>
              Every product has compromises. Our product pages should explain not
              only the strengths, but also the weaknesses, who the product is
              right for and who may be better served elsewhere.
            </p>
          </div>

          <div className="disclosure-box">
            <h2>What the Standard means</h2>
            <p>
              The SamaSama Standard is our own sourcing and product-evaluation
              framework. It is not a government certification, independent
              laboratory accreditation or guarantee that a product will never
              develop a fault. Official regulatory approvals and test documents
              are shown separately where applicable.
            </p>
          </div>
        </div>
      </section>

      <section className="closing-cta" id="sourcing-circle-placeholder">
        <div className="container-site">
          <span className="standard-eyebrow" style={{ color: "var(--color-accent-light)" }}>
            Carefully sourced
          </span>
          <h2>Carefully sourced. Honestly evaluated. Confidently recommended.</h2>
          <p>
            See the products that have made it through our process and understand
            exactly why we chose them.
          </p>
          <div className="standard-cta-actions">
            <Link
              href={ACTIVE_BATCHES_PATH}
              className="btn btn-secondary"
              data-track="standard-page-active-batch-click"
            >
              View active batches
            </Link>
            <a
              href={SOURCING_CIRCLE_URL}
              className="btn btn-secondary"
              data-track="standard-page-sourcing-circle-click"
            >
              Join the SamaSama Sourcing Circle
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
