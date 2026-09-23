import type { Database } from "@/types/database";

export type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
export type CampaignProduct = Database["public"]["Tables"]["campaign_products"]["Row"];
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type CampaignLead = Database["public"]["Tables"]["campaign_leads"]["Row"];
export type FunnelEvent = Database["public"]["Tables"]["funnel_events"]["Row"];
export type PurchaseIntent = CampaignLead["purchase_intent"];
export type FunnelStatus = CampaignLead["funnel_status"];

export type AttributionInput = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer?: string | null;
  landing_variant?: string | null;
  anonymous_session_id?: string | null;
  first_touch_source?: string | null;
  latest_touch_source?: string | null;
};

export type PublicCampaign = Campaign & {
  products: CampaignProduct[];
};

export const purchaseIntentLabels: Record<PurchaseIntent, string> = {
  yes: "Yes, I’m interested",
  maybe: "Maybe (legacy response)",
  no: "No, I’m just voting",
};

export const funnelStatusLabels: Record<FunnelStatus, string> = {
  intent_registered: "Intent registered",
  reservation_invited: "Reservation invited",
  reserved: "Reserved",
  group_buy_invited: "Group-buy invited",
  deposit_paid: "Deposit paid",
  order_confirmed: "Order confirmed",
  reservation_expired: "Reservation expired",
  refunded: "Refunded",
  not_interested: "Not interested",
  unsubscribed: "Unsubscribed",
};
