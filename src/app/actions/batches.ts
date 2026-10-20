'use server';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {parseBatch, uuid} from '@/lib/batches/validation';
export type BatchResult = {error?: string; success?: string; id?: string; deleted?: boolean};
const messages: Record<string, string> = {
  BATCH_CHANGED: 'Another administrator changed this batch. Refresh before editing again.',
  BATCH_NOT_FOUND: 'This batch no longer exists.',
  BATCH_PRICES_LOCKED: 'This batch has orders. Deposit and tier prices are locked; create a new batch for new pricing.',
  BATCH_CAPACITY_TOO_LOW: 'Capacity cannot be lower than the units already ordered, excluding refunds.',
  BATCH_OUTSTANDING_ORDERS: 'Some orders are not fulfilled. Close the batch instead of marking it delivered.',
  BATCH_HAS_ORDERS: 'Batches with orders cannot be deleted. Close the batch to stop new orders.',
  INVALID_CLOSING_TIME: 'An open batch must have a future closing date and time.',
  INVALID_PRICES: 'Check the deposit and tier prices.',
  INVALID_IMAGE: 'Use a valid HTTPS image URL or local /image path.',
  DELETE_CONFIRMATION_REQUIRED: 'Type DELETE to confirm deletion.',
};
function failure(message: string) {
  return Object.entries(messages).find(([code]) => message.includes(code))?.[1]
    || 'Could not save. Confirm batch_management.sql has been applied, then refresh and try again.';
}
function refresh(id: string) {
  for (const path of ['/', '/admin', '/admin/batches', `/admin/batches/${id}`, `/group-buys/${id}`, `/group-buys/${id}/join`]) revalidatePath(path);
}
export async function saveBatch(_previous: BatchResult, form: FormData): Promise<BatchResult> {
  try { await verifyAdminAccess(); } catch { return {error: 'Sign in as an approved administrator.'}; }
  let input;
  try { input = parseBatch(form); } catch (error) { return {error: error instanceof Error ? error.message : 'Check the batch fields.'}; }
  try {
    const {data, error} = await supabaseAdmin.rpc('admin_save_batch', {p: input});
    if (error || typeof data !== 'string' || !uuid.test(data)) return {error: failure(error?.message || '')};
    refresh(data);
    return {success: input.id ? 'Batch updated.' : 'Batch created. Your public link is ready.', id: data};
  } catch { return {error: 'Batch could not be saved. Refresh before retrying.'}; }
}
export async function deleteEmptyBatch(_previous: BatchResult, form: FormData): Promise<BatchResult> {
  try { await verifyAdminAccess(); } catch { return {error: 'Sign in as an approved administrator.'}; }
  const id = String(form.get('id') || ''), revision = Number(form.get('revision'));
  if (!uuid.test(id) || !Number.isSafeInteger(revision) || revision < 1 || form.get('confirmation') !== 'DELETE') return {error: 'Type DELETE to confirm deletion of this empty batch.'};
  try {
    const {error} = await supabaseAdmin.rpc('admin_delete_empty_batch', {p_id: id, p_revision: revision, p_confirmation: 'DELETE'});
    if (error) return {error: failure(error.message)};
    refresh(id);
  } catch { return {error: 'Could not delete the batch. Refresh and try again.'}; }
  redirect('/admin/batches?deleted=1');
}
