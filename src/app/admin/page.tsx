import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyOrder } from "../actions/admin";
import { signOut } from "../actions/auth";
import CreateLobangForm from "@/components/CreateLobangForm";

export const revalidate = 0;

export default async function AdminDashboard() {
  // Fetch pending orders for the verification queue
  const { data: pendingOrders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('payment_status', 'PENDING_PAYNOW')
    .order('created_at', { ascending: false });

  // Fetch ALL orders for the full orders view
  const { data: allOrders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
    PENDING_PAYNOW: { bg: '#FFF3CD', color: '#856404', label: '⏳ Pending' },
    VERIFIED: { bg: '#D4EDDA', color: '#155724', label: '✅ Verified' },
    REFUNDED: { bg: '#F8D7DA', color: '#721C24', label: '↩️ Refunded' },
  };

  return (
    <div className="container-site" style={{ padding: "4rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
        <form action={signOut}>
          <button type="submit" className="btn btn-outline btn-sm">
            Secure Logout
          </button>
        </form>
      </div>
      
      {/* ── Pending Verification Queue ── */}
      <div style={{ background: "white", padding: "2rem", borderRadius: "var(--radius-lg)", border: "2px solid var(--color-border)", boxShadow: "var(--shadow-md)", marginBottom: "3rem" }}>
        <h2 style={{ marginBottom: "1.5rem" }}>Pending PayNow Deposits</h2>
        
        {!pendingOrders || pendingOrders.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", background: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px dashed var(--color-border)" }}>
            <span style={{ fontSize: "3rem", display: "block", marginBottom: "1rem" }}>✅</span>
            <h3 style={{ color: "var(--color-success)", marginBottom: "0.5rem" }}>All caught up!</h3>
            <p>No pending orders to verify right now.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                  <th style={{ padding: "1rem" }}>Date</th>
                  <th style={{ padding: "1rem" }}>Customer</th>
                  <th style={{ padding: "1rem" }}>Phone (Reference)</th>
                  <th style={{ padding: "1rem" }}>Batch ID</th>
                  <th style={{ padding: "1rem" }}>Qty</th>
                  <th style={{ padding: "1rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map(order => (
                  <tr key={order.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "1rem", color: "var(--color-text-muted)" }}>{new Date(order.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: "1rem", fontWeight: 600 }}>{order.customer_name}</td>
                    <td style={{ padding: "1rem" }}>
                      <span className="badge" style={{ background: "var(--color-surface)", color: "var(--color-primary)", border: "1px solid var(--color-border)" }}>
                        {order.customer_phone}
                      </span>
                    </td>
                    <td style={{ padding: "1rem", fontSize: "0.875rem", color: "var(--color-text-light)" }}>{order.batch_id.slice(0, 8)}...</td>
                    <td style={{ padding: "1rem" }}><strong>{order.quantity}</strong></td>
                    <td style={{ padding: "1rem", textAlign: "right" }}>
                      <form action={async () => {
                        'use server';
                        await verifyOrder(order.id);
                      }}>
                        <button type="submit" className="btn btn-primary btn-sm" style={{ padding: "0.5rem 1rem" }}>
                          Verify Deposit
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── All Orders ── */}
      <div style={{ background: "white", padding: "2rem", borderRadius: "var(--radius-lg)", border: "2px solid var(--color-border)", boxShadow: "var(--shadow-md)", marginBottom: "3rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: 0 }}>All Orders</h2>
          <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", background: "var(--color-surface)", padding: "0.25rem 0.75rem", borderRadius: "var(--radius-md)" }}>
            {allOrders?.length || 0} total
          </span>
        </div>

        {!allOrders || allOrders.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", background: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px dashed var(--color-border)" }}>
            <span style={{ fontSize: "3rem", display: "block", marginBottom: "1rem" }}>📭</span>
            <h3 style={{ marginBottom: "0.5rem" }}>No orders yet</h3>
            <p>Orders will appear here once customers join a group buy.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                  <th style={{ padding: "1rem" }}>Date</th>
                  <th style={{ padding: "1rem" }}>Order Code</th>
                  <th style={{ padding: "1rem" }}>Customer</th>
                  <th style={{ padding: "1rem" }}>Phone</th>
                  <th style={{ padding: "1rem" }}>Email</th>
                  <th style={{ padding: "1rem" }}>Batch</th>
                  <th style={{ padding: "1rem", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "1rem" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {allOrders.map(order => {
                  const status = statusStyles[order.payment_status] || { bg: '#eee', color: '#333', label: order.payment_status };
                  return (
                    <tr key={order.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "1rem", color: "var(--color-text-muted)", fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                        {new Date(order.created_at).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <code style={{ background: "var(--color-surface)", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "0.875rem" }}>
                          {order.order_code || '—'}
                        </code>
                      </td>
                      <td style={{ padding: "1rem", fontWeight: 600 }}>{order.customer_name}</td>
                      <td style={{ padding: "1rem", fontSize: "0.875rem" }}>{order.customer_phone}</td>
                      <td style={{ padding: "1rem", fontSize: "0.875rem", color: "var(--color-text-muted)" }}>{order.customer_email || '—'}</td>
                      <td style={{ padding: "1rem", fontSize: "0.8rem", color: "var(--color-text-light)" }}>{order.batch_id.slice(0, 8)}...</td>
                      <td style={{ padding: "1rem", textAlign: "center", fontWeight: 700 }}>{order.quantity}</td>
                      <td style={{ padding: "1rem" }}>
                        <span style={{
                          background: status.bg,
                          color: status.color,
                          padding: "0.25rem 0.75rem",
                          borderRadius: "999px",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          whiteSpace: "nowrap"
                        }}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create New Lobang ── */}
      <div>
        <h2 style={{ marginBottom: "1.5rem" }}>Create New Lobang</h2>
        <CreateLobangForm />
      </div>
    </div>
  );
}

