'use client';

import { useState } from 'react';
import { createLobang } from '@/app/actions/admin';

export default function CreateLobangForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    retail_price: '',
    image_url: '',
    features: '',
    target_capacity: '50',
    deposit_amount: '',
    tier_1_price: '',
    tier_2_price: '',
    tier_3_price: '',
    closes_at: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Prepare closing date. 
    let closingDateStr = formData.closes_at;
    if (closingDateStr) {
      closingDateStr = new Date(closingDateStr).toISOString();
    } else {
      // Default to 14 days from now if left blank
      const d = new Date();
      d.setDate(d.getDate() + 14);
      closingDateStr = d.toISOString();
    }

    const res = await createLobang(
      {
        name: formData.name,
        description: formData.description,
        retail_price: Number(formData.retail_price) || 0,
        image_url: formData.image_url,
        features: formData.features,
      },
      {
        target_capacity: Number(formData.target_capacity) || 50,
        deposit_amount: Number(formData.deposit_amount) || 0,
        tier_1_price: Number(formData.tier_1_price) || 0,
        tier_2_price: formData.tier_2_price ? Number(formData.tier_2_price) : undefined,
        tier_3_price: formData.tier_3_price ? Number(formData.tier_3_price) : undefined,
        closes_at: closingDateStr,
      }
    );

    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccess('Successfully launched the new Lobang! Check the homepage.');
      // Reset form
      setFormData({
        name: '', description: '', retail_price: '', image_url: '', features: '',
        target_capacity: '50', deposit_amount: '', tier_1_price: '', tier_2_price: '', tier_3_price: '', closes_at: ''
      });
    }
  };

  return (
    <div style={{ background: "white", padding: "2rem", borderRadius: "var(--radius-lg)", border: "2px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
      {error && <div style={{ color: "white", background: "var(--color-error)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: 600 }}>{error}</div>}
      {success && <div style={{ color: "white", background: "var(--color-success)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: 600 }}>{success}</div>}
      
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        
        {/* --- Product Section --- */}
        <div>
          <h3 style={{ marginBottom: "1rem", color: "var(--color-primary)", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.5rem" }}>1. Product Details</h3>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Product Name *</label>
              <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Description *</label>
              <textarea required rows={3} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Retail Price (Optional) $</label>
              <input type="number" step="0.01" value={formData.retail_price} onChange={(e) => setFormData({...formData, retail_price: e.target.value})} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Image URL (Optional)</label>
              <input type="url" value={formData.image_url} onChange={(e) => setFormData({...formData, image_url: e.target.value})} placeholder="https://..." style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Features (One per line)</label>
              <textarea rows={4} value={formData.features} onChange={(e) => setFormData({...formData, features: e.target.value})} placeholder="Self-cleaning brush&#10;Dual water tanks&#10;Singapore plug" style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>
          </div>
        </div>

        {/* --- Batch Section --- */}
        <div>
          <h3 style={{ marginBottom: "1rem", color: "var(--color-primary)", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.5rem" }}>2. Group Buy Batch Details</h3>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Target Capacity (Units) *</label>
              <input required type="number" value={formData.target_capacity} onChange={(e) => setFormData({...formData, target_capacity: e.target.value})} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Required Deposit Amount $ *</label>
              <input required type="number" step="0.01" value={formData.deposit_amount} onChange={(e) => setFormData({...formData, deposit_amount: e.target.value})} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Base Price (Tier 1) $ *</label>
              <input required type="number" step="0.01" value={formData.tier_1_price} onChange={(e) => setFormData({...formData, tier_1_price: e.target.value})} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Tier 2 Unlock Price (Optional) $</label>
              <input type="number" step="0.01" value={formData.tier_2_price} onChange={(e) => setFormData({...formData, tier_2_price: e.target.value})} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Tier 3 Unlock Price (Optional) $</label>
              <input type="number" step="0.01" value={formData.tier_3_price} onChange={(e) => setFormData({...formData, tier_3_price: e.target.value})} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Closing Date (Optional)</label>
              <input type="date" value={formData.closes_at} onChange={(e) => setFormData({...formData, closes_at: e.target.value})} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} />
            </div>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="btn btn-primary btn-lg" 
          style={{ width: "100%", opacity: loading ? 0.7 : 1, transition: "opacity 0.2s" }}
        >
          {loading ? 'Processing...' : 'Launch New Lobang!'}
        </button>
      </form>
    </div>
  );
}
