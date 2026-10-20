export type Event = 'order_received'|'deposit_received'|'balance_requested'|'balance_paid'|'ready';
export type OrderState = {customer_email:string|null;payment_status:string;deposit_verified_at:string|null;balance_token_hash:string|null;balance_token_expires_at:string|null;balance_paid_at:string|null;ready_at:string|null;fulfilled_at:string|null;final_total_cents:number|null;deposit_due_cents:number|null;balance_due_cents:number|null};
export function emailStillRelevant(event:string,payload:Record<string,unknown>,o:OrderState,now=Date.now()) {
 if(!o.customer_email || o.customer_email!==payload.email || o.payment_status==='REFUNDED') return false;
 if(event==='order_received') return o.payment_status==='PENDING_PAYNOW';
 if(event==='deposit_received') return o.payment_status==='VERIFIED' && !!o.deposit_verified_at;
 if(event==='balance_requested') return o.payment_status==='VERIFIED' && !o.balance_paid_at && !o.fulfilled_at && !o.ready_at && o.balance_due_cents!==null && o.balance_due_cents>0 && o.balance_token_hash===payload.balance_hash && Date.parse(o.balance_token_expires_at||'')>now;
 if(event==='balance_paid') return o.payment_status==='VERIFIED' && !!o.balance_paid_at;
 if(event==='ready') return o.payment_status==='VERIFIED' && !!o.ready_at && !o.fulfilled_at && o.final_total_cents!==null && o.deposit_due_cents!==null && o.balance_due_cents!==null && o.final_total_cents===o.deposit_due_cents+o.balance_due_cents && (o.balance_due_cents===0 || !!o.balance_paid_at);
 return false;
}
export function publicOrigin(value:string) { const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('SITE_ORIGIN');return u.origin; }
