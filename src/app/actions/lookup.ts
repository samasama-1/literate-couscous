'use server';

import 'server-only';
import { limitRequest } from "@/lib/campaigns/security";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface SafeOrderPayload {
  payment_status: string;
  quantity: number;
  product_name: string;
  batch_status: string;
  confirmed_quantity: number;
  target_capacity: number;
  remaining_capacity: number;
  closes_at: string;
  support_cta: string;
}

export async function lookupOrder(orderId: string, authValue: string) {
  if(typeof orderId!=='string'||typeof authValue!=='string'||!orderId.trim()||!authValue.trim()||orderId.length>32||authValue.length>254) return {error:'Order not found or authentication mismatch.'};
  try { await limitRequest('order-lookup',10); } catch { return {error:'Order lookup is temporarily unavailable. Please wait and try again.'}; }

  // Normalize inputs
  const cleanOrderId = orderId.trim().toUpperCase();
  const cleanAuthValue = authValue.trim().toLowerCase();

  // Generic anti-enumeration error
  const GENERIC_ERROR = 'Order not found or authentication mismatch.';

  // 1. Fetch the order securely bypassing RLS
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('payment_status,quantity,batch_id,customer_phone,customer_email')
    .eq('order_code', cleanOrderId)
    .single();

  if (orderError || !order) {
    return { error: GENERIC_ERROR };
  }

  // 2. Compare normalized auth value against both phone and email
  const dbPhone = (order.customer_phone || '').trim().toLowerCase();
  const dbEmail = (order.customer_email || '').trim().toLowerCase();

  if (dbPhone !== cleanAuthValue && dbEmail !== cleanAuthValue) {
    // Authentication failed. We do not reveal that the Order ID was valid.
    return { error: GENERIC_ERROR };
  }

  // 3. Fetch batch progress safely
  const { data: batch, error: batchError } = await supabaseAdmin
    .from('batch_progress_view')
    .select('*')
    .eq('batch_id', order.batch_id)
    .single();

  if (batchError || !batch) {
    return { error: 'Order found, but batch details are currently unavailable.' };
  }

  // 4. Fetch product name securely
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('name')
    .eq('id', batch.product_id)
    .single();

  // 5. Construct Safe Payload mapping explicitly discarding all other fields
  const safePayload: SafeOrderPayload = {
    payment_status: order.payment_status,
    quantity: order.quantity,
    product_name: product?.name || 'Unknown Product',
    batch_status: batch.status,
    confirmed_quantity: batch.confirmed_quantity,
    target_capacity: batch.target_capacity,
    remaining_capacity: batch.remaining_capacity,
    closes_at: batch.closes_at,
    support_cta: 'Need help? Email us at support@samasama.com or reply to your confirmation message.'
  };

  return { data: safePayload };
}
