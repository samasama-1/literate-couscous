'use server';
import 'server-only';
import {randomBytes,createHash} from 'node:crypto';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
import {moneyCents} from '@/lib/orders/validation';
import {revalidatePath} from 'next/cache';
import {after} from 'next/server';
import {updateDealStageInZoho} from './zoho';
export type OperationResult={error?:string;success?:string;link?:string};
export async function operateOrder(_previous:OperationResult,form:FormData):Promise<OperationResult>{
 try {
  const admin=await verifyAdminAccess();
  const id=String(form.get('id')||''),action=String(form.get('operation')||'');
  if(!/^[a-f0-9-]{36}$/i.test(id) || !['deposit','legacy_deposit','balance_request','balance_paid','ready','fulfil'].includes(action)) return {error:'Invalid order action.'};
  const amount=['deposit','legacy_deposit','balance_request','balance_paid'].includes(action)?moneyCents(form.get('amount')):null;
  const reference=String(form.get('reference')||'').trim();
  if(reference.length>200) return {error:'Reference or recipient name is too long.'};
  const token=action==='balance_request'?randomBytes(32).toString('hex'):null;
  const {error}=await orderDb().rpc('order_operation',{p_id:id,p_action:action,p_actor:admin.email,p_amount:amount,p_reference:reference||null,p_hash:token?createHash('sha256').update(token).digest('hex'):null});
  if(error){
   const messages:Record<string,string>={PAYMENT_REFERENCE_REUSED:'This bank reference has already been recorded for another payment. Reconcile it before proceeding.',PAYMENT_MISMATCH:'Amount must match the amount due, and a bank transaction reference is required.',LEGACY_DEPOSIT_REVIEW:'Record the historical deposit amount and reference first.',INVALID_TOTAL:'Final total must include all units and be at least the verified deposit.',NOT_FULLY_PAID:'Confirm the final total and verify the full balance before marking ready.',NOT_READY:'Order must be fully paid and ready. Enter the recipient or delivery reference.',INVALID_STATE:'This action is unavailable for the current order status.',ORDER_REFUNDED:'Refunded orders cannot proceed.'};
   return {error:Object.entries(messages).find(([key])=>error.message.includes(key))?.[1]||'Could not save. Check the migration and refresh the order.'};
  }
  if(action==='deposit') after(async()=>{
    try {const {data:order}=await orderDb().from('orders').select('order_code').eq('id',id).single();if(order?.order_code)await updateDealStageInZoho(order.order_code,'Deposit Verified');}
    catch {console.error('[Zoho] Deposit stage sync failed.');}
  });
  revalidatePath('/admin');revalidatePath(`/admin/orders/${id}`);revalidatePath('/');revalidatePath('/group-buys/[id]','page');
  if(token){const origin=process.env.NEXT_PUBLIC_SITE_URL || 'https://www.samasama.sg';return {success:'Balance request saved. Send this private link to the customer. It expires in 30 days. Generating a new link invalidates the previous one.',link:`${origin.replace(/\/$/,'')}/balance/${token}`};}
  return {success:'Order updated.'};
 }catch(e){return {error:e instanceof Error?e.message:'Unable to update order.'};}
}
