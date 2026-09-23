import type { Metadata } from "next";
import UnsubscribeForm from "./UnsubscribeForm";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Unsubscribe from SamaSama marketing updates.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const emailParam = params.token;
  const initialEmail = Array.isArray(emailParam) ? emailParam[0] || "" : emailParam || "";

  return (
    <div className="container-site" style={{ padding: "4rem 2rem", maxWidth: "620px" }}>
      <section style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "2rem", boxShadow: "var(--shadow-sm)" }}>
        <p className="section-label">Marketing preferences</p>
        <h1 style={{ margin: "0.5rem 0 1rem", letterSpacing: 0 }}>Unsubscribe</h1>
        <p style={{ marginBottom: "1.5rem" }}>
          You will still receive transactional messages for actions you requested, such as registration confirmations or order updates.
        </p>
        {!initialEmail && <p>Please open the unsubscribe link in your latest SamaSama email.</p>}
        <UnsubscribeForm token={initialEmail} />
      </section>
    </div>
  );
}
