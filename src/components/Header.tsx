"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const navLinks = [
  { href: "/", label: "Deals" },
  { href: "/why-factory-direct", label: "Why Direct" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/faq", label: "FAQ" },
  { href: "/appointments", label: "Book Appointment" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      <style>{`
        .header-main {
          position: sticky;
          top: 0;
          z-index: 100;
          background-color: var(--color-bg);
          border-bottom: 1px solid var(--color-border);
          transition: all var(--transition-base);
        }
        
        .nav-link {
          font-family: var(--font-body);
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--color-text-muted);
          transition: color var(--transition-fast);
          letter-spacing: 0.03em;
        }

        .nav-link:hover {
          color: var(--color-primary);
        }

        .btn-start-group {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-weight: 500;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-full);
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text);
          transition: all var(--transition-base);
        }

        .btn-start-group:hover {
          background-color: var(--color-primary);
          color: white;
          border-color: var(--color-primary);
        }

        .hamburger-line {
          display: block;
          width: 20px;
          height: 2px;
          background-color: var(--color-text);
          transition: all var(--transition-fast);
        }

        @media (max-width: 767px) {
          .desktop-nav-container { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>

      <header className="header-main">
        <div
          className="container-site"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: "70px",
          }}
        >
          {/* Left: Brand Logo in editorial serif font */}
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              fontSize: "1.375rem",
              color: "var(--color-text)",
              letterSpacing: "-0.01em",
            }}
          >
            Sama Sama
          </Link>

          {/* Center: Navigation Links */}
          <nav
            className="desktop-nav-container"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2rem",
            }}
          >
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="nav-link">
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right: Actions */}
          <div
            className="desktop-nav-container"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1.5rem",
            }}
          >
            <Link href="/lookup" className="nav-link">
              Lookup Order
            </Link>
            
            <Link href="/admin" className="btn-start-group">
              Admin Portal
            </Link>
          </div>

          {/* Mobile hamburger button */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
            style={{
              display: "none",
              flexDirection: "column",
              gap: "4px",
              padding: "0.5rem",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <span
              className="hamburger-line"
              style={{
                transform: menuOpen ? "rotate(45deg) translate(4px, 4px)" : "none",
              }}
            />
            <span
              className="hamburger-line"
              style={{
                opacity: menuOpen ? 0 : 1,
              }}
            />
            <span
              className="hamburger-line"
              style={{
                transform: menuOpen ? "rotate(-45deg) translate(4px, -4px)" : "none",
              }}
            />
          </button>
        </div>

        {/* Mobile menu drop-down */}
        {menuOpen && (
          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              backgroundColor: "var(--color-bg)",
              padding: "1.5rem 1.25rem",
              position: "absolute",
              width: "100%",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <nav style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    fontSize: "var(--text-md)",
                    color: "var(--color-text)",
                    fontWeight: 500,
                  }}
                >
                  {link.label}
                </Link>
              ))}
              <hr style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: "0.5rem 0" }} />
              <Link
                href="/lookup"
                onClick={() => setMenuOpen(false)}
                style={{
                  fontSize: "var(--text-md)",
                  color: "var(--color-primary)",
                  fontWeight: 500,
                }}
              >
                Lookup Order &rarr;
              </Link>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
