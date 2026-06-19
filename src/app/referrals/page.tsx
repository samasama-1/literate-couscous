import PolicyPage from "@/components/PolicyPage";
import { policies } from "@/lib/policies";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Referral & Store Credit Terms",
  description: policies.referrals.description,
  alternates: {
    canonical: "/referrals",
  },
  openGraph: {
    title: "SamaSama Referral & Store Credit Terms",
    description: policies.referrals.description,
    url: "/referrals",
  },
};

export default function Page() {
  return <PolicyPage policy={policies.referrals} />;
}
