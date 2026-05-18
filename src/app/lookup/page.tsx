import OrderLookupForm from "@/components/OrderLookupForm";
import Link from "next/link";

export const metadata = {
  title: 'Order Status Lookup | Sama Sama',
  description: 'Check the status of your group buy order securely.',
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
