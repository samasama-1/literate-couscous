import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

const SITE_URL = "https://www.samasama.sg";

const publicRoutes = [
  "/",
  "/how-it-works",
  "/faq",
  "/appointments",
  "/lookup",
  "/terms",
  "/privacy",
  "/refunds-and-replacements",
  "/collection-delivery",
  "/referrals",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages = publicRoutes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === "/" ? "daily" as const : "monthly" as const,
    priority: route === "/" ? 1 : 0.7,
  }));

  const { data: activeBatches } = await supabase
    .from("batch_progress_view")
    .select("batch_id, created_at")
    .eq("status", "OPEN");

  const groupBuyPages = (activeBatches || []).map((batch) => ({
    url: `${SITE_URL}/group-buys/${batch.batch_id}`,
    lastModified: batch.created_at ? new Date(batch.created_at) : now,
    changeFrequency: "daily" as const,
    priority: 0.85,
  }));

  return [...staticPages, ...groupBuyPages];
}
