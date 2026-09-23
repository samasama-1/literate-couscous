import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAccess } from "@/lib/adminAuth";
import { getLeads, normalizeFilters } from "@/lib/campaigns/admin-data";
import { formatMoney, toCsv } from "@/lib/campaigns/utils";
import { funnelStatusLabels, purchaseIntentLabels } from "@/lib/campaigns/types";

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let leads;
  try { leads = await getLeads(normalizeFilters(Object.fromEntries(request.nextUrl.searchParams))); }
  catch { return NextResponse.json({error:"Export failed. Please try again."},{status:500}); }
  const rows = leads
    .map((lead) => ({
      campaign: lead.campaigns?.name || "",
      test_campaign: lead.campaigns?.is_test ? "yes" : "no",
      email: lead.contacts?.email || "",
      phone: lead.contacts?.phone || "",
      telegram_handle: lead.contacts?.telegram_handle || "",
      selected_product: lead.campaign_products?.public_name || "",
      price_shown: formatMoney(lead.price_shown_cents, lead.currency),
      purchase_intent: purchaseIntentLabels[lead.purchase_intent],
      funnel_status: funnelStatusLabels[lead.funnel_status],
      marketing_consent: lead.contacts?.marketing_consent ? "yes" : "no",
      unsubscribed: lead.contacts?.unsubscribed_at ? "yes" : "no",
      utm_source: lead.utm_source || "",
      utm_medium: lead.utm_medium || "",
      utm_campaign: lead.utm_campaign || "",
      utm_content: lead.utm_content || "",
      utm_term: lead.utm_term || "",
      referrer: lead.referrer || "",
      created_at: lead.created_at,
    }));

  const csv = toCsv(rows);
  const filename = `samasama-campaign-leads-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
