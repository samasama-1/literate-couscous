import 'server-only';
import {createHash} from 'node:crypto';
import {orderDb} from './db';
export async function loadBalanceOrder(token:string){
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const {data,error}=await orderDb().from('orders')
  .select('order_code,batch_id,quantity,payment_status,final_total_cents,deposit_due_cents,balance_due_cents,balance_paid_at,fulfilled_at')
  .eq('balance_token_hash',createHash('sha256').update(token).digest('hex'))
  .gt('balance_token_expires_at',new Date().toISOString()).maybeSingle();
 if(error||!data||data.payment_status!=='VERIFIED'||data.final_total_cents==null||data.deposit_due_cents==null||data.balance_due_cents==null||data.final_total_cents!==data.deposit_due_cents+data.balance_due_cents)return null;
 return data;
}
