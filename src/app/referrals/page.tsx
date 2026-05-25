import PolicyPage from "@/components/PolicyPage";
import { policies } from "@/lib/policies";

export const metadata = {
  title: "Referral & Store Credit Terms | Sama Sama",
  description: policies.referrals.description,
};

export default function Page() {
  return <PolicyPage policy={policies.referrals} />;
}
