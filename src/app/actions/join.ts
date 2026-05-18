'use server';

import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';
import { syncContactToZoho, syncOrderToZoho } from './zoho';

export async function joinGroupBuy(formData: {
  batchId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  quantity: number;
}) {
  // 1. Validate and normalize inputs
  const name = formData.customerName.trim();
  const phone = formData.customerPhone.trim().toLowerCase();
  const email = formData.customerEmail?.trim().toLowerCase() || null;
  const quantity = Number(formData.quantity);
  const batchId = formData.batchId;

  if (!name || !phone || !email || !batchId || isNaN(quantity) || quantity < 1) {
    return { error: 'Invalid order details provided. All fields are required.' };
  }

  // Validate phone: strip non-digits and check minimum length
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 8) {
    return { error: 'Phone number must be at least 8 digits.' };
  }

  // 2. Check for existing order for this batch and phone using secure admin client
  const { data: existingOrders, error: existingError } = await supabaseAdmin
    .from('orders')
    .select('order_code, payment_status')
    .eq('batch_id', batchId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false });

  if (existingError) {
    console.error('Failed to check existing orders:', existingError);
    return { error: 'An unexpected error occurred. Please try again.' };
  }

  if (existingOrders && existingOrders.length > 0) {
    const existing = existingOrders[0];
    
    if (existing.payment_status === 'VERIFIED') {
      return { 
        error: 'You already have a verified order for this batch. If you need to change your order quantity, please contact support.',
        code: 'ALREADY_VERIFIED'
      };
    }
    
    if (existing.payment_status === 'PENDING_PAYNOW') {
      // Return the existing order code so they can resume payment
      return { 
        success: true, 
        orderCode: existing.order_code,
        message: 'Resuming existing pending order.'
      };
    }
  }

  // 3. Generate a friendly unique Order Code (e.g. SAMA-8A3B2F)
  const orderCode = `SAMA-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  // 4. Insert new order
  // NOTE: The database partial unique index will also safeguard this step against race conditions.
  const { error: insertError } = await supabaseAdmin
    .from('orders')
    .insert({
      order_code: orderCode,
      batch_id: batchId,
      customer_name: name,
      customer_phone: phone,
      customer_email: email,
      quantity: quantity,
      payment_status: 'PENDING_PAYNOW'
    });

  if (insertError) {
    console.error('Failed to insert order:', insertError);
    // If it's a unique constraint violation from our new index, handle it gracefully
    if (insertError.code === '23505') {
      return { error: 'An order with this phone number is already pending processing. Please check your order status.' };
    }
    return { error: 'Failed to create your order. Please try again.' };
  }

  // TODO: Implement cron job or Edge Function to expire PENDING_PAYNOW orders older than 24 hours.

  // 5. Sync to Zoho CRM (non-blocking — won't delay the customer response)
  // Fetch product name for the Deal
  const { data: batch } = await supabaseAdmin
    .from('batches')
    .select('product_id, deposit_amount')
    .eq('id', batchId)
    .single();
  const { data: product } = batch?.product_id
    ? await supabaseAdmin.from('products').select('name').eq('id', batch.product_id).single()
    : { data: null };

  // Fire and forget — errors are logged but don't break the order flow
  syncContactToZoho({ name, phone, email }).then(contactId => {
    syncOrderToZoho({
      orderCode,
      productName: product?.name || 'Unknown Product',
      quantity,
      depositAmount: batch?.deposit_amount || 0,
      customerEmail: email,
      contactId,
    });
  }).catch(err => console.error('[Zoho] Background sync failed:', err));

  return { 
    success: true, 
    orderCode: orderCode 
  };
}
