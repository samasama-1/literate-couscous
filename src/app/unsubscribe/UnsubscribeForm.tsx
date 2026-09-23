'use client';

import { useState } from "react";
import { unsubscribeContact } from "@/app/actions/unsubscribe";

export default function UnsubscribeForm({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    setMessage("");
    const result = await unsubscribeContact(formData).catch(() => ({ error: "Network error. Please try again." }));
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setMessage("You have been unsubscribed from SamaSama marketing updates.");
  }

  return (
    <form action={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
      <input type="hidden" name="token" value={token} />
      {error && <div style={{ background: "var(--color-error-bg)", color: "var(--color-error)", border: "1px solid var(--color-error)", borderRadius: "var(--radius-md)", padding: "1rem" }}>{error}</div>}
      {message && <div style={{ background: "var(--color-success-bg)", color: "var(--color-success)", border: "1px solid var(--color-success)", borderRadius: "var(--radius-md)", padding: "1rem" }}>{message}</div>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={loading || !token}>
        {loading ? "Updating..." : "Unsubscribe"}
      </button>
    </form>
  );
}
