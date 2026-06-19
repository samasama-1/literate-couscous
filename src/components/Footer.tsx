"use client";

import Link from "next/link";

const footerLinks = {
  Shop: [
    { href: "/", label: "Active Batches" },
    { href: "/lookup", label: "Track My Order" },
    { href: "/appointments", label: "Book Collection" },
  ],
  Learn: [
    { href: "/how-it-works", label: "How It Works" },
    { href: "/faq", label: "FAQ & Help" },
  ],
  Company: [
    { href: "/terms", label: "Terms of Service" },
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/refunds-and-replacements", label: "Refunds & Replacements" },
    { href: "/collection-delivery", label: "Collection & Delivery" },
    { href: "/referrals", label: "Referral Terms" },
  ],
};

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{ background: "var(--color-bg)", color: "var(--color-text)", marginTop: "auto", borderTop: "1px solid var(--color-border)" }}>
      <style>{`
        .footer-link {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          color: var(--color-primary-muted);
          text-decoration: none;
          transition: color var(--transition-fast);
          display: inline-block;
        }
        .footer-link:hover { color: var(--color-primary); }

        .newsletter-input {
          font-family: var(--font-body);
          font-size: var(--text-sm);
          padding: 0.625rem 1rem;
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-border);
          background-color: rgba(255, 255, 255, 0.72);
          color: var(--color-text);
          outline: none;
          width: 100%;
          transition: border-color var(--transition-base);
        }

        .newsletter-input:focus {
          border-color: var(--color-primary);
        }

        .newsletter-btn {
          padding: 0.625rem 1rem;
          border-radius: var(--radius-lg);
          background-color: var(--color-primary);
          color: white;
          border: none;
          cursor: pointer;
          font-weight: bold;
          transition: background-color var(--transition-base);
        }

        .newsletter-btn:hover {
          background-color: var(--color-accent-dark);
        }

        @media (min-width: 768px) {
          .footer-grid { grid-template-columns: 1.35fr 0.75fr 0.75fr 1fr !important; }
        }
      `}</style>

      {/* Main content */}
      <div className="container-site" style={{ padding: "4.5rem 1.25rem 3.25rem" }}>
        <div
          className="footer-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: "3rem" }}
        >
          {/* Brand Column */}
          <div style={{ maxWidth: "320px" }}>
            <div style={{ marginBottom: "1.25rem" }}>
              <span style={{ 
                fontFamily: "var(--font-display)",
                fontWeight: 500, 
                fontSize: "1.35rem", 
                color: "var(--color-text)",
                letterSpacing: "-0.01em",
              }}>
                Sama Sama
              </span>
            </div>

            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              Useful home appliances, sourced carefully and brought in through transparent group buys for Singapore homes.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <p style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-xs)", 
                fontWeight: 600, 
                letterSpacing: "0.08em",
                textTransform: "uppercase", 
                color: "var(--color-text)", 
                marginBottom: "1.25rem",
              }}>
                {title}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="footer-link">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter Column */}
          <div>
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-xs)", 
              fontWeight: 600, 
              letterSpacing: "0.08em",
              textTransform: "uppercase", 
              color: "var(--color-text)", 
              marginBottom: "1.25rem",
            }}>
              Newsletter
            </p>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-primary-muted)", marginBottom: "1rem" }}>
              Get notified when new batches open.
            </p>
            <form style={{ display: "flex", gap: "0.5rem" }} onSubmit={(e) => e.preventDefault()}>
              <input type="email" placeholder="Email Address" className="newsletter-input" required />
              <button type="submit" className="newsletter-btn">→</button>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <div
          className="container-site"
          style={{
            display: "flex", flexWrap: "wrap", alignItems: "center",
            justifyContent: "space-between", gap: "1rem", padding: "1.5rem 1.25rem",
          }}
        >
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-light)", margin: 0 }}>
            © {year} Sama Sama. All rights reserved. 
          </p>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-light)", margin: 0 }}>
            Curated appliances, not mass-marketed.
          </p>
        </div>
      </div>
    </footer>
  );
}
