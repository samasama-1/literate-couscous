'use client';

import { useState } from 'react';
import { signIn } from '@/app/actions/auth';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError('');
    
    const res = await signIn(formData);
    
    if (res?.error) {
      setError(res.error);
      setLoading(false);
    }
  }

  return (
    <div className="container-site" style={{ padding: "4rem 2rem", maxWidth: "450px", margin: "0 auto" }}>
      <div style={{ background: "white", padding: "2.5rem", borderRadius: "var(--radius-lg)", border: "2px solid var(--color-border)", boxShadow: "var(--shadow-md)" }}>
        <h1 style={{ marginBottom: "1.5rem", textAlign: "center", fontSize: "1.75rem", color: "var(--color-primary)" }}>Admin Login</h1>
        
        {error && (
          <div style={{ color: "white", background: "var(--color-error)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
            {error}
          </div>
        )}
        
        <form action={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Email Address</label>
            <input 
              type="email" 
              name="email"
              required 
              style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} 
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>Password</label>
            <input 
              type="password" 
              name="password"
              required 
              style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary btn-lg" 
            style={{ width: "100%", marginTop: "1rem", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Authenticating...' : 'Secure Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
