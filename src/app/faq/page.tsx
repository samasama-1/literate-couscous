export const metadata = {
  title: "FAQ | Sama Sama",
  description: "Frequently asked questions about Sama Sama group buys, warranties, and factory-direct pricing.",
};

const faqs = [
  {
    question: "Why are the prices so much cheaper than retail?",
    answer: "We cut out the middlemen—distributors, wholesalers, and retail showrooms. By aggregating orders into a single large 'batch', we negotiate directly with the factory at wholesale volume prices. You pay what the product is actually worth, not the marketing markup."
  },
  {
    question: "Is my deposit safe?",
    answer: "Yes. Deposits are securely held. If a batch fails to reach its minimum required volume by the closing date, your deposit is refunded in full via PayNow within 3 working days. No questions asked."
  },
  {
    question: "What happens if I change my mind?",
    answer: "You can cancel your participation and get a full refund of your deposit anytime BEFORE the batch officially closes and the order is placed with the factory. Once the batch is locked and production begins, deposits become non-refundable."
  },
  {
    question: "Do these appliances come with a warranty?",
    answer: "Yes! Every product we curate comes with a local Singapore warranty (typically 6 to 12 months, stated on the product page). We manage a local repair network, so you don't have to ship heavy items back to China if something goes wrong."
  },
  {
    question: "Will the plug work in Singapore?",
    answer: "Absolutely. We only import units that are compatible with Singapore's 230V voltage. Where applicable, we specifically request UK/SG 3-pin plugs from the factory, or provide a high-quality, safety-certified adapter."
  },
  {
    question: "How long does delivery take?",
    answer: "Because these are factory-direct group buys, timelines vary. Usually, it takes 3-4 weeks from the date the batch CLOSES for the items to be manufactured, shipped via sea freight, and cleared through Singapore customs. We keep you updated via WhatsApp at every step."
  }
];

export default function FAQPage() {
  return (
    <div style={{ background: "white", minHeight: "100vh", paddingBottom: "var(--space-4xl)" }}>
      <section className="section" style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="container-site">
          <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}>
            <h1 style={{ marginBottom: "1rem" }}>Frequently Asked Questions</h1>
            <p style={{ fontSize: "var(--text-lg)" }}>
              Everything you need to know about Sama Sama group buys.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-site">
          <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {faqs.map((faq, index) => (
              <div key={index} className="card" style={{ padding: "2rem" }}>
                <h3 style={{ marginBottom: "1rem", fontSize: "1.25rem", color: "var(--color-primary)" }}>
                  {faq.question}
                </h3>
                <p style={{ margin: 0, color: "var(--color-primary-muted)" }}>
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: "4rem", padding: "3rem", background: "var(--color-surface)", borderRadius: "var(--radius-xl)", border: "2px solid var(--color-border)" }}>
            <h3 style={{ marginBottom: "1rem" }}>Still have questions?</h3>
            <p style={{ marginBottom: "2rem" }}>Our team is ready to help via WhatsApp.</p>
            <a href="https://wa.me/6500000000" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Chat with us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
