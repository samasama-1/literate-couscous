import PolicyPage from "@/components/PolicyPage";
import { policies } from "@/lib/policies";

export const metadata = {
  title: "Privacy Policy / PDPA Notice | Sama Sama",
  description: policies.privacy.description,
};

export default function Page() {
  return <PolicyPage policy={policies.privacy} />;
}
