import Link from "next/link";

export const metadata = {
  title: "Why Direct | Sama Sama",
  description: "Discover why factory-direct group buys are the smartest way to purchase premium home appliances in Singapore.",
};

export default function WhyDirectPage() {
  return (
    <div style={{ background: "white", minHeight: "100vh", paddingBottom: "var(--space-4xl)" }}>
      {/* Hero */}
      <section className="section" style={{ background: "var(--color-blue)", borderBottom: "2px solid var(--color-primary)" }}>
        <div className="container-site">
          <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}>
            <h1 style={{ color: "var(--color-primary)", marginBottom: "1rem" }}>
              Why Factory Direct?
            </h1>
            <p style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--color-primary)", margin: 0 }}>
              Stop paying for logos. Start paying for quality.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="section">
        <div className="container-site">
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            
            <div style={{ marginBottom: "3rem" }}>
              <h2 style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>The Traditional Retail Trap</h2>
              <p style={{ fontSize: "var(--text-lg)", marginBottom: "1rem" }}>
                When you buy an appliance from a major retail store in Singapore, you aren&apos;t just paying for the machine. You&apos;re paying for:
              </p>
              <ul style={{ fontSize: "var(--text-lg)", display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem", paddingLeft: "1.5rem", color: "var(--color-error)" }}>
                <li>The brand&apos;s massive marketing budget</li>
                <li>The regional distributor&apos;s profit margin</li>
                <li>The local wholesaler&apos;s cut</li>
                <li>The physical retail showroom rent</li>
                <li>The salesperson&apos;s commission</li>
              </ul>
              <p style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
                By the time the product reaches your home, it has been marked up by 200% to 400%.
              </p>
            </div>

            <div style={{ marginBottom: "3rem", padding: "3rem 2rem", background: "var(--color-surface)", borderRadius: "var(--radius-xl)", border: "2px solid var(--color-border)" }}>
              <h2 style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>The Sama Sama Way</h2>
              <p style={{ fontSize: "var(--text-lg)", marginBottom: "1.5rem" }}>
                China is the factory of the world. The same production lines that build expensive &quot;Western&quot; branded appliances are also creating incredible, feature-packed domestic brands.
              </p>
              <p style={{ fontSize: "var(--text-lg)", marginBottom: "1.5rem" }}>
                We find the best of these factories. We test their flagship models. If they pass our strict quality checks, we aggregate demand in Singapore through a group buy, and order directly from the factory floor.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
                <span className="badge badge-success" style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}>No Distributor Markups</span>
                <span className="badge badge-success" style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}>No Marketing Budgets</span>
                <span className="badge badge-success" style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}>Just Raw Hardware Value</span>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>What about warranty?</h2>
              <p style={{ fontSize: "var(--text-lg)", marginBottom: "1rem" }}>
                The biggest fear of buying direct is the lack of support. If it breaks, who fixes it?
              </p>
              <p style={{ fontSize: "var(--text-lg)", marginBottom: "2rem" }}>
                That&apos;s where we add the final layer of value. We negotiate spare parts directly into our factory contracts and maintain a local repair network in Singapore. You get factory-direct prices, but with local peace of mind.
              </p>
              <Link href="/products" className="btn btn-primary btn-lg">
                See What We&apos;re Buying Next
              </Link>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
}
