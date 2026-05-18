import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import JoinGroupBuyForm from "@/components/JoinGroupBuyForm";

export const revalidate = 0;

export default async function JoinPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  
  // Verify batch exists and is OPEN
  const { data: batch } = await supabase
    .from('batch_progress_view')
    .select('batch_id, deposit_amount, status, product_id')
    .eq('batch_id', id)
    .single();

  if (!batch || batch.status !== 'OPEN') {
    notFound();
  }

  // Fetch product name for context
  const { data: product } = await supabase
    .from('products')
    .select('name')
    .eq('id', batch.product_id)
    .single();

  return (
    <div className="container-site" style={{ padding: "4rem 2rem", maxWidth: "700px", margin: "0 auto" }}>
      <Link href={`/group-buys/${id}`} style={{ color: "var(--color-primary)", fontWeight: 600, display: "inline-block", marginBottom: "2rem" }}>
        ← Back to Details
      </Link>

      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <h1 style={{ marginBottom: "1rem" }}>Join the Group Buy</h1>
        <p style={{ fontSize: "var(--text-lg)" }}>
          You are reserving a unit for the <strong style={{ color: "var(--color-primary)" }}>{product?.name}</strong>.
        </p>
      </div>

      <JoinGroupBuyForm batchId={batch.batch_id} depositAmount={batch.deposit_amount} />
    </div>
  );
}
