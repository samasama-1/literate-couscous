import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How SamaSama Group Buys Work",
  description:
    "Learn how SamaSama group buys work in Singapore, from choosing a batch and placing a deposit to final pricing, balance payment, shipping, and collection.",
  alternates: {
    canonical: "/how-it-works",
  },
  openGraph: {
    title: "How SamaSama Group Buys Work",
    description:
      "A simple, transparent group-buy process for practical home appliances in Singapore.",
    url: "/how-it-works",
  },
};

const steps = [
  {
    number: "01",
    title: "Choose a batch",
    description: "Browse current batches and product details. We only list products we have evaluated and believe are suitable for Singapore homes.",
  },
  {
    number: "02",
    title: "Place a deposit",
    description: "Pay a small, fully-refundable deposit to secure your slot. Your deposit shows genuine interest to the supplier.",
  },
  {
    number: "03",
    title: "We verify demand",
    description: "We count verified deposits and share batch progress clearly as more buyers join.",
  },
  {
    number: "04",
    title: "Batch closes and final price is locked",
    description: "When the batch reaches its target or deadline, we confirm the best achieved price with the supplier.",
  },
  {
    number: "05",
    title: "Pay balance",
    description: "You receive the final price and pay the remaining balance to confirm your order.",
  },
  {
    number: "06",
    title: "Ship and collect",
    description: "We handle production and shipping updates. Once items arrive in Singapore, you can collect or arrange local delivery.",
  },
];

export default function HowItWorksPage() {
  return (
    <div style={{ background: "var(--color-bg)", minHeight: "100vh" }}>
      <style>{`
        .how-hero {
          background:
            radial-gradient(circle at 50% 0%, rgba(226, 220, 208, 0.6), transparent 38%),
            var(--color-surface);
          border-bottom: 1px solid var(--color-border);
          padding: clamp(4rem, 9vw, 7.5rem) 0;
        }

        .how-hero-inner {
          max-width: 760px;
          margin: 0 auto;
          text-align: center;
        }

        .how-hero h1 {
          font-size: clamp(2.35rem, 5vw, 4rem);
          font-weight: 500;
          letter-spacing: -0.015em;
          margin-bottom: 1rem;
        }

        .how-hero p {
          font-size: var(--text-md);
          line-height: 1.75;
          color: var(--color-primary-muted);
        }

        .steps-section {
          padding: clamp(4.5rem, 8vw, 7rem) 0;
        }

        .steps-list {
          max-width: 860px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
        }

        .step-row {
          display: grid;
          grid-template-columns: 5rem minmax(0, 1fr);
          gap: clamp(1.5rem, 5vw, 3.5rem);
          padding: 2.25rem 0;
          border-bottom: 1px solid var(--color-border);
        }

        .step-row:first-child {
          border-top: 1px solid var(--color-border);
        }

        .step-number {
          width: 3.5rem;
          height: 3.5rem;
          border-radius: var(--radius-full);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
          font-size: var(--text-sm);
          font-weight: 600;
          letter-spacing: 0.04em;
        }

        .step-content h2 {
          font-size: clamp(1.25rem, 2.3vw, 1.65rem);
          font-weight: 600;
          letter-spacing: -0.01em;
          margin-bottom: 0.75rem;
        }

        .step-content p {
          max-width: 620px;
          font-size: var(--text-base);
          line-height: 1.75;
        }

        .deposit-note {
          max-width: 860px;
          margin: 3rem auto 0;
          padding: clamp(1.75rem, 4vw, 2.5rem);
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          text-align: center;
        }

        .deposit-note h2 {
          font-size: var(--text-xl);
          font-weight: 600;
          margin-bottom: 0.75rem;
        }

        .deposit-note p {
          max-width: 640px;
          margin: 0 auto;
          font-size: var(--text-sm);
          line-height: 1.75;
        }

        .how-cta {
          background: var(--color-primary);
          color: white;
          padding: clamp(4rem, 8vw, 6rem) 0;
          text-align: center;
        }

        .how-cta h2 {
          color: white;
          font-size: clamp(1.75rem, 3vw, 2.5rem);
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .how-cta p {
          color: var(--color-accent-light);
          margin: 0 auto 2rem;
          max-width: 520px;
        }

        @media (max-width: 640px) {
          .step-row {
            grid-template-columns: 1fr;
            gap: 1rem;
            padding: 1.75rem 0;
          }
        }
      `}</style>

      <section className="how-hero">
        <div className="container-site">
          <div className="how-hero-inner">
            <h1>How It Works</h1>
            <p>Group buying made simple, transparent, and fair.</p>
          </div>
        </div>
      </section>

      <section className="steps-section">
        <div className="container-site">
          <div className="steps-list">
            {steps.map((step) => (
              <article key={step.number} className="step-row">
                <div>
                  <span className="step-number">{step.number}</span>
                </div>
                <div className="step-content">
                  <h2>{step.title}</h2>
                  <p>{step.description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="deposit-note">
            <h2>Why deposits?</h2>
            <p>
              Deposits help us confirm real demand with suppliers, so we can negotiate the best possible price for everyone in the batch. If a batch does not reach its target, your deposit is fully refunded.
            </p>
          </div>
        </div>
      </section>

      <section className="how-cta">
        <div className="container-site">
          <h2>Ready to join the collective?</h2>
          <p>Better products. Better prices. Brought in together.</p>
          <Link href="/#deals" className="btn btn-secondary">
            View current batches
          </Link>
        </div>
      </section>
    </div>
  );
}
