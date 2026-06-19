import PolicyPage from "@/components/PolicyPage";
import { policies } from "@/lib/policies";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collection & Delivery Policy",
  description: policies.collection.description,
  alternates: {
    canonical: "/collection-delivery",
  },
  openGraph: {
    title: "SamaSama Collection & Delivery Policy",
    description: policies.collection.description,
    url: "/collection-delivery",
  },
};

export default function Page() {
  return <PolicyPage policy={policies.collection} />;
}
