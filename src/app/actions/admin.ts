'use server';
import {verifyAdminAccess} from '@/lib/adminAuth';
// Batch creation now uses the validated, atomic saveBatch action in batches.ts.
export async function verifyOrder(orderId: string) {
  await verifyAdminAccess();
  if (!orderId) return {error: 'Order is required.'};
  return {error: 'Use the order detail page to verify the amount and bank reference.'};
}
