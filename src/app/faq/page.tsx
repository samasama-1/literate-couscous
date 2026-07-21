import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ for Home Appliance Group Buys",
  description:
    "Frequently asked questions about SamaSama group buys in Singapore, including deposits, refunds, warranties, delivery timelines, and appliance compatibility.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "SamaSama FAQ",
    description:
      "Answers about SamaSama group buys, deposits, warranties, and Singapore delivery.",
    url: "/faq",
  },
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
    answer: "Warranty and replacement terms are stated on each product or batch page before the batch opens. We clarify who is responsible for support, what is covered, and how dead-on-arrival or replacement cases will be handled."
  },
  {
    question: "Will the plug work in Singapore?",
    answer: "Electrical suitability is checked as part of our review, including voltage, frequency and plug configuration. For products that need specific Singapore approvals or marks, we handle those requirements separately and show the relevant information where applicable."
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

            <div className="card" style={{ padding: "2rem" }}>
              <h3 style={{ marginBottom: "1rem", fontSize: "1.25rem", color: "var(--color-primary)" }}>
                How does SamaSama decide what is worth recommending?
              </h3>
              <p style={{ margin: 0, color: "var(--color-primary-muted)" }}>
                We use the SamaSama Standard to review suppliers, claims,
                samples, Singapore requirements, production quality and
                after-sales support.{" "}
                <Link href="/the-samasama-standard" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
                  Read how the Standard works.
                </Link>
              </p>
            </div>
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
