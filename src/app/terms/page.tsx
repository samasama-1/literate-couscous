import PolicyPage from "@/components/PolicyPage";
import { policies } from "@/lib/policies";

export const metadata = {
  title: "Terms & Conditions | Sama Sama",
  description: policies.terms.description,
};

export default function Page() {
  return <PolicyPage policy={policies.terms} />;
}
