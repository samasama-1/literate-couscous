'use server';
import 'server-only';
import {observeOperation} from '@/lib/operations/telemetry';
import {randomBytes,createHash} from 'node:crypto';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
import {moneyCents} from '@/lib/orders/validation';
import {revalidatePath} from 'next/cache';
import {after} from 'next/server';
import {updateDealStageInZoho} from './zoho';
import {sealLink} from '@/lib/order-integrations/links';
export type OperationResult={error?:string;success?:string;link?:string};
export async function operateOrder(_previous:OperationResult,form:FormData):Promise<OperationResult>{
 return observeOperation('order_operation',async()=>{
 try {
  const admin=await verifyAdminAccess();
  const id=String(form.get('id')||''),action=String(form.get('operation')||'');
  if(!/^[a-f0-9-]{36}$/i.test(id) || !['deposit','legacy_deposit','balance_request','balance_paid','ready','fulfil','final_total','collection_ready','collection_payment'].includes(action)) return {error:'Invalid order action.'};
  const amount=['deposit','legacy_deposit','balance_request','balance_paid','final_total','collection_payment'].includes(action)?moneyCents(form.get('amount')):null;
  const reference=String(form.get('reference')||'').trim();
  if(reference.length>200) return {error:'Reference or recipient name is too long.'};
  if(['final_total','collection_ready','collection_payment'].includes(action)){
   if(process.env.MANUAL_BALANCE_INSTALLED!=='true')return {error:'Manual balance operations are not installed.'};
   const revision=Number(form.get('revision'));if(!/^\d+$/.test(String(form.get('revision')||''))||!Number.isSafeInteger(revision))return{error:'Refresh the order before recording payment.'};
   if(action==='collection_payment'&&form.get('funds_checked')!=='on')return{error:'Check the actual credited funds in the bank account before verifying payment.'};
   const{data,error}=await orderDb().rpc('admin_balance_operation',{p_id:id,p_action:action==='final_total'?'set_total':action,p_revision:revision,p_actor:admin.email,p_amount:amount,p_reference:reference||null,p_funds_checked:form.get('funds_checked')==='on'});
   if(error){const messages:Record<string,string>={STALE_PREVIEW:'This order changed. Refresh before recording any payment.',PAYMENT_REFERENCE_REUSED:'This bank reference is already in use. Reconcile the bank record.',PAYMENT_MISMATCH:'Enter the exact outstanding product balance and its bank transaction reference.',TOTAL_REQUIRED:'Confirm the final order total before marking it ready.',INVALID_TOTAL:'Review the final total. Paid or ready orders cannot be repriced here.',REVIEW_EXISTING_SEND:'A delivery email is processing or requires review. Reconcile it before repricing.',ORDER_UNAVAILABLE:'Review the order status and verified deposit first.'};return{error:Object.entries(messages).find(([code])=>error.message.includes(code))?.[1]||'Unable to update this order. Refresh and check its current state.'};}
   revalidatePath('/admin');revalidatePath('/admin/delivery-payments');revalidatePath(`/admin/orders/${id}`);
   return data==='already_paid'?{error:'The balance is already verified. Do not record another payment; refresh the order.'}:{success:action==='collection_payment'?'Product balance verified against the bank record. Complete the separate identity and handover check.':action==='collection_ready'?'Ready for collection. Any outstanding balance must still be verified before release.':'Final total saved. No balance email was sent.'};
  }
  if(process.env.MANUAL_BALANCE_INSTALLED==='true'&&action==='balance_request')return{error:'Confirm the final total, then use Delivery balance emails to preview and send.'};
  if(process.env.MANUAL_BALANCE_INSTALLED==='true'&&(action==='balance_paid'||(action==='fulfil'&&process.env.COLLECTION_AUTH_INSTALLED!=='true'&&process.env.FULFILMENT_V2_ENABLED!=='true'))){
   const {data:order,error:readError}=await orderDb().from('orders').select('fulfilment_method').eq('id',id).single();
   if(readError||!order)return{error:'Unable to verify this order. Refresh and try again.'};
   if(order.fulfilment_method!=='delivery')return{error:action==='fulfil'?'Enable the reviewed identity-checked collection setup before releasing goods.':'Use Verify balance received at collection, including the bank-credit check and current order revision.'};
  }
  const token=action==='balance_request'?randomBytes(32).toString('hex'):null;
  const queueEnabled=process.env.ORDER_INTEGRATIONS_INSTALLED==='true';
  const envelope=token&&queueEnabled?sealLink(token,id,process.env.ORDER_EMAIL_LINK_KEY||''):null;
  const collectionV2=(process.env.COLLECTION_AUTH_INSTALLED==='true'||process.env.FULFILMENT_V2_ENABLED==='true')&&action==='fulfil';
  const authorisation=String(form.get('authorisation')||'');
  if(authorisation&&!/^[a-f0-9-]{36}$/i.test(authorisation))return {error:'Refresh the order and choose the current authorised collector.'};
  const {data:handoverOutcome,error}=collectionV2?await orderDb().rpc('fulfil_order_named',{p_id:id,p_actor:admin.email,p_reference:reference||null,p_authorisation:authorisation||null,p_identity_checked:form.get('identity_checked')==='on'}):await orderDb().rpc(queueEnabled?'order_operation_with_email':'order_operation',{p_id:id,p_action:action,p_actor:admin.email,p_amount:amount,p_reference:reference||null,p_hash:token?createHash('sha256').update(token).digest('hex'):null,...(queueEnabled?{p_envelope:envelope}:{})});
  if(error){
   const messages:Record<string,string>={IDENTITY_CHECK_REQUIRED:'Check the original photo ID against the selected owner or authorised collector before collection.',USE_VERIFIED_HANDOVER:'Use the identity-checked collection action.',DELEGATION_PAUSED:'Third-party collection is currently paused. Contact an admin.',STORAGE_FEES_DUE:'Settle or approve a reduction of the outstanding storage fee before handover.',COLLECTOR_NOT_AUTHORISED:'The authorisation is unavailable, expired, revoked or changed. Refresh the order.',USE_AUTHORISED_COLLECTOR:'Use the owner’s name or the currently authorised collector.',PAYMENT_REFERENCE_REUSED:'This bank reference has already been recorded for another payment. Reconcile it before proceeding.',PAYMENT_MISMATCH:'Amount must match the amount due, and a bank transaction reference is required.',LEGACY_DEPOSIT_REVIEW:'Record the historical deposit amount and reference first.',INVALID_TOTAL:'Final total must include all units and be at least the verified deposit.',NOT_FULLY_PAID:'Confirm the final total and verify the full balance before marking ready.',NOT_READY:'Order must be fully paid and ready. Enter the recipient or delivery reference.',INVALID_STATE:'This action is unavailable for the current order status.',ORDER_REFUNDED:'Refunded orders cannot proceed.'};
   return {error:Object.entries(messages).find(([key])=>error.message.includes(key))?.[1]||'Could not save. Check the migration and refresh the order.'};
  }
  if(collectionV2&&handoverOutcome==='already_collected')return {error:'Handover was already recorded. Do not release the items again. Refresh to check the recorded handover.'};
  // Preserve the legacy integration until the dedicated Orders rollout is enabled.
  if(!queueEnabled && action==='deposit') after(async()=>{
   try{const {data:o}=await orderDb().from('orders').select('order_code').eq('id',id).single();if(o?.order_code)await updateDealStageInZoho(o.order_code,'Deposit Verified');}catch{console.error('[Zoho] Deposit stage sync failed.');}
  });
  revalidatePath('/admin');revalidatePath(`/admin/orders/${id}`);revalidatePath('/');revalidatePath('/group-buys/[id]','page');
  if(token){const origin=process.env.NEXT_PUBLIC_SITE_URL || 'https://www.samasama.sg';return {success:'Balance request saved. Send this private link to the customer. It expires in 30 days. Generating a new link invalidates the previous one.',link:`${origin.replace(/\/$/,'')}/balance/${token}`};}
  return {success:'Order updated.'};
 }catch(e){return {error:e instanceof Error?e.message:'Unable to update order.'};}
 });
}
