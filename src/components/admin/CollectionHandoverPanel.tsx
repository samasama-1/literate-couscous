import Link from 'next/link';
import CollectionCheckoff from '@/components/CollectionCheckoff';
import {orderDb} from '@/lib/orders/db';
import {collectorActive} from '@/lib/collections/access';
import {readyForHandover,money,type OrderReadiness} from './order-presentation';
import styles from './workspace.module.css';

type DeskOrder=OrderReadiness&{id:string;customer_name:string;quantity:number};
export default async function CollectionHandoverPanel({order}:{order:DeskOrder}){
 if(order.fulfilled_at)return null;
 const protectedCollection=process.env.COLLECTION_AUTH_INSTALLED==='true'||process.env.FULFILMENT_V2_ENABLED==='true';
 if(process.env.MANUAL_BALANCE_INSTALLED==='true'&&!protectedCollection)return <section className={styles.handover}><h3>Handover unavailable</h3><p role="alert">Enable the reviewed identity-checked collection setup before handover in manual payment mode. Payment verification alone does not authorise release.</p></section>;
 const db=protectedCollection?orderDb():null;
 const [fees,collectors]=db?await Promise.all([
  db.rpc('collection_fee_summary',{p_id:order.id}),
  db.from('order_collectors').select('id,name,expires_at,revoked_at,used_at').eq('order_id',order.id).maybeSingle(),
 ]):[null,null];
 const summary=fees?.data;
 if(protectedCollection&&(fees?.error||collectors?.error||!summary||typeof summary.eligible!=='boolean'||!Number.isSafeInteger(summary.due_cents)||summary.due_cents<0))return <section className={styles.handover}><h3>Handover unavailable</h3><p role="alert">Could not confirm current collection and storage checks. Refresh or review the full order. Do not release goods while these checks are unavailable.</p><Link href={`/admin/orders/${order.id}`} className={styles.button}>Review full order →</Link></section>;
 const collector=collectorActive(collectors?.data)?collectors!.data:null;
 const storageDue=Number(summary?.due_cents||0)>0;
 const ready=readyForHandover(order)&&!storageDue;
 return <section className={styles.handover} aria-label="Identity and handover checks">
 <h3>Identity & handover</h3>
 {summary&&<div className={styles.notice}><strong>{summary.accrual_mode?`Storage accrual ${summary.accrual_mode}`:'Current storage check'}</strong><p>Storage outstanding: {money(summary.due_cents)}. {summary.accrual_mode?'Existing charges and audit records are preserved.':''}</p>{summary.notice_held&&<p>Collection notification needs admin review. Email retries do not clear the hold.</p>}</div>}
 {collector&&<p>Authorised collector: <strong>{collector.name}</strong>. Match the person and full name to their original photo ID and order code.</p>}
 {!ready?<p>{storageDue?'Settle or approve an adjustment to the recorded storage balance in the full order before handover.':'Verify the product payment and mark the goods ready before recording collection.'}</p>:<><p>Check the order code, current owner or authorised collector and all {order.quantity} unit(s). Record collection successfully before releasing goods.</p><CollectionCheckoff key={[order.id,order.customer_name,collector?.id,order.ready_at,order.balance_paid_at].join(':')} id={order.id} customerName={order.customer_name} collector={collector} requireAuthorisation={protectedCollection}/></>}
 <Link href={`/admin/orders/${order.id}`} className={styles.button}>Full order & collection management →</Link>
 </section>;
}
