'use server';

import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';
import {orderDb} from '@/lib/orders/db';
import { addressInput } from '@/lib/orders/validation';
import { limitRequest } from '@/lib/campaigns/security';

export async function joinGroupBuy(formData: {
  batchId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  quantity: number;
  addressLine1: string;
  addressLine2?: string;
  postalCode: string;
  fulfilmentMethod: string;
}) {
  if (!formData || typeof formData.customerName!=='string' || typeof formData.customerPhone!=='string' || typeof formData.customerEmail!=='string') return {error: 'Invalid order details.'};
  let address;
  try { address=addressInput(formData); await limitRequest('order-registration',15); } catch(e) { return {error:e instanceof Error ? e.message : 'Please try again later.'}; }
  // 1. Validate and normalize inputs
  const name = formData.customerName.trim();
  const phone = formData.customerPhone.trim().toLowerCase();
  const email = formData.customerEmail?.trim().toLowerCase() || null;
  const quantity = Number(formData.quantity);
  const batchId = formData.batchId;

  if (!name || !phone || !email || !batchId || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-f0-9-]{36}$/i.test(batchId) || name.length>150 || phone.length>30 || email.length>254) {
    return { error: 'Invalid order details provided. All fields are required.' };
  }

  // Validate phone: strip non-digits and check minimum length
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 8) {
    return { error: 'Phone number must be at least 8 digits.' };
  }

  const {data:batch,error:batchError}=await supabaseAdmin.from('batches').select('product_id,deposit_amount,status,closes_at').eq('id',batchId).single();
  if(batchError || !batch || batch.status!=='OPEN' || Date.parse(batch.closes_at)<=Date.now()) return {error:'This batch is no longer accepting orders.'};
  const depositCents=Math.round(Number(batch.deposit_amount)*100)*quantity;
  if(!Number.isSafeInteger(depositCents) || depositCents<0) return {error:'Batch pricing is unavailable.'};
  const orderCode = `SAMA-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const {data:registered,error:insertError}=await orderDb().rpc('register_batch_order',{p:{
    order_code:orderCode,batch_id:batchId,customer_name:name,customer_phone:phone,customer_email:email,quantity,...address
  }});
  if(insertError || !registered){
    if(insertError?.message.includes('ORDER_EXISTS') || insertError?.code==='23505') return {error:'An order already exists for these details. Use your saved order code or contact support.'};
    if(insertError?.message.includes('BATCH_CLOSED')) return {error:'This batch is no longer accepting orders.'};
    console.error('Order registration failed:',insertError?.code);
    return {error:'Failed to create your order. Please try again.'};
  }

  // TODO: Implement cron job or Edge Function to expire PENDING_PAYNOW orders older than 24 hours.

  // Keep unverified customer identity in the order record only.
  // CRM contact updates require the future email-ownership verification flow.

  return { 
    success: true, 
    orderCode: orderCode,
    depositCents: Number(registered.deposit_due_cents)
  };
}
