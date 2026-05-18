import Link from "next/link";

export const metadata = {
  title: "How It Works | Sama Sama",
  description: "Learn how the Sama Sama group buy process works. Secure your slot with a deposit, unlock better prices together, and get factory-direct deals.",
};

const steps = [
  {
    number: "01",
    title: "Browse the Lobangs",
    description: "We carefully vet and select premium Chinese home appliances. When a product passes our quality checks, we open a 'batch' (group buy) for it.",
    icon: "🔍",
  },
  {
    number: "02",
    title: "Secure Your Slot",
    description: "Pay a small, fully-refundable deposit via PayNow to lock in your position in the batch. Your deposit signals real intent to the factory.",
    icon: "🔒",
  },
  {
    number: "03",
    title: "Unlock Better Prices",
    description: "This is where the magic happens. As more people join the batch, we hit higher volume tiers with the factory, dropping the price for everyone.",
    icon: "🔓",
  },
  {
    number: "04",
    title: "Batch Closes & Final Payment",
    description: "Once the batch hits its deadline or capacity, the final price is locked in. We'll WhatsApp you to pay the remaining balance.",
    icon: "💰",
  },
  {
    number: "05",
    title: "Ship & Collect",
    description: "The factory produces and ships the batch directly to Singapore. You can pick it up from our collection point or arrange for local delivery.",
    icon: "📦",
  },
];

export default function HowItWorksPage() {
  return (
    <div style={{ background: "var(--color-surface)", minHeight: "100vh", paddingBottom: "var(--space-4xl)" }}>
      {/* Hero */}
      <section className="section" style={{ background: "var(--color-accent)", color: "white" }}>
        <div className="container-site">
          <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}>
            <h1 style={{ color: "white", marginBottom: "1rem", textShadow: "2px 2px 0px var(--color-primary)", WebkitTextStroke: "1px var(--color-primary)" }}>
              How It Works
            </h1>
            <p style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "rgba(255,255,255,0.9)", margin: 0 }}>
              Group buying made simple, transparent, and fair.
            </p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="section">
        <div className="container-site">
          <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "2rem" }}>
            {steps.map((step, index) => (
              <div key={step.number} className="card" style={{ display: "flex", gap: "2rem", padding: "2rem", alignItems: "flex-start" }}>
                <div style={{ 
                  flexShrink: 0, 
                  width: "80px", 
                  height: "80px", 
                  borderRadius: "var(--radius-xl)", 
                  background: "var(--color-blue)", 
                  border: "2px solid var(--color-primary)",
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  fontSize: "2rem",
                  boxShadow: "var(--shadow-bold)",
                  transform: index % 2 === 0 ? "rotate(-3deg)" : "rotate(3deg)"
                }}>
                  {step.icon}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "1.25rem", fontWeight: 900, color: "var(--color-accent)", opacity: 0.8 }}>
                      {step.number}
                    </span>
                    <h2 style={{ fontSize: "1.5rem", margin: 0 }}>{step.title}</h2>
                  </div>
                  <p style={{ fontSize: "var(--text-lg)", color: "var(--color-primary-muted)" }}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: "4rem" }}>
            <Link href="/products" className="btn btn-primary btn-lg">
              Browse Active Batches
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
