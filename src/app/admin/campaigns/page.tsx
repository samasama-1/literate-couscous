import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeFilters, getLeads, getVisitorCount, type LeadRow } from "@/lib/campaigns/admin-data";
import { verifyAdminAccess } from "@/lib/adminAuth";
import { formatMoney } from "@/lib/campaigns/utils";
import { funnelStatusLabels, purchaseIntentLabels, type Campaign, type CampaignProduct } from "@/lib/campaigns/types";

export const revalidate = 0;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function calculateOverview(leads: LeadRow[], campaignId: string) {
  const scoped = campaignId ? leads.filter((lead) => lead.campaign_id === campaignId) : leads;
  const intentCount = scoped.length;
  const yes = scoped.filter((lead) => lead.purchase_intent === "yes").length;
  const maybe = scoped.filter((lead) => lead.purchase_intent === "maybe").length;
  const no = scoped.filter((lead) => lead.purchase_intent === "no").length;
  return { intentCount, yes, maybe, no, yesRate: intentCount ? Math.round((yes / intentCount) * 100) : 0 };
}

export default async function AdminCampaignsPage({ searchParams }: PageProps) {
  await verifyAdminAccess();
  const params = await searchParams;
  const filters = normalizeFilters(params);

  const [campaignResult, productResult, allLeads] = await Promise.all([
    supabaseAdmin.from("campaigns").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("campaign_products").select("*").order("display_order", { ascending: true }),
    getLeads(filters),
  ]);

  if (campaignResult.error || productResult.error) throw new Error("Could not load campaigns. Check the database setup.");
  const campaignRows = (campaignResult.data || []) as Campaign[];
  const productRows = (productResult.data || []) as CampaignProduct[];
  const selectedCampaign = campaignRows.find((campaign) => campaign.id === filters.campaign);
  const overview = calculateOverview(allLeads, filters.campaign);
  const campaignIds = campaignRows.filter(c => (!filters.campaign || c.id === filters.campaign) && (filters.mode === "all" || c.is_test === (filters.mode === "test"))).map(c=>c.id);
  const uniqueVisitors = await getVisitorCount(filters,campaignIds);
  const pageCount = Math.max(1,Math.ceil(allLeads.length/50));
  const page = Math.min(pageCount,Math.max(1,Math.floor(Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1)));
  const leads = allLeads.slice((page-1)*50,page*50);
  const pageHref = (p:number) => `/admin/campaigns?${new URLSearchParams({...filters,page:String(p)})}`;
  const conversionRate = uniqueVisitors ? Math.round((overview.intentCount / uniqueVisitors) * 1000) / 10 : 0;
  const exportHref = `/admin/campaigns/export?${new URLSearchParams(filters).toString()}`;

  const productBreakdown = productRows
    .filter((product) => !filters.campaign || product.campaign_id === filters.campaign)
    .map((product) => {
      const scoped = allLeads.filter((lead) => lead.selected_campaign_product_id === product.id);
      return {
        product,
        count: scoped.length,
        yes: scoped.filter((lead) => lead.purchase_intent === "yes").length,
      };
    })
    .filter((row) => row.count > 0 || filters.campaign);

  const sourceBreakdown = Array.from(allLeads.reduce((map, lead) => {
    const source = lead.utm_source || "direct/unknown";
    map.set(source, (map.get(source) || 0) + 1);
    return map;
  }, new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="container-site" style={{ padding: "3rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap" }}>
        <div>
          <p className="section-label">Campaign CRM</p>
          <h1 style={{ letterSpacing: 0 }}>Lead dashboard</h1>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/admin/campaigns/manage" className="btn btn-primary btn-sm">Manage campaign pages</Link>
          <Link href="/admin" className="btn btn-secondary btn-sm">Orders admin</Link>
          <Link href={exportHref} className="btn btn-primary btn-sm">Export CSV</Link>
        </div>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          ["Unique visitors", uniqueVisitors],
          ["Interest registrations", overview.intentCount],
          ["Segment registrations / visits", `${conversionRate}%`],
          ["YES", overview.yes],
          ["MAYBE (legacy)", overview.maybe],
          ["NO", overview.no],
          ["YES rate", `${overview.yesRate}%`],
        ].map(([label, value]) => (
          <div key={label} style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "1rem" }}>
            <p style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", fontWeight: 800, color: "var(--color-text-muted)" }}>{label}</p>
            <strong style={{ display: "block", fontSize: "1.75rem", color: "var(--color-text)", marginTop: "0.35rem" }}>{value}</strong>
          </div>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "1.25rem" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem", letterSpacing: 0 }}>By product</h2>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {productBreakdown.length === 0 ? <p>No product data yet.</p> : productBreakdown.map(({ product, count, yes }) => (
              <div key={product.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.65rem" }}>
                <span>{product.public_name}</span>
                <strong>{count} registrations / {yes} YES</strong>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "1.25rem" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem", letterSpacing: 0 }}>By source</h2>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {sourceBreakdown.length === 0 ? <p>No source data yet.</p> : sourceBreakdown.map(([source, count]) => (
              <div key={source} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.65rem" }}>
                <span>{source}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <p style={{marginBottom:"1rem"}}>Visitors are unique browser sessions per campaign, not verified people. The ratio compares this registration segment with visits in the selected campaign, date and UTM scope. Repeat visits and returning registrants can affect it.</p>
      <form action="/admin/campaigns" style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "1.25rem", marginBottom: "2rem", display: "grid", gap: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
          <label>Data<select name="mode" defaultValue={filters.mode}><option value="live">Live campaigns</option><option value="test">Test campaigns</option><option value="all">All campaigns</option></select></label>
          <label>Campaign
            <select name="campaign" defaultValue={filters.campaign}>
              <option value="">All campaigns</option>
              {campaignRows.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
          <label>Product
            <select name="product" defaultValue={filters.product}>
              <option value="">All products</option>
              {productRows.filter((product) => !filters.campaign || product.campaign_id === filters.campaign).map((product) => <option key={product.id} value={product.id}>{product.public_name}</option>)}
            </select>
          </label>
          <label>Intent
            <select name="intent" defaultValue={filters.intent}>
              <option value="">Any interest response</option>
              <option value="yes">YES</option>
              <option value="maybe">MAYBE (legacy)</option>
              <option value="no">NO</option>
            </select>
          </label>
          <label>Status
            <select name="status" defaultValue={filters.status}>
              <option value="">Any status</option>
              {Object.entries(funnelStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>UTM source
            <input name="source" defaultValue={filters.source} placeholder="tiktok" />
          </label>
          <label>UTM campaign<input name="utm_campaign" defaultValue={filters.utm_campaign} /></label>
          <label>Creative (utm_content)<input name="creative" defaultValue={filters.creative} /></label>
          <label>Search
            <input name="search" defaultValue={filters.search} placeholder="email or phone" />
          </label>
          <label>From
            <input type="date" name="from" defaultValue={filters.from} />
          </label>
          <label>To
            <input type="date" name="to" defaultValue={filters.to} />
          </label>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" type="submit">Apply filters</button>
          <Link className="btn btn-secondary btn-sm" href="/admin/campaigns">Clear</Link>
        </div>
        <style>{`
          form label { display: grid; gap: 0.4rem; font-weight: 700; color: var(--color-text); font-size: var(--text-sm); }
          form input, form select { width: 100%; padding: 0.7rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: white; color: var(--color-text); }
        `}</style>
      </form>

      <section style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <h2 style={{ fontSize: "1.25rem", letterSpacing: 0 }}>Leads</h2>
          <span className="badge badge-neutral">{allLeads.length} matching · page {page} of {pageCount}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
                {["Email", "Selected product", "Price shown", "Intent", "Status", "Source", "UTM campaign", "Date registered"].map((header) => (
                  <th key={header} style={{ padding: "0.9rem", fontSize: "var(--text-xs)", textTransform: "uppercase" }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>No leads match this segment.</td></tr>
              ) : leads.map((lead) => (
                <tr key={lead.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.9rem", fontWeight: 700 }}>
                    <Link href={`/admin/campaigns/leads/${lead.id}`} style={{ color: "var(--color-primary)" }}>{lead.contacts?.email || "Unknown"}</Link>
                  </td>
                  <td style={{ padding: "0.9rem" }}>{lead.campaign_products?.public_name || "Unknown"}</td>
                  <td style={{ padding: "0.9rem" }}>{formatMoney(lead.price_shown_cents, lead.currency)}</td>
                  <td style={{ padding: "0.9rem" }}>{purchaseIntentLabels[lead.purchase_intent]}</td>
                  <td style={{ padding: "0.9rem" }}>{funnelStatusLabels[lead.funnel_status]}</td>
                  <td style={{ padding: "0.9rem" }}>{lead.utm_source || "direct/unknown"}</td>
                  <td style={{ padding: "0.9rem" }}>{lead.utm_campaign || "—"}</td>
                  <td style={{ padding: "0.9rem", whiteSpace: "nowrap" }}>{new Date(lead.created_at).toLocaleString("en-SG")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <nav aria-label="Lead pages" style={{display:"flex",gap:"1rem",marginTop:"1rem"}}>{page>1 && <Link href={pageHref(page-1)}>Previous</Link>}{page<pageCount && <Link href={pageHref(page+1)}>Next</Link>}</nav>
      {selectedCampaign && (
        <p style={{ marginTop: "1rem", fontSize: "var(--text-sm)" }}>
          Active segment: <strong>{selectedCampaign.name}</strong>. Model B + YES is available by choosing Product = Model B and Intent = YES, then exporting CSV.
        </p>
      )}
    </div>
  );
}
