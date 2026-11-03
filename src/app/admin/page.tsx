import CollectionPaymentDesk from '@/components/admin/CollectionPaymentDesk';
import type {BalanceCandidate} from '@/lib/orders/manual-balance';
import {orderDb} from '@/lib/orders/db';
import {orderCursor,parseOrderCursor} from '@/lib/operations/pagination';
import CollectionHandoverPanel from '@/components/admin/CollectionHandoverPanel';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {verifyAdminAccess} from '@/lib/adminAuth';
import CreateLobangForm from '@/components/CreateLobangForm';
import Link from 'next/link';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import {dateTime, money, orderStatus, paymentCleared, readyForHandover} from '@/components/admin/order-presentation';
import styles from '@/components/admin/workspace.module.css';

export const dynamic = 'force-dynamic';
export default async function AdminDashboard({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  await verifyAdminAccess();
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.slice(0, 120) : '';
  const term = q.replace(/[^\p{L}\p{N}@+ .-]/gu, '').trim();
  const collection = params.mode === 'collection';
  const manualBalances=process.env.MANUAL_BALANCE_INSTALLED==='true';
  const status = typeof params.status === 'string' ? params.status : '';
  const cursor=parseOrderCursor(params.after);
  const page = Math.floor(Math.max(1, Math.min(100000, Number(params.page) || 1)));
  // No OFFSET or exact-count scan: seek by indexed timestamp + ID and fetch one look-ahead row.
  let query = supabaseAdmin.from('orders').select('id,order_code,batch_id,customer_name,customer_phone,customer_email,quantity,payment_status,deposit_due_cents,deposit_verified_at,final_total_cents,balance_due_cents,balance_paid_at,ready_at,fulfilled_at,created_at,fulfilment_method,received_by,fulfilled_by'+(manualBalances?',balance_revision':'')).order('created_at', {ascending: false}).order('id',{ascending:false}).limit(51);
  if(cursor)query=query.or(`created_at.lt.${cursor.created},and(created_at.eq.${cursor.created},id.lt.${cursor.id})`);
  if (term&&!/[\p{L}\p{N}]{3}/u.test(term))return <AdminWorkspace><p>Enter at least three characters to search customer details. <Link href="/admin">Back to orders</Link></p></AdminWorkspace>;
  if (term) query = query.or(['order_code', 'customer_name', 'customer_phone', 'customer_email'].map(k => `${k}.ilike.%${term}%`).join(','));
  if (collection) {
    query = query.eq('fulfilment_method', 'collection').eq('payment_status', 'VERIFIED');
    query = status === 'fulfilled' ? query.not('fulfilled_at', 'is', null) : query.is('fulfilled_at', null);
    if(status==='ready')query=query.not('ready_at','is',null);
    if(status==='preparing')query=query.is('ready_at',null);
    if(status==='balance_due')query=query.gt('balance_due_cents',0).is('balance_paid_at',null);
  }
  if (!collection && (status === 'PENDING_PAYNOW' || status === 'VERIFIED' || status === 'REFUNDED')) query = query.eq('payment_status', status);
  if (!collection && status === 'ready') query = query.not('ready_at', 'is', null).is('fulfilled_at', null).eq('payment_status', 'VERIFIED');
  if (!collection && status === 'fulfilled') query = query.not('fulfilled_at', 'is', null);
  const {data:orders,error}=await query.returns<(BalanceCandidate&{customer_phone:string;created_at:string;received_by:string|null;fulfilled_by:string|null})[]>();
  const hasMore=(orders?.length||0)>50,rows=(orders||[]).slice(0,50);
  const batchIds=[...new Set(rows.map(o=>o.batch_id))];
  const {data:batches}=batchIds.length?await supabaseAdmin.from('batches').select('id,product_id').in('id',batchIds).limit(50):{data:[]};
  const productIds=[...new Set((batches||[]).map(b=>b.product_id))];
  const {data:products}=productIds.length?await supabaseAdmin.from('products').select('id,name').in('id',productIds).limit(50):{data:[]};
  const productsById=new Map((products||[]).map(p=>[p.id,p.name]));
  const batchNames=new Map((batches||[]).map(b=>[b.id,productsById.get(b.product_id)]));
  const pageUrl=(n:number,order?:string,after=typeof params.after==='string'?params.after:'')=>`/admin?${new URLSearchParams({q,status,...(collection?{mode:'collection'}:{}),page:String(n),...(after?{after}:{}),...(order?{order}:{})})}`;
  // Selection is restricted to this authorized, filtered page. A stale URL cannot show another order.
  const selected = rows.find(o => o.id === params.order) || rows[0];
  const verification=collection&&manualBalances&&selected?.balance_paid_at?await orderDb().from('order_activity').select('actor').eq('order_id',selected.id).eq('action','balance_paid').order('created_at',{ascending:false}).limit(1).maybeSingle():null;
  const metrics = [
    {label: 'Orders on this page', value: error ? '—' : rows.length, foot: hasMore?'More results available':'End of current results'},
    {label: collection ? 'Units on this page' : 'Deposit pending', value: error ? '—' : collection ? rows.reduce((n, o) => n + o.quantity, 0) : rows.filter(o => o.payment_status === 'PENDING_PAYNOW').length, foot: 'Current page only'},
    {label: collection?'Balance outstanding':'Payment review', value: error ? '—' : rows.filter(o => !o.fulfilled_at && o.payment_status === 'VERIFIED' && (collection?Number(o.balance_due_cents)>0&&!o.balance_paid_at:!paymentCleared(o))).length, foot: 'Current page only'},
    {label: 'Product payment cleared', value: error ? '—' : rows.filter(readyForHandover).length, foot: 'Live storage / collection check required'},
  ];
  return <AdminWorkspace collection={collection}>
    <header className={styles.heading}>
      <div><div className={styles.eyebrow}>{collection ? 'MAKE EVERY HANDOVER COUNT' : 'YOUR DAILY OPERATIONS'}</div><h1>{collection ? 'Collection desk' : 'Orders, in good order.'}</h1><p>{collection ? 'Find the customer. Check the payment. Record the handover.' : 'Follow payments, prepare your orders and keep every handover accounted for.'}</p></div>
      <div className={styles.actions}><Link className={styles.button} href={pageUrl(page)}>↻ Refresh</Link>{!collection && <Link href="/admin/batches?compose=1#new-batch" className={styles.primaryButton}>＋ New batch</Link>}</div>
    </header>
    <section className={`${styles.metrics} ${collection ? styles.collectionMetrics : ''}`} aria-label="Order summary">{metrics.map(m => <div key={m.label} className={styles.metric}><span>{m.label}</span><strong>{m.value}</strong><small>{m.foot}</small></div>)}</section>
    <section className={styles.panel} aria-labelledby="order-list-heading">
      <div className={`${styles.panelHeading} ${collection ? styles.collectionSearchHeading : ''}`}><div><h2 id="order-list-heading">{collection ? 'Find a collection' : 'Order book'}</h2><p>{collection ? 'All items in an order are handed over together.' : 'Search customer details or open an order to manage payments.'}</p></div><small>50 orders per page</small></div>
      <form method="get" className={styles.toolbar}>
        {collection && <input type="hidden" name="mode" value="collection"/>}
        <label className={styles.searchField}><span className={styles.fieldLabel}>Search orders</span><input name="q" placeholder="Order code, name, phone or email" defaultValue={q} maxLength={120}/></label>
        <label><span className={styles.fieldLabel}>{collection ? 'Collection status' : 'Order status'}</span><select name="status" defaultValue={status}>{collection ? <><option value="">All awaiting collection</option><option value="balance_due">Balance outstanding</option><option value="ready">Ready for collection</option><option value="preparing">Preparing</option><option value="fulfilled">Collected</option></> : <><option value="">All statuses</option><option value="PENDING_PAYNOW">Deposit pending</option><option value="VERIFIED">Deposit verified</option><option value="ready">Ready for collection / delivery</option><option value="fulfilled">Collected / delivered</option><option value="REFUNDED">Refunded</option></>}</select></label>
        <button className={styles.primaryButton}>Search</button><Link href={collection ? '/admin?mode=collection' : '/admin'} className={styles.button}>Clear</Link>
      </form>
      {error ? <div role="alert" className={`${styles.notice} ${styles.error}`}>Could not load orders. Refresh or check the database connection and fulfilment setup.</div> : !collection && <div className={styles.tableScroll}><table className={styles.table}><thead><tr>{['Order / date', 'Customer', 'Product / batch', 'Qty', 'Payment', 'Balance', 'Fulfilment', ''].map((h, i) => <th key={i} scope="col">{h || <span className="sr-only">Actions</span>}</th>)}</tr></thead><tbody>
        {rows.map(o => {const badge = orderStatus(o); return <tr key={o.id}>
          <td><Link href={`/admin/orders/${o.id}`} className={styles.orderLink}>{o.order_code}</Link><small>{dateTime(o.created_at)}</small></td>
          <td><strong className={styles.contactName}>{o.customer_name}</strong><small>{o.customer_phone}</small></td>
          <td className={styles.productCell}><strong>{batchNames.get(o.batch_id) || 'Product unavailable'}</strong><small>Batch {o.batch_id.slice(0, 8)}</small></td><td className={styles.quantityCell}>{o.quantity}</td>
          <td><span className={`${styles.badge} ${styles[badge.tone]}`}>{badge.label}</span><small>Deposit {o.payment_status === 'VERIFIED' ? 'verified' : o.payment_status === 'REFUNDED' ? 'refunded' : 'not verified'}</small></td>
          <td><strong>{o.balance_due_cents == null ? 'Not requested' : money(o.balance_due_cents)}</strong><small>{o.balance_due_cents == null ? 'Set final total first' : o.balance_due_cents === 0 ? 'No balance due' : o.balance_paid_at ? 'Verified' : 'Awaiting verification'}</small></td>
          <td><strong>{o.fulfilled_at ? o.fulfilment_method === 'delivery' ? 'Delivered' : 'Collected' : o.ready_at ? 'Marked ready' : 'Not ready'}</strong><small>{o.fulfilment_method === 'delivery' ? 'Delivery' : 'Self-collection'}</small></td>
          <td className={styles.actionCell}><Link className={styles.button} href={`/admin/orders/${o.id}`}>Open order ↗</Link></td>
        </tr>;})}
      </tbody></table></div>}
      {!error && !rows.length && <div className={styles.empty}><h2>No matching orders</h2><p>{collection ? 'Try another order code or contact detail, or switch to collected orders.' : 'Try a different search or clear the status filter.'}</p></div>}
      {!error&&<div className={styles.pagination}><span>{rows.length} orders on this page · Page {page}</span><nav aria-label="Order pages">{cursor&&<Link href={pageUrl(1,undefined,'')}>← First page</Link>}{hasMore&&rows.length>0&&<Link href={pageUrl(page+1,undefined,orderCursor(rows[rows.length-1]))}>Next →</Link>}</nav></div>}
    </section>
    {collection && !error && selected && <div className={styles.collectionGrid} style={{marginTop: 22}}>
      <section className={`${styles.panel} ${styles.queue}`} aria-label="Collection queue"><div className={styles.panelHeading}><h2>Collection queue</h2></div>{rows.map(o => {const badge = orderStatus(o); return <Link key={o.id} href={pageUrl(page, o.id)} scroll={false} aria-current={o.id === selected.id ? 'true' : undefined} className={`${styles.queueLink} ${o.id === selected.id ? styles.queueSelected : ''}`}><div className={styles.queueTop}><strong>{o.customer_name}</strong><small>{o.quantity}×</small></div><small>{o.order_code}</small><p>{batchNames.get(o.batch_id) || 'Product unavailable'}</p><span className={`${styles.badge} ${styles[badge.tone]}`}>{badge.label}</span></Link>;})}</section>
      <section className={`${styles.panel} ${styles.collectionDetail}`} aria-label={`Collection details for ${selected.order_code}`}>
        <div className={styles.orderHeader}><div><div className={styles.eyebrow}>{selected.fulfilled_at ? 'HANDOVER RECORDED' : 'CHECK BEFORE HANDOVER'}</div><h2>{selected.order_code}</h2><small>Self-collection · {selected.quantity} unit(s)</small></div><Link href={`/admin/orders/${selected.id}`} className={styles.button}>Full order ↗</Link></div>
        <div className={styles.customerBlock}><div><h3>{selected.customer_name}</h3><p>{selected.customer_phone}<br/>{selected.customer_email}</p></div><div className={styles.productBlock}><span className={styles.fieldLabel}>ITEMS TO HAND OVER</span><strong>{batchNames.get(selected.batch_id) || 'Product unavailable'}</strong><small>Batch {selected.batch_id.slice(0, 8)} · Quantity {selected.quantity}</small></div></div>
        <div className={styles.paymentGrid}><div>Deposit<strong>{money(selected.deposit_due_cents)}</strong><small>{selected.payment_status === 'VERIFIED' ? 'Verified' : 'Not verified'}</small></div><div>Remaining balance<strong>{money(selected.balance_due_cents)}</strong><small>{selected.balance_due_cents === 0 ? 'No balance due' : selected.balance_paid_at ? 'Verified' : 'Not verified'}</small></div><div>Order total<strong>{money(selected.final_total_cents)}</strong><small>{paymentCleared(selected) ? 'Payment cleared' : 'Payment needs review'}</small></div></div>
        {manualBalances&&<CollectionPaymentDesk order={selected} verifier={verification?.data?.actor}/>}
        {selected.fulfilled_at ? <div className={styles.completed}><h3>✓ Collection already recorded</h3><p>Received by {selected.received_by} · {dateTime(selected.fulfilled_at)}<br/>Recorded by {selected.fulfilled_by}. A second handover is blocked.</p></div> : <CollectionHandoverPanel order={selected}/>}
      </section>
    </div>}
    <p className={styles.note}>Updated when you load or refresh this page. Payment verification and handover records are managed in the website.</p>
    {!collection && <details id="new-batch" open={params.compose === '1'} className={`${styles.panel} ${styles.createBatch}`}><summary>Create a new batch</summary><div><CreateLobangForm/></div></details>}
  </AdminWorkspace>;
}
