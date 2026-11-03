'use server';
import 'server-only';
import {observeOperation} from '@/lib/operations/telemetry';
import {loadCollectionAccess} from '@/lib/collections/server';
import {limitRequest} from '@/lib/campaigns/security';
import {orderDb} from '@/lib/orders/db';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {moneyCents} from '@/lib/orders/validation';
import {revalidatePath} from 'next/cache';
export type CollectionResult={error?:string;success?:string};
export async function authoriseCollector(_prev:CollectionResult,form:FormData):Promise<CollectionResult>{
 return observeOperation('collection_authorisation',async()=>{
 try{
  const access=await loadCollectionAccess(String(form.get('token')||''));if(!access)return {error:'This private link is unavailable. Contact hello@samasama.sg.'};
  await limitRequest('collection-authorisation',8,600,access.order.id);
  const revoke=form.get('intent')==='revoke',name=String(form.get('name')||'').trim(),consent=form.get('consent')==='on';
  if(!revoke&&process.env.DELEGATED_COLLECTION_ENABLED!=='true')return {error:'New collector authorisations are paused. You can still revoke an existing authorisation.'};
  if(!revoke&&(!consent||name.length<1||name.length>150||/[\u0000-\u001f\u007f]/.test(name)))return {error:'Enter the collector’s full name as shown on their photo ID and confirm authorisation.'};
  const {error}=await access.db.rpc('set_named_collector',{p_id:access.order.id,p_version:access.claims.version,p_email:access.order.customer_email,p_ready:access.order.ready_at,p_expires:access.claims.expires,p_consent:consent,p_name:name,p_revoke:revoke});
  if(error)return {error:'Could not update the authorisation. Refresh or contact support.'};
  revalidatePath(`/admin/orders/${access.order.id}`);
  return {success:revoke?'Authorisation revoked. This form link has now been used. Contact support if you need another link.':'Authorisation saved. Your collector needs the order code and their original photo ID. This form link has now been used. Contact support to change the collector.'};
 }catch{return {error:'Unable to update now. Please wait a few minutes or contact hello@samasama.sg.'};}
 });
}
export async function manageCollection(_prev:CollectionResult,form:FormData):Promise<CollectionResult>{
 return observeOperation('collection_admin',async()=>{
 try{
  const admin=await verifyAdminAccess();
  if(process.env.COLLECTION_AUTH_INSTALLED!=='true'&&process.env.FULFILMENT_V2_ENABLED!=='true')return {error:'Collection management is not enabled.'};
  const id=String(form.get('id')||''),action=String(form.get('intent')||''),note=String(form.get('note')||'').trim(),reference=String(form.get('reference')||'').trim();
  if(!/^[a-f0-9-]{36}$/i.test(id)||!['pause','resume','extend','reduce','payment','review','stop','revoke_access','send_access','notice_hold'].includes(action)||!note||note.length>300||reference.length>200)return {error:'Choose an action and enter a reason (up to 300 characters).'};
  let amount:number|null=null;
  if(action==='extend'){amount=Number(form.get('amount'));if(!Number.isInteger(amount)||amount<1||amount>365)return {error:'Enter 1–365 additional free days.'};}
  if(action==='reduce'||action==='payment')amount=moneyCents(form.get('amount'));
  if(action==='send_access'&&process.env.DELEGATED_COLLECTION_ENABLED!=='true')return {error:'Delegated collection is paused.'};
  if(action==='notice_hold'&&process.env.COLLECTION_FEE_HOLD_INSTALLED!=='true')return {error:'Notice safety controls are not installed.'};
  if(!['send_access','revoke_access','notice_hold'].includes(action)&&process.env.FULFILMENT_V2_ENABLED!=='true')return {error:'Storage controls are not enabled.'};
  const {error}=action==='send_access'?await orderDb().rpc('queue_collection_access',{p_id:id,p_actor:admin.email}):await orderDb().rpc('collection_admin_operation',{p_id:id,p_action:action,p_actor:admin.email,p_amount:amount,p_note:note,p_reference:reference||null});
  if(error){const safe:Record<string,string>={FEES_SAFETY_HELD:'Fee accrual is held. Clock changes require a separately approved release.',LINK_RECENTLY_QUEUED:'An owner link was recently queued. Check email deliveries before retrying.',NOTICE_NOT_SENT:'The ready email must be accepted before the storage clock can be paused.',PAYMENT_REFERENCE_REUSED:'This payment reference is already in use.',PAYMENT_MISMATCH:'Verify the exact outstanding storage amount and enter its bank reference.',INVALID_REDUCTION:'Reduction must be positive and no more than the outstanding storage fee.',REVIEW_NOT_DUE:'Cancellation or resale review is not due yet.',NO_ACCEPTED_POLICY:'This order did not accept the new collection terms.'};return {error:Object.entries(safe).find(([code])=>error.message.includes(code))?.[1]||'Unable to save. Refresh the order and check its current status.'};}
  revalidatePath(`/admin/orders/${id}`);revalidatePath('/admin');revalidatePath('/admin/storage-safety');return {success:'Collection record updated. Reason saved in the activity history.'};
 }catch{return {error:'Unable to update collection. Check your admin access and inputs.'};}
 });
}
