import PolicyPage from "@/components/PolicyPage";
import { policies } from "@/lib/policies";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy and PDPA Notice",
  description: policies.privacy.description,
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "SamaSama Privacy Policy and PDPA Notice",
    description: policies.privacy.description,
    url: "/privacy",
  },
};

export default function Page() {
  return <PolicyPage policy={policies.privacy} />;
}
