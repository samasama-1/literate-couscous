import Link from "next/link";
import { retryConfirmation } from "@/app/actions/campaign-admin";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminAccess } from "@/lib/adminAuth";
import { formatMoney } from "@/lib/campaigns/utils";
import { funnelStatusLabels, purchaseIntentLabels, type Campaign, type CampaignLead, type CampaignProduct, type Contact, type FunnelEvent } from "@/lib/campaigns/types";

export const revalidate = 0;

type PageProps = {
  params: Promise<{ id: string }>;
};

type LeadDetail = CampaignLead & {
  contacts: Contact | null;
  campaigns: Campaign | null;
  campaign_products: CampaignProduct | null;
};

export default async function LeadDetailPage({ params }: PageProps) {
  await verifyAdminAccess();
  const { id } = await params;

  const [{ data: lead }, { data: events }, { data: emails }] = await Promise.all([
    supabaseAdmin
      .from("campaign_leads")
      .select(`
        *,
        contacts (*),
        campaigns (*),
        campaign_products (*)
      `)
      .eq("id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("funnel_events")
      .select("*")
      .eq("campaign_lead_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("email_deliveries")
      .select("*")
      .eq("campaign_lead_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!lead) notFound();

  const detail = lead as unknown as LeadDetail;
  const timeline = (events || []) as FunnelEvent[];

  return (
    <div className="container-site" style={{ padding: "3rem 2rem", maxWidth: "1000px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
        <div>
          <Link href="/admin/campaigns" style={{ color: "var(--color-primary)", fontWeight: 700 }}>Back to leads</Link>
          <h1 style={{ marginTop: "0.75rem", letterSpacing: 0 }}>{detail.contacts?.email || "Lead detail"}</h1>
        </div>
        <span className="badge badge-neutral">{funnelStatusLabels[detail.funnel_status]}</span>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "1.25rem" }}>
          <h2 style={{ fontSize: "1.25rem", letterSpacing: 0, marginBottom: "1rem" }}>Contact</h2>
          <Detail label="Email" value={detail.contacts?.email} />
          <Detail label="Phone" value={detail.contacts?.phone} />
          <Detail label="Telegram" value={detail.contacts?.telegram_handle ? `@${detail.contacts.telegram_handle}` : null} />
          <Detail label="Marketing consent" value={detail.contacts?.marketing_consent ? "Yes" : "No"} />
          <Detail label="Unsubscribed" value={detail.contacts?.unsubscribed_at ? new Date(detail.contacts.unsubscribed_at).toLocaleString("en-SG") : "No"} />
        </div>

        <div style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "1.25rem" }}>
          <h2 style={{ fontSize: "1.25rem", letterSpacing: 0, marginBottom: "1rem" }}>Campaign response</h2>
          <Detail label="Campaign" value={detail.campaigns?.name} />
          <Detail label="Selected product" value={detail.campaign_products?.public_name} />
          <Detail label="Price shown" value={formatMoney(detail.price_shown_cents, detail.currency)} />
          <Detail label="Intent" value={purchaseIntentLabels[detail.purchase_intent]} />
          <Detail label="Registered" value={new Date(detail.created_at).toLocaleString("en-SG")} />
        </div>

        <div style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "1.25rem" }}>
          <h2 style={{ fontSize: "1.25rem", letterSpacing: 0, marginBottom: "1rem" }}>Attribution</h2>
          <Detail label="UTM source" value={detail.utm_source} />
          <Detail label="UTM medium" value={detail.utm_medium} />
          <Detail label="UTM campaign" value={detail.utm_campaign} />
          <Detail label="UTM content" value={detail.utm_content} />
          <Detail label="Referrer" value={detail.referrer} />
          <Detail label="Anonymous session" value={detail.anonymous_session_id} />
        </div>
      </section>

      <section style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "1.25rem", marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem", letterSpacing: 0, marginBottom: "1rem" }}>Event timeline</h2>
        {timeline.length === 0 ? <p>No events recorded.</p> : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {timeline.map((event) => (
              <div key={event.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "1rem", borderBottom: "1px solid var(--color-border)", paddingBottom: "1rem" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>{new Date(event.created_at).toLocaleString("en-SG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <div>
                  <strong>{event.event_type.replace(/_/g, " ")}</strong>
                  <pre style={{ margin: "0.4rem 0 0", whiteSpace: "pre-wrap", background: "var(--color-surface)", padding: "0.75rem", borderRadius: "var(--radius-md)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{JSON.stringify(event.metadata, null, 2)}</pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1.25rem", letterSpacing: 0, marginBottom: "1rem" }}>Email deliveries</h2>
        <p>Queued messages wait for email configuration. Retry once it is configured. Attempts over 23 hours old require checking the provider delivery log first; automatic retry is blocked to prevent duplicates.</p>
        {!emails || emails.length === 0 ? <p>No email delivery records yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.75rem" }}>Template</th>
                  <th style={{ padding: "0.75rem" }}>Status</th>
                  <th style={{ padding: "0.75rem" }}>Provider ID</th>
                  <th style={{ padding: "0.75rem" }}>Error / retry</th>
                  <th style={{ padding: "0.75rem" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr key={email.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.75rem" }}>{email.template_key}</td>
                    <td style={{ padding: "0.75rem" }}>{email.status}</td>
                    <td style={{ padding: "0.75rem" }}>{email.provider_message_id || "—"}</td>
                    <td style={{ padding: "0.75rem" }}>{email.error_message || "—"}{email.status !== "sent" && <form action={retryConfirmation}><input type="hidden" name="delivery_id" value={email.id} /><button className="btn btn-secondary btn-sm">Retry confirmation</button></form>}</td>
                    <td style={{ padding: "0.75rem" }}>{new Date(email.created_at).toLocaleString("en-SG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: "grid", gap: "0.15rem", marginBottom: "0.85rem" }}>
      <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", fontWeight: 800 }}>{label}</span>
      <strong style={{ color: "var(--color-text)", overflowWrap: "anywhere" }}>{value || "—"}</strong>
    </div>
  );
}
