'use server';

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { updateDealStageInZoho } from './zoho';

/**
 * Validates the current session against the allowed admin emails.
 * Throws an error if unauthorized.
 */
async function verifyAdminAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.email) {
    throw new Error("Unauthorized: No active session.");
  }

  const allowedEmailsStr = process.env.ADMIN_EMAILS || '';
  const allowedEmails = allowedEmailsStr.split(',').map(e => e.trim().toLowerCase());
  const userEmail = user.email.trim().toLowerCase();

  if (!allowedEmails.includes(userEmail)) {
    throw new Error("Unauthorized: Email not approved for admin access.");
  }

  return true;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unauthorized.";
}

export async function verifyOrder(orderId: string) {
  try {
    await verifyAdminAccess();
  } catch (err: unknown) {
    return { error: getErrorMessage(err) };
  }

  const { error } = await supabaseAdmin
    .from('orders')
    .update({ payment_status: 'VERIFIED' })
    .eq('id', orderId);

  if (error) {
    console.error('Failed to verify order:', error);
    return { error: 'Failed to verify order in database.' };
  }

  // Revalidate the homepage and admin routes so the progress bars jump instantly!
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/group-buys/[id]', 'page');

  // Update the Zoho CRM Deal stage (non-blocking)
  // Fetch the order code so we can find the Deal in Zoho
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('order_code')
    .eq('id', orderId)
    .single();

  if (order?.order_code) {
    updateDealStageInZoho(order.order_code, 'Deposit Verified')
      .catch(err => console.error('[Zoho] Deal stage update failed:', err));
  }
  
  return { success: true };
}

export async function createLobang(
  productData: { name: string; description: string; retail_price: number; image_url: string; features: string },
  batchData: { target_capacity: number; deposit_amount: number; tier_1_price: number; tier_2_price?: number; tier_3_price?: number; closes_at: string }
) {
  try {
    await verifyAdminAccess();
  } catch (err: unknown) {
    return { error: getErrorMessage(err) };
  }

  // 1. Parse features (assuming newline-separated list from a textarea)
  const featuresJson = productData.features 
    ? productData.features.split('\n').map(f => f.trim()).filter(f => f)
    : [];

  // 2. Insert Product
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .insert({
      name: productData.name,
      description: productData.description,
      retail_price: productData.retail_price || null,
      image_url: productData.image_url || null,
      features: featuresJson
    })
    .select('id')
    .single();

  if (productError || !product) {
    console.error('Failed to create product:', productError);
    return { error: 'Failed to create product in database.' };
  }

  // 3. Insert Batch
  const { error: batchError } = await supabaseAdmin
    .from('batches')
    .insert({
      product_id: product.id,
      status: 'OPEN',
      target_capacity: batchData.target_capacity,
      deposit_amount: batchData.deposit_amount,
      tier_1_price: batchData.tier_1_price,
      tier_2_price: batchData.tier_2_price || null,
      tier_3_price: batchData.tier_3_price || null,
      closes_at: batchData.closes_at
    });

  if (batchError) {
    console.error('Failed to create batch:', batchError);
    return { error: 'Failed to create batch in database.' };
  }

  // 4. Revalidate routes
  revalidatePath('/');
  revalidatePath('/admin');
  
  return { success: true };
}
