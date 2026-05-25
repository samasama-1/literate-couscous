import PolicyPage from "@/components/PolicyPage";
import { policies } from "@/lib/policies";

export const metadata = {
  title: "Collection & Delivery Policy | Sama Sama",
  description: policies.collection.description,
};

export default function Page() {
  return <PolicyPage policy={policies.collection} />;
}
