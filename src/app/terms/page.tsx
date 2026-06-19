import PolicyPage from "@/components/PolicyPage";
import { policies } from "@/lib/policies";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: policies.terms.description,
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "SamaSama Terms & Conditions",
    description: policies.terms.description,
    url: "/terms",
  },
};

export default function Page() {
  return <PolicyPage policy={policies.terms} />;
}
