import Link from 'next/link';
import OrderOperationForm from '@/components/OrderOperationForm';
import {confirmedTotal,type BalanceCandidate} from '@/lib/orders/manual-balance';
import {dateTime} from './order-presentation';
import styles from './workspace.module.css';
export default function CollectionPaymentDesk({order,verifier}:{order:BalanceCandidate;verifier?:string|null}){
 if(order.fulfilled_at)return null;
 if(order.deposit_due_cents==null||!order.deposit_verified_at)return <p>Review the verified deposit record before taking the remaining payment. <Link href={`/admin/orders/${order.id}`}>Open order</Link></p>;
 const totalKnown=confirmedTotal(order);
 return <section className={styles.detailSection}><h3>Payment at collection</h3><p>Confirm the final product total, match the actual bank payment, then perform the separate identity and handover check. No advance balance email is sent for self-collection.</p>
 {!order.ready_at&&!order.balance_paid_at&&<details open={!totalKnown}><summary>{totalKnown?'Review / change final total':'Confirm the final order total first'}</summary><OrderOperationForm key={`total:${order.id}:${order.balance_revision}`} id={order.id} operation="final_total" label="Confirm final total" amount={order.final_total_cents} revision={order.balance_revision}/><p>Use the actual agreed total for all units. This saves the balance; it does not send an email or mark it paid.</p></details>}
 {totalKnown&&!order.ready_at&&<OrderOperationForm key={`ready:${order.id}:${order.balance_revision}`} id={order.id} operation="collection_ready" label="Mark ready for collection" revision={order.balance_revision}/>}
 {totalKnown&&Number(order.balance_due_cents)>0&&!order.balance_paid_at&&<OrderOperationForm key={`pay:${order.id}:${order.balance_revision}`} id={order.id} operation="collection_payment" label="Verify balance received at collection" amount={order.balance_due_cents!} revision={order.balance_revision} referenceLabel="Bank transaction reference — check the actual credited funds"/>}
 {order.balance_paid_at&&<p className={styles.completed}>Product balance verified {dateTime(order.balance_paid_at)}{verifier?` by ${verifier}`:''}. Identity, storage and handover checks still apply.</p>}
 {totalKnown&&order.balance_due_cents===0&&<p>No remaining product balance is due. Continue with readiness, identity and storage checks.</p>}
 </section>;
}
