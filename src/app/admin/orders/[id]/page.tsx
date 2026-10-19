import Link from 'next/link';
import {notFound} from 'next/navigation';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
import OrderOperationForm from '@/components/OrderOperationForm';
import CollectionCheckoff from '@/components/CollectionCheckoff';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import {dateTime, money, orderStatus, paymentCleared} from '@/components/admin/order-presentation';
import styles from '@/components/admin/workspace.module.css';
export const dynamic='force-dynamic';
export default async function OrderDetail({params}:{params:Promise<{id:string}>}){
 await verifyAdminAccess();const {id}=await params;if(!/^[a-f0-9-]{36}$/i.test(id))notFound();
 const {data:o}=await supabaseAdmin.from('orders').select('*').eq('id',id).single();if(!o)notFound();
 const {data:batch}=await supabaseAdmin.from('batches').select('*').eq('id',o.batch_id).single();
 const {data:product}=batch?await supabaseAdmin.from('products').select('name').eq('id',batch.product_id).single():{data:null};
 const {data:history,error}=await orderDb().from('order_activity').select('action,actor,metadata,created_at').eq('order_id',id).order('created_at',{ascending:false});
 const deposit=o.deposit_due_cents??Math.round(Number(batch?.deposit_amount||0)*100)*o.quantity;
 const active=o.payment_status!=='REFUNDED'&&!o.fulfilled_at;
 const full=paymentCleared(o);
 const badge=orderStatus(o);
 return <AdminWorkspace>
 <Link href="/admin" className={styles.backLink}>← Back to order book</Link>
 <header className={styles.heading}><div><div className={styles.eyebrow}>ORDER DETAILS</div><h1>{o.order_code}</h1><p>{product?.name || 'Product unavailable'} · {o.quantity} unit(s) · Batch {o.batch_id.slice(0,8)}</p></div><span className={`${styles.badge} ${styles[badge.tone]}`}>{badge.label}</span></header>
 <div className={styles.detailGrid}>
 <div className={styles.panel}>
 <section className={styles.detailSection}><h2>Customer & fulfilment</h2><dl className={styles.descriptionList}>
 <div><dt>Customer name</dt><dd>{o.customer_name}</dd></div><div><dt>Phone</dt><dd>{o.customer_phone}</dd></div>
 <div><dt>Email</dt><dd>{o.customer_email || 'Not provided'}</dd></div><div><dt>Fulfilment preference</dt><dd>{o.fulfilment_method==='delivery'?'Delivery':'Self-collection'}</dd></div>
 <div><dt>Address saved for fulfilment</dt><dd>{o.address_line1||'Address missing — older order'}{o.address_line2&&<><br/>{o.address_line2}</>}{o.postal_code&&<><br/>Singapore {o.postal_code}</>}</dd></div><div><dt>Registered · Singapore time</dt><dd>{dateTime(o.created_at)}</dd></div>
 </dl></section>
 <section className={styles.detailSection}><h2>Payment overview</h2><div className={styles.paymentGrid}>
 <div>Deposit<strong>{money(o.deposit_due_cents)}</strong><small>{o.payment_status==='VERIFIED'?'Verified':o.payment_status==='REFUNDED'?'Refunded':'Not verified'}</small></div>
 <div>Remaining balance<strong>{money(o.balance_due_cents)}</strong><small>{o.balance_due_cents===0?'No balance due':o.balance_paid_at?'Verified':'Not verified'}</small></div>
 <div>Final total<strong>{money(o.final_total_cents)}</strong><small>Whole order · SGD</small></div>
 </div><dl className={styles.descriptionList}><div><dt>Deposit verified</dt><dd>{dateTime(o.deposit_verified_at)}</dd></div><div><dt>Balance verified</dt><dd>{dateTime(o.balance_paid_at)}</dd></div><div><dt>Marked ready</dt><dd>{dateTime(o.ready_at)}</dd></div><div><dt>Handover recorded</dt><dd>{dateTime(o.fulfilled_at)}</dd></div></dl></section>
 <section className={styles.detailSection}><h2>Activity history</h2>{error?<p role="alert">Unable to load activity. Check the fulfilment setup.</p>:history?.length?<div className={styles.timeline}>{history.map(h=><article key={`${h.created_at}-${h.action}`} className={styles.event}><strong>{h.action.replaceAll('_',' ')}</strong><small>{dateTime(h.created_at)} · {h.actor}</small><details><summary>View recorded details</summary><pre>{JSON.stringify(h.metadata,null,2)}</pre></details></article>)}</div>:<p>No recorded activity yet.</p>}</section>
 </div>
 <aside className={styles.panel}><section className={styles.detailSection}><h2>Next steps</h2>
 {error?<p role="alert">Apply order_fulfilment.sql before using payment and fulfilment actions.</p>:<>
 {active&&o.payment_status==='PENDING_PAYNOW'&&<OrderOperationForm id={id} operation="deposit" label="Verify deposit" amount={deposit} referenceLabel="Bank transaction reference (check the bank receipt first)"/>}
 {active&&o.payment_status==='VERIFIED'&&o.deposit_due_cents==null&&<OrderOperationForm id={id} operation="legacy_deposit" label="Record historical deposit" amount={deposit} referenceLabel="Original bank reference — confirm amount actually received"/>}
 {active&&o.payment_status==='VERIFIED'&&o.deposit_due_cents!=null&&!o.balance_paid_at&&!o.ready_at&&<OrderOperationForm id={id} operation="balance_request" label="Create / replace balance request" amount={o.final_total_cents??Math.max(deposit,Math.round(Number(batch?.tier_1_price||0)*100)*o.quantity)}/>}
 {active&&o.payment_status==='VERIFIED'&&o.balance_due_cents!=null&&o.balance_due_cents>0&&!o.balance_paid_at&&<OrderOperationForm id={id} operation="balance_paid" label="Verify remaining payment" amount={o.balance_due_cents} referenceLabel="Bank transaction reference"/>}
 {active&&full&&!o.ready_at&&<OrderOperationForm id={id} operation="ready" label="Mark ready for collection / delivery"/>}
 {active&&full&&o.ready_at&&(o.fulfilment_method==='delivery'?<OrderOperationForm id={id} operation="fulfil" label="Mark delivered" referenceLabel="Delivery proof / recipient reference"/>:<div className={styles.handover}><h3>Confirm handover</h3><p>Check the customer, order code and all {o.quantity} unit(s).</p><CollectionCheckoff id={id} customerName={o.customer_name}/></div>)}

 {o.fulfilled_at&&<div className={styles.completed} role="status"><h3>{o.fulfilment_method==='delivery'?'Delivery':'Collection'} recorded</h3><p>{dateTime(o.fulfilled_at)}<br/>Received by {o.received_by}<br/>Recorded by {o.fulfilled_by}</p></div>}
 {o.payment_status==='REFUNDED'&&<p>This order is refunded. Payment and handover actions are unavailable.</p>}
 </>}
 <p className={styles.note}>Verify payments against your bank records before recording them here.</p>
 </section></aside>
 </div>
 </AdminWorkspace>;
}
