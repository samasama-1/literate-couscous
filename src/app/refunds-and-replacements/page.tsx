import PolicyPage from "@/components/PolicyPage";
import { policies } from "@/lib/policies";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refunds & Replacements",
  description: policies.refunds.description,
  alternates: {
    canonical: "/refunds-and-replacements",
  },
  openGraph: {
    title: "SamaSama Refunds & Replacements",
    description: policies.refunds.description,
    url: "/refunds-and-replacements",
  },
};

export default function Page() {
  return <PolicyPage policy={policies.refunds} />;
}
