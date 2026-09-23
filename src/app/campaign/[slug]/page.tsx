import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Campaign, CampaignProduct } from "@/lib/campaigns/types";
import CampaignLanding from "@/components/campaigns/CampaignLanding";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("name, description, slug, is_test")
    .eq("slug", slug)
    .not("status", "in", "(draft,archived)")
    .maybeSingle();

  if (!campaign) return { title: "Campaign" };

  return {
    title: campaign.name,
    robots: campaign.is_test ? { index: false, follow: false } : undefined,
    description: campaign.description || "Help SamaSama decide what to bring in next.",
    alternates: { canonical: `/campaign/${campaign.slug}` },
    openGraph: {
      title: campaign.name,
      description: campaign.description || "Help SamaSama decide what to bring in next.",
      url: `/campaign/${campaign.slug}`,
    },
  };
}

async function getCampaign(slug: string) {
  const { data: campaign, error } = await supabaseAdmin
    .from("campaigns")
    .select("id,name,slug,description,headline,subheadline,cta_text,confirmation_text,status,starts_at,ends_at,reservation_enabled,is_test,created_at,updated_at")
    .eq("slug", slug)
    .not("status", "in", "(draft,archived)")
    .maybeSingle();

  if (error) throw error;
  if (!campaign) return null;

  const { data: products, error: productsError } = await supabaseAdmin
    .from("campaign_products")
    .select("id,campaign_id,public_name,public_label,short_description,key_benefit,key_differentiator,specifications,tradeoff,estimated_price_cents,currency,display_order,image_url,active,created_at,updated_at")
    .eq("campaign_id", campaign.id)
    .eq("active", true)
    .order("display_order", { ascending: true });

  if (productsError) throw productsError;

  return {
    campaign: campaign as Campaign,
    products: (products || []) as CampaignProduct[],
  };
}

export default async function CampaignPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getCampaign(slug);

  if (!data) notFound();

  const { campaign, products } = data;

  return <CampaignLanding campaign={campaign} products={products} />;
}
