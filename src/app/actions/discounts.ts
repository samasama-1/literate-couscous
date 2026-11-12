'use server';
import 'server-only';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
import {moneyCents} from '@/lib/orders/validation';
import {revalidatePath} from 'next/cache';
export type DiscountResult={error?:string;success?:string};
function refresh(id?:string){revalidatePath('/admin/discounts');revalidatePath('/admin');revalidatePath('/admin/delivery-payments');if(id)revalidatePath(`/admin/orders/${id}`);}
export async function manageDiscount(_prior:DiscountResult,form:FormData):Promise<DiscountResult>{
 try{
 const admin=await verifyAdminAccess();if(process.env.CAMPAIGN_DISCOUNTS_INSTALLED!=='true')return{error:'Campaign discounts are not installed.'};
 if(form.get('confirmed')!=='on')return{error:'Review and confirm the action first.'};
 const action=String(form.get('action')||'');
 if(action==='issuance'){
 const enabled=form.get('enabled');if(enabled!=='true'&&enabled!=='false')return{error:'Choose whether new code issuance is enabled.'};
 const{error}=await orderDb().rpc('configure_campaign_discount',{p_enabled:enabled==='true',p_actor:admin.email});if(error)return{error:'Unable to change issuance. Check the discount setup.'};refresh();revalidatePath('/campaign','layout');return{success:'New code issuance updated. Existing codes and original expiry dates are unchanged.'};
 }
 const id=String(form.get('id')||''),reason=String(form.get('reason')||'').trim();if(!/^[a-f0-9-]{36}$/i.test(id)||!['revoke','reinstate'].includes(action)||!reason||reason.length>300)return{error:'Choose a code action and record the approval reason.'};
 const{error}=await orderDb().rpc('admin_campaign_discount',{p_id:id,p_action:action,p_actor:admin.email,p_reason:reason});
 if(error)return{error:'Unable to change this code. Review the current order, payment/refund status, original expiry and any processing or uncertain balance email before retrying.'};
 refresh();revalidatePath('/admin/orders','layout');return{success:action==='reinstate'?'Code reinstated with its original expiry. Its linked unpaid order, if any, was cancelled. No refund or email was sent.':'Code revoked. Any unsettled linked price needs review; no refund or email was sent.'};
 }catch{return{error:'Unable to update discounts. Check admin access and the current record.'};}
}
export async function quoteDiscountOrder(_prior:DiscountResult,form:FormData):Promise<DiscountResult>{
 try{
 const admin=await verifyAdminAccess();if(process.env.CAMPAIGN_DISCOUNTS_INSTALLED!=='true'||process.env.MANUAL_BALANCE_INSTALLED!=='true')return{error:'Discount pricing is not fully installed.'};
 const id=String(form.get('id')||''),revision=String(form.get('revision')||'');if(!/^[a-f0-9-]{36}$/i.test(id)||!/^\d+$/.test(revision)||!Number.isSafeInteger(Number(revision)))return{error:'Refresh the order before confirming its price.'};
 const unit=moneyCents(form.get('unit')),delivery=moneyCents(form.get('delivery'));
 const{error}=await orderDb().rpc('quote_order_discount',{p_id:id,p_revision:Number(revision),p_unit:unit,p_delivery:delivery,p_actor:admin.email});
 if(error){const messages:Record<string,string>={DISCOUNT_MINIMUM:'The product must cost at least S$50 per unit before discount. Review or revoke the reward before confirming a lower price.',DISCOUNT_REVIEW:'This reward needs review. Check the Discounts screen before pricing.',STALE_PREVIEW:'The order changed. Refresh and review again.',INVALID_TOTAL:'The discounted total cannot be below the verified deposit or exceed the supported total. Review any overpayment manually.',REVIEW_EXISTING_SEND:'A balance email is processing or uncertain. Reconcile it before changing prices.'};return{error:Object.entries(messages).find(([code])=>error.message.includes(code))?.[1]||'Unable to save this price. Review the order and the agreed delivery charge.'};}
 refresh(id);return{success:'Final total saved with the campaign discount calculated once. No balance email was sent.'};
 }catch{return{error:'Check admin access and enter valid amounts with up to two decimal places.'};}
}
