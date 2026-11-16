import {batchPageTime} from '@/lib/batches/server';
import {pricingConfigured} from '@/lib/batches/pricing';
import {paymentConfig} from '@/lib/orders/payment-config';
import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import JoinGroupBuyForm from "@/components/JoinGroupBuyForm";

export const revalidate = 0;

export default async function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Verify batch exists and is OPEN
  const { data: batch } = await supabase
    .from('batch_progress_view')
    .select('*')
    .eq('batch_id', id)
    .single();

  if (!batch || batch.status !== 'OPEN' || Date.parse(batch.closes_at)<=batchPageTime().now) {
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
          Submit your order for <strong style={{ color: "var(--color-primary)" }}>{product?.name}</strong>. Availability is confirmed when our team verifies your deposit.
        </p>
      </div>

      {!pricingConfigured(batch)?<p role="status">This batch is being prepared and is not accepting orders yet. Please contact <a href="mailto:hello@samasama.sg">hello@samasama.sg</a> before making payment.</p>:batch.remaining_capacity<=0?<p role="status">This batch has reached its verified order limit. Please contact <a href="mailto:hello@samasama.sg">hello@samasama.sg</a> before making any payment.</p>:<JoinGroupBuyForm discountEnabled={process.env.CAMPAIGN_DISCOUNTS_INSTALLED==='true'} collectionPolicyEnabled={process.env.FULFILMENT_V2_ENABLED==='true'} batchId={batch.batch_id} depositAmount={batch.deposit_amount} payment={paymentConfig()} />}
    </div>
  );
}
