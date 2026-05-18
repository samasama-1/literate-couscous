'use client';

import { useState } from 'react';
import { lookupOrder, type SafeOrderPayload } from '@/app/actions/lookup';

export default function OrderLookupForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<SafeOrderPayload | null>(null);

  const [orderId, setOrderId] = useState('');
  const [authValue, setAuthValue] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setPayload(null);

    const res = await lookupOrder(orderId, authValue);

    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setPayload(res.data);
    }
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ background: "white", padding: "2rem", borderRadius: "var(--radius-lg)", border: "2px solid var(--color-border)", boxShadow: "var(--shadow-md)" }}>
        <h2 style={{ marginBottom: "1.5rem" }}>Track Your Order</h2>
        <p style={{ color: "var(--color-text-muted)", marginBottom: "2rem" }}>
          Enter your Order Code and the phone number or email you used at checkout.
        </p>

        {error && (
          <div style={{ color: "white", background: "var(--color-error)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: 600 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Order Code *</label>
            <input
              type="text"
              required
              placeholder="e.g. SAMA-8A3B2F"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "1rem" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Phone Number or Email *</label>
            <input
              type="text"
              required
              placeholder="Used during checkout"
              value={authValue}
              onChange={(e) => setAuthValue(e.target.value)}
              style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "1rem" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-lg"
            style={{ width: "100%", opacity: loading ? 0.7 : 1, transition: "opacity 0.2s" }}
          >
            {loading ? 'Searching...' : 'Find My Order'}
          </button>
        </form>
      </div>

      {payload && (
        <div style={{ marginTop: "3rem", background: "white", padding: "2.5rem", borderRadius: "var(--radius-lg)", border: "2px solid var(--color-primary)", boxShadow: "var(--shadow-lg)" }}>
          <h2 style={{ color: "var(--color-primary)", borderBottom: "1px solid var(--color-border)", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
            Order Details Found
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "2rem" }}>
            <div>
              <h4 style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>Product</h4>
              <p style={{ fontWeight: 600, fontSize: "1.125rem" }}>{payload.product_name}</p>
            </div>
            <div>
              <h4 style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>Quantity</h4>
              <p style={{ fontWeight: 600, fontSize: "1.125rem" }}>{payload.quantity} Unit(s)</p>
            </div>
          </div>

          <div style={{ background: "var(--color-surface)", padding: "1.5rem", borderRadius: "var(--radius-md)", marginBottom: "2rem" }}>
            <h4 style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Payment Status</h4>
            {payload.payment_status === 'VERIFIED' ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-success)", fontWeight: 700, fontSize: "1.25rem" }}>
                <span>✅</span> Payment Verified
              </div>
            ) : payload.payment_status === 'PENDING_PAYNOW' ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-accent)", fontWeight: 700, fontSize: "1.25rem" }}>
                <span>⏳</span> Pending PayNow Verification
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-text-muted)", fontWeight: 700, fontSize: "1.25rem" }}>
                <span>🔄</span> {payload.payment_status}
              </div>
            )}
          </div>

          <div>
            <h4 style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Batch Progress</h4>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontWeight: 600 }}>
              <span>{payload.confirmed_quantity} / {payload.target_capacity} Units Confirmed</span>
              <span className={`badge ${payload.batch_status === 'OPEN' ? 'badge-open' : 'badge-closed'}`}>
                {payload.batch_status}
              </span>
            </div>

            <div style={{ width: "100%", height: "12px", background: "var(--color-surface)", borderRadius: "999px", overflow: "hidden", marginBottom: "0.5rem", border: "1px solid var(--color-border)" }}>
              <div
                style={{
                  height: "100%",
                  background: "var(--color-primary)",
                  width: `${Math.min(100, (payload.confirmed_quantity / payload.target_capacity) * 100)}%`,
                  transition: "width 0.5s ease"
                }}
              ></div>
            </div>

            <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.5rem" }}>
              Only verified payments count towards the batch progress.
            </p>
          </div>

          <div style={{ marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px dashed var(--color-border)", textAlign: "center" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
              {payload.support_cta}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
