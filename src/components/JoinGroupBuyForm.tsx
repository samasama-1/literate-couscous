'use client';

import { useState } from 'react';
import Image from 'next/image';
import { joinGroupBuy } from '@/app/actions/join';

interface Props {
  batchId: string;
  depositAmount: number;
  payment: {uen?: string;payee?: string;qr?: string;configured:boolean};
}

export default function JoinGroupBuyForm({ batchId, depositAmount, payment }: Props) {
  const [formData, setFormData] = useState({ name: '', countryCode: '+65', phone: '', email: '', quantity: 1, addressLine1: '', addressLine2: '', postalCode: '', fulfilmentMethod: 'collection' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [orderCode, setOrderCode] = useState('');
  const [savedDeposit,setSavedDeposit]=useState<number|null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await joinGroupBuy({
      batchId,
      customerName: formData.name,
      customerPhone: `${formData.countryCode}${formData.phone}`,
      customerEmail: formData.email,
      quantity: formData.quantity,
      addressLine1: formData.addressLine1,
      addressLine2: formData.addressLine2,
      postalCode: formData.postalCode,
      fulfilmentMethod: formData.fulfilmentMethod
    });

    if (res.error) {
      setError(res.error);
      setLoading(false);
    } else if (res.success && res.orderCode) {
      setOrderCode(res.orderCode);
      setSavedDeposit(res.depositCents ?? null);
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ background: "white", padding: "3rem 2rem", borderRadius: "var(--radius-lg)", border: '2px solid var(--color-success)', textAlign: "center", boxShadow: "var(--shadow-md)" }}>
        <h2 style={{color:'var(--color-success)',marginBottom:'1rem'}}>Order saved</h2>
        <p style={{ marginBottom: "2rem", fontSize: "var(--text-lg)" }}>
          Please complete your deposit of <strong style={{ color: "var(--color-primary)" }}>${((savedDeposit ?? Math.round(depositAmount*100)*formData.quantity)/100).toFixed(2)}</strong> via PayNow to officially lock in your spot.
        </p>
        
        {/* Order Code Display */}
        <div style={{ background: "var(--color-primary)", color: "white", padding: "1.5rem", borderRadius: "var(--radius-md)", marginBottom: "2rem", display: "inline-block" }}>
          <p style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem", opacity: 0.9 }}>Your Order Code</p>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, letterSpacing: "0.1em" }}>{orderCode}</div>
        </div>

        <div style={{ color: "var(--color-error)", background: "var(--color-surface)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "2rem", border: "1px solid var(--color-error)", fontSize: "0.875rem", fontWeight: 600, textAlign: "left" }}>
          ⚠️ Please screenshot or save this Order Code. You will need it to track your delivery status or contact support.
        </div>
        
        {payment.configured ? <div style={{marginBottom:24}}>
          {payment.qr && <Image unoptimized src={payment.qr} alt="PayNow payment QR" width={240} height={240}/>}
          <p>PayNow UEN: <strong>{payment.uen}</strong></p><p>Payee: <strong>{payment.payee}</strong></p>
          <p>Use <strong>{orderCode}</strong> as the transaction reference.</p>
        </div> : <p>Payment instructions are not available yet. Save your order code; SamaSama will provide payment instructions before you transfer.</p>}

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

        <fieldset style={{border:'1px solid var(--color-border)',padding:'1rem'}}>
          <legend>Address and fulfilment</legend>
          <p>We save this address now so you don’t need to enter it again when paying your balance. Singapore addresses only. Delivery availability and any charges will be confirmed before balance payment.</p>
          <label style={{display:'block',marginBottom:12}}>Street / block and building *<input autoComplete="address-line1" required maxLength={200} value={formData.addressLine1} onChange={e=>setFormData({...formData,addressLine1:e.target.value})} style={{display:'block',width:'100%',padding:12}}/></label>
          <label style={{display:'block',marginBottom:12}}>Unit number (if applicable)<input autoComplete="address-line2" maxLength={100} value={formData.addressLine2} onChange={e=>setFormData({...formData,addressLine2:e.target.value})} style={{display:'block',width:'100%',padding:12}}/></label>
          <label style={{display:'block',marginBottom:12}}>Singapore postal code *<input autoComplete="postal-code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={formData.postalCode} onChange={e=>setFormData({...formData,postalCode:e.target.value.replace(/\D/g,'')})} style={{display:'block',padding:12}}/></label>
          <label>Preferred fulfilment<select value={formData.fulfilmentMethod} onChange={e=>setFormData({...formData,fulfilmentMethod:e.target.value})} style={{display:'block',padding:12}}><option value="collection">Self-collection</option><option value="delivery">Delivery (subject to confirmation)</option></select></label>
          <p>Used for order fulfilment. <a href="/privacy">Privacy policy</a></p>
        </fieldset>

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
            <span style={{ color: "var(--color-accent)" }}>${((savedDeposit ?? Math.round(depositAmount*100)*formData.quantity)/100).toFixed(2)}</span>
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
