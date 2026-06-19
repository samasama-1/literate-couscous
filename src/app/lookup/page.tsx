import OrderLookupForm from "@/components/OrderLookupForm";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order Status Lookup",
  description:
    "Check your SamaSama group-buy order status, payment verification, and batch progress securely.",
  alternates: {
    canonical: "/lookup",
  },
  openGraph: {
    title: "SamaSama Order Status Lookup",
    description:
      "Securely check your SamaSama group-buy order and batch progress in Singapore.",
    url: "/lookup",
  },
};

export default function LookupPage() {
  return (
    <div className="container-site" style={{ padding: "4rem 2rem", minHeight: "80vh" }}>
      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <h1 style={{ marginBottom: "1rem" }}>Order Status</h1>
        <p style={{ fontSize: "var(--text-lg)", color: "var(--color-text-muted)", maxWidth: "600px", margin: "0 auto" }}>
          Securely check your payment verification status and track your group buy progress.
        </p>
      </div>

      <OrderLookupForm />

      <div style={{ textAlign: "center", marginTop: "4rem" }}>
        <Link href="/" style={{ color: "var(--color-primary)", fontWeight: 600, display: "inline-block", padding: "0.5rem 1rem", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-md)" }}>
          ← Back to Homepage
        </Link>
      </div>
    </div>
  );
}
