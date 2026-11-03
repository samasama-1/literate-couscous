// Pure preview/validation only; database RPCs recheck all state under lock.
export type BalanceCandidate={id:string;order_code:string;customer_name:string;customer_email:string|null;quantity:number;batch_id:string;fulfilment_method:string;payment_status:string;deposit_due_cents:number|null;deposit_verified_at?:string|null;final_total_cents:number|null;balance_due_cents:number|null;balance_paid_at:string|null;balance_token_hash?:string|null;balance_token_expires_at?:string|null;balance_requested_at?:string|null;ready_at:string|null;fulfilled_at:string|null;balance_revision:number};
export function confirmedTotal(o:Pick<BalanceCandidate,'deposit_due_cents'|'final_total_cents'|'balance_due_cents'>){return [o.deposit_due_cents,o.final_total_cents,o.balance_due_cents].every(v=>Number.isSafeInteger(v)&&Number(v)>=0)&&o.final_total_cents===Number(o.deposit_due_cents)+Number(o.balance_due_cents);}
export function deliveryBalanceBlock(o:BalanceCandidate,now=Date.now()):string|null{
 if(o.fulfilment_method!=='delivery'||o.payment_status!=='VERIFIED'||o.fulfilled_at||o.ready_at)return 'Not eligible for a delivery balance request';
 if(!o.deposit_verified_at||!confirmedTotal(o))return 'Confirm the final total in the order first';
 if(o.balance_paid_at||o.balance_due_cents===0)return 'No outstanding balance';
 if(!o.customer_email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.customer_email))return 'Customer email needs review';
 if(o.balance_token_expires_at&&Date.parse(o.balance_token_expires_at)>now)return 'Request already issued — check the order email status';
 return null;
}
export function parseBalanceSelection(value:unknown):{id:string;revision:number}[]{
 if(typeof value!=='string'||value.length>5000)throw Error('INVALID_SELECTION');
 const rows=JSON.parse(value);if(!Array.isArray(rows)||rows.length<1||rows.length>25)throw Error('INVALID_SELECTION');
 const seen=new Set<string>();return rows.map(r=>{if(!r||typeof r.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(r.id)||seen.has(r.id)||!Number.isSafeInteger(r.revision)||r.revision<0)throw Error('INVALID_SELECTION');seen.add(r.id);return{id:r.id,revision:r.revision};});
}
