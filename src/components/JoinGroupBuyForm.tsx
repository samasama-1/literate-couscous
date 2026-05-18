'use client';

import { useState } from 'react';
import { joinGroupBuy } from '@/app/actions/join';

interface Props {
  batchId: string;
  depositAmount: number;
}

export default function JoinGroupBuyForm({ batchId, depositAmount }: Props) {
  const [formData, setFormData] = useState({ name: '', countryCode: '+65', phone: '', email: '', quantity: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [orderCode, setOrderCode] = useState('');
  const [isResumed, setIsResumed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await joinGroupBuy({
      batchId,
      customerName: formData.name,
      customerPhone: `${formData.countryCode}${formData.phone}`,
      customerEmail: formData.email,
      quantity: formData.quantity
    });

    if (res.error) {
      setError(res.error);
      setLoading(false);
    } else if (res.success && res.orderCode) {
      setOrderCode(res.orderCode);
      setIsResumed(!!res.message);
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ background: "white", padding: "3rem 2rem", borderRadius: "var(--radius-lg)", border: `2px solid ${isResumed ? 'var(--color-accent)' : 'var(--color-success)'}`, textAlign: "center", boxShadow: "var(--shadow-md)" }}>
        {isResumed && (
          <div style={{ background: "#FFF3CD", color: "#856404", padding: "1rem 1.5rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontSize: "0.9rem", fontWeight: 600, textAlign: "left", border: "1px solid #FFEEBA" }}>
            ⚠️ You already have a pending order for this batch tied to this phone number. We&apos;ve pulled up your existing order below. Please complete payment or contact support if you need help.
          </div>
        )}
        <h2 style={{ color: isResumed ? 'var(--color-accent)' : 'var(--color-success)', marginBottom: "1rem" }}>{isResumed ? 'Existing Order Found' : 'Spot Reserved! 🎉'}</h2>
        <p style={{ marginBottom: "2rem", fontSize: "var(--text-lg)" }}>
          Please complete your deposit of <strong style={{ color: "var(--color-primary)" }}>${(depositAmount * formData.quantity).toFixed(2)}</strong> via PayNow to officially lock in your spot.
        </p>
        
        {/* Order Code Display */}
        <div style={{ background: "var(--color-primary)", color: "white", padding: "1.5rem", borderRadius: "var(--radius-md)", marginBottom: "2rem", display: "inline-block" }}>
          <p style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem", opacity: 0.9 }}>Your Order Code</p>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, letterSpacing: "0.1em" }}>{orderCode}</div>
        </div>

        <div style={{ color: "var(--color-error)", background: "var(--color-surface)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "2rem", border: "1px solid var(--color-error)", fontSize: "0.875rem", fontWeight: 600, textAlign: "left" }}>
          ⚠️ Please screenshot or save this Order Code. You will need it to track your delivery status or contact support.
        </div>
        
        {/* Dummy QR Code */}
        <div style={{ width: "240px", height: "240px", background: "var(--color-surface)", margin: "0 auto 1.5rem", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-md)", border: "1px dashed var(--color-text-light)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>📱</div>
            <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>[ Scan PayNow QR ]</span>
          </div>
        </div>
        
        <div style={{ background: "var(--color-surface)", padding: "1.5rem", borderRadius: "var(--radius-md)", display: "inline-block", textAlign: "left", marginBottom: "1.5rem" }}>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
            <strong>UEN:</strong> SAMA1234567M
          </p>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            <strong>Reference:</strong> Please put your order code <strong style={{ color: "var(--color-primary)" }}>{orderCode}</strong> in the reference.
          </p>
        </div>

        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-light)" }}>
          Once transferred, our team will verify it and your order will instantly count towards the batch progress!
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: "white", padding: "2rem", borderRadius: "var(--radius-lg)", border: "2px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
      {error && <div style={{ color: "white", background: "var(--color-error)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: 600 }}>{error}</div>}
      
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Full Name *</label>
          <input 
            type="text" 
            required 
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "1rem" }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Phone Number *</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select
              value={formData.countryCode}
              onChange={(e) => setFormData({...formData, countryCode: e.target.value})}
              style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "1rem", background: "white", minWidth: "100px" }}
            >
              <option value="+65">🇸🇬 +65</option>
              <option value="+60">🇲🇾 +60</option>
              <option value="+62">🇮🇩 +62</option>
              <option value="+63">🇵🇭 +63</option>
              <option value="+66">🇹🇭 +66</option>
              <option value="+84">🇻🇳 +84</option>
              <option value="+91">🇮🇳 +91</option>
              <option value="+86">🇨🇳 +86</option>
              <option value="+81">🇯🇵 +81</option>
              <option value="+82">🇰🇷 +82</option>
              <option value="+44">🇬🇧 +44</option>
              <option value="+1">🇺🇸 +1</option>
            </select>
            <input 
              type="tel" 
              required 
              placeholder="8123 4567"
              minLength={8}
              value={formData.phone}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setFormData({...formData, phone: digits});
              }}
              style={{ flex: 1, padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "1rem" }}
            />
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>Minimum 8 digits required</p>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Email Address *</label>
          <input 
            type="email" 
            required
            placeholder="you@example.com"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "1rem" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Quantity (Max 10) *</label>
          <input 
            type="number" 
            min="1" 
            max="10" 
            required 
            value={formData.quantity}
            onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 1})}
            style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "1rem" }}
          />
        </div>

        <div style={{ background: "var(--color-surface)", padding: "1.5rem", borderRadius: "var(--radius-md)", marginTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1.25rem" }}>
            <span>Total Deposit Required:</span>
            <span style={{ color: "var(--color-accent)" }}>${(depositAmount * formData.quantity).toFixed(2)}</span>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="btn btn-primary btn-lg" 
          style={{ width: "100%", opacity: loading ? 0.7 : 1, transition: "opacity 0.2s" }}
        >
          {loading ? 'Processing...' : 'Reserve Spot & Pay Deposit'}
        </button>
      </form>
    </div>
  );
}
