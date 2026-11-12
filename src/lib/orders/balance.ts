import 'server-only';
import {createHash} from 'node:crypto';
import {orderDb} from './db';
export async function loadBalanceOrder(token:string){
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const {data,error}=await orderDb().from('orders')
  .select('fulfilment_method,order_code,batch_id,quantity,payment_status,final_total_cents,deposit_due_cents,balance_due_cents,balance_paid_at,fulfilled_at'+(process.env.CAMPAIGN_DISCOUNTS_INSTALLED==='true'?',campaign_discount_cents,quoted_unit_cents,delivery_charge_cents':''))
  .eq('balance_token_hash',createHash('sha256').update(token).digest('hex'))
  .gt('balance_token_expires_at',new Date().toISOString()).maybeSingle<{fulfilment_method:string;order_code:string;batch_id:string;quantity:number;payment_status:string;final_total_cents:number;deposit_due_cents:number;balance_due_cents:number;balance_paid_at:string|null;fulfilled_at:string|null;campaign_discount_cents?:number;quoted_unit_cents?:number|null;delivery_charge_cents?:number|null}>();
 if(error||!data||data.payment_status!=='VERIFIED'||data.final_total_cents==null||data.deposit_due_cents==null||data.balance_due_cents==null||data.final_total_cents!==data.deposit_due_cents+data.balance_due_cents)return null;
 return data;
}
