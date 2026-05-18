'use server';

import 'server-only';
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
  // TODO: Implement rate limiting to prevent brute force order ID enumeration
  // TODO: Ensure order IDs are UUIDs or non-sequential secure tokens

  if (!orderId || !authValue) {
    return { error: 'Please provide both an Order Code and a Phone Number or Email.' };
  }

  // Normalize inputs
  const cleanOrderId = orderId.trim();
  const cleanAuthValue = authValue.trim().toLowerCase();

  // Generic anti-enumeration error
  const GENERIC_ERROR = 'Order not found or authentication mismatch.';

  // 1. Fetch the order securely bypassing RLS
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('*')
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
