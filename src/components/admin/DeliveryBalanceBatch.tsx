'use client';
import {useActionState,useState} from 'react';
import Link from 'next/link';
import {sendDeliveryBalances,type DeliveryBalanceResult} from '@/app/actions/delivery-balances';
import {deliveryBalanceBlock,type BalanceCandidate} from '@/lib/orders/manual-balance';
import {money,dateTime} from './order-presentation';
import styles from './workspace.module.css';
export default function DeliveryBalanceBatch({orders,products,requestId,capturedAt}:{orders:BalanceCandidate[];products:Record<string,string>;requestId:string;capturedAt:number}){
 const[result,action,pending]=useActionState<DeliveryBalanceResult,FormData>(sendDeliveryBalances,{});
 const[selected,setSelected]=useState<string[]>([]),[review,setReview]=useState(false);
 const chosen=orders.filter(o=>selected.includes(o.id));
 function toggle(id:string){setReview(false);setSelected(old=>old.includes(id)?old.filter(x=>x!==id):old.length<25?[...old,id]:old);}
 return <form action={action}>
 <input type="hidden" name="request_id" value={requestId}/><input type="hidden" name="selection" value={JSON.stringify(chosen.map(o=>({id:o.id,revision:o.balance_revision})))}/>
 <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Select</th><th>Order / product</th><th>Recipient</th><th>Qty</th><th>Final total / deposit</th><th>Balance</th><th>Status</th></tr></thead><tbody>{orders.map(o=>{const block=deliveryBalanceBlock(o,capturedAt);return <tr key={o.id}><td><input type="checkbox" aria-label={`Select ${o.order_code}`} checked={selected.includes(o.id)} disabled={!!block||pending||!!result.success||(!selected.includes(o.id)&&selected.length>=25)} onChange={()=>toggle(o.id)}/></td><td><Link href={`/admin/orders/${o.id}`}>{o.order_code}</Link><small>{products[o.batch_id]||'Product unavailable'}</small></td><td>{o.customer_name}<small>{o.customer_email}</small></td><td>{o.quantity}</td><td>{money(o.final_total_cents)}<small>Verified deposit {money(o.deposit_due_cents)}</small></td><td>{money(o.balance_due_cents)}</td><td>{block||'Ready for your review'}{o.balance_requested_at&&<small>Last request {dateTime(o.balance_requested_at)}</small>}</td></tr>;})}</tbody></table></div>
 <p>{selected.length} selected · up to 25 per send. Missing totals, settled orders and current balance requests cannot be selected.</p>
 <button type="button" className={styles.button} disabled={!chosen.length||pending||!!result.success} onClick={()=>setReview(true)}>Preview selected emails</button>
 {review&&<section className={styles.detailSection}><h2>Review before sending</h2><p>Each email includes the product image when available, product/batch, quantity, order code, final total, verified deposit, remaining balance, its own private payment link and hello@samasama.sg. Private links are generated only when you confirm.</p>
 {chosen.map(o=><article key={o.id} className={styles.notice}><strong>To: {o.customer_email}</strong><p>Subject: Your remaining balance is ready · {o.order_code}</p><p>Hi {o.customer_name},<br/>Product: {products[o.batch_id]||'Product unavailable'} · {o.quantity} unit(s)<br/>Final total: {money(o.final_total_cents)} · Verified deposit: {money(o.deposit_due_cents)}<br/>Remaining balance: <strong>{money(o.balance_due_cents)}</strong><br/>Your email will contain a private link to the payment instructions.<br/>Questions? Reply or contact hello@samasama.sg.</p></article>)}
 <label className={styles.confirmation}><input name="confirmed" type="checkbox" required disabled={pending||!!result.success}/>I reviewed these recipients and final balances, including all agreed delivery charges, and approve sending these requests.</label>
 <button className={styles.primaryButton} disabled={pending||!!result.success}>{pending?'Queuing…':`Queue ${chosen.length} delivery balance email${chosen.length===1?'':'s'}`}</button>
 <p>Only this confirmation queues balance emails. The existing worker delivers approved jobs with its normal limits; no new schedule is created. Check each order for accepted/failed/review status.</p></section>}
 {result.error&&<p role="alert" className={styles.notice}>{result.error}</p>}{result.success&&<div role="status" className={styles.completed}><p>{result.success}</p><a href="/admin/delivery-payments" className={styles.button}>Review more delivery orders</a></div>}
 </form>;
}
