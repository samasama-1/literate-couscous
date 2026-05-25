import PolicyPage from "@/components/PolicyPage";
import { policies } from "@/lib/policies";

export const metadata = {
  title: "Refunds & Replacements | Sama Sama",
  description: policies.refunds.description,
};

export default function Page() {
  return <PolicyPage policy={policies.refunds} />;
}
