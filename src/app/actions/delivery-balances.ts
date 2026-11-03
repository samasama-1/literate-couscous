'use server';
import 'server-only';
import {randomBytes,createHash} from 'node:crypto';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
import {parseBalanceSelection} from '@/lib/orders/manual-balance';
import {sealLink} from '@/lib/order-integrations/links';
import {mailSendingConfig} from '@/lib/mail/config';
import {revalidatePath} from 'next/cache';
export type DeliveryBalanceResult={error?:string;success?:string};
export async function sendDeliveryBalances(_previous:DeliveryBalanceResult,form:FormData):Promise<DeliveryBalanceResult>{
 try{
 const admin=await verifyAdminAccess();
 if(process.env.MANUAL_BALANCE_INSTALLED!=='true'||process.env.ORDER_INTEGRATIONS_INSTALLED!=='true'||process.env.ORDER_EMAIL_ENABLED!=='true')return{error:'Manual balance email sending is not enabled. No emails were queued.'};
 if(form.get('confirmed')!=='on')return{error:'Review the recipients, totals and agreed delivery charges before confirming.'};
 const request=String(form.get('request_id')||'');if(!/^[a-f0-9-]{36}$/i.test(request))return{error:'Refresh the preview and try again.'};
 let selection;try{selection=parseBalanceSelection(form.get('selection'));}catch{return{error:'Select between 1 and 25 distinct delivery orders and preview them first.'};}
 mailSendingConfig();
 const entries=selection.map(row=>{const token=randomBytes(32).toString('hex');return{...row,hash:createHash('sha256').update(token).digest('hex'),envelope:sealLink(token,row.id,process.env.ORDER_EMAIL_LINK_KEY||'')};});
 const{data,error}=await orderDb().rpc('queue_delivery_balances',{p_request:request,p_actor:admin.email,p_entries:entries,p_confirmed:true});
 if(error){const codes:Record<string,string>={STALE_PREVIEW:'An order changed or is no longer eligible. Nothing in this batch was queued. Refresh and review again.',ALREADY_REQUESTED:'A selected order already has a current balance request. Nothing in this batch was queued.',REVIEW_EXISTING_SEND:'A previous delivery send is processing or requires review. Reconcile it before creating another request.',REQUEST_MISMATCH:'This preview was already used with another selection. Refresh before trying again.'};return{error:Object.entries(codes).find(([code])=>error.message.includes(code))?.[1]||'Unable to confirm the batch. Check email jobs before retrying; reuse this preview if the outcome is uncertain.'};}
 if(!data||!['queued','already_queued'].includes(data.status)||data.count!==selection.length)return{error:'Batch outcome needs review. Check the order email jobs before retrying.'};
 revalidatePath('/admin/delivery-payments');revalidatePath('/admin');for(const row of selection)revalidatePath(`/admin/orders/${row.id}`);
 return{success:data.status==='already_queued'?`These ${data.count} requests were already queued; no duplicates were created.`:`${data.count} delivery balance email${data.count===1?'':'s'} queued. The existing email worker will process them; queued does not mean sent.`};
 }catch{return{error:'Unable to confirm the request. Check admin access, sender settings and existing email jobs before retrying. This action does not contact the email provider directly.'};}
}
