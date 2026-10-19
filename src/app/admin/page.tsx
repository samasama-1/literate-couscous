import CollectionCheckoff from '@/components/CollectionCheckoff';
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
  const status = typeof params.status === 'string' ? params.status : '';
  const page = Math.floor(Math.max(1, Math.min(100000, Number(params.page) || 1)));
  const from = (page - 1) * 50;
  let query = supabaseAdmin.from('orders').select('*', {count: 'exact'}).order('created_at', {ascending: false}).order('id').range(from, from + 49);
  if (term) query = query.or(['order_code', 'customer_name', 'customer_phone', 'customer_email'].map(k => `${k}.ilike.%${term}%`).join(','));
  if (collection) {
    query = query.eq('fulfilment_method', 'collection').eq('payment_status', 'VERIFIED');
    query = status === 'fulfilled' ? query.not('fulfilled_at', 'is', null) : query.not('ready_at', 'is', null).is('fulfilled_at', null);
  }
  if (!collection && (status === 'PENDING_PAYNOW' || status === 'VERIFIED' || status === 'REFUNDED')) query = query.eq('payment_status', status);
  if (!collection && status === 'ready') query = query.not('ready_at', 'is', null).is('fulfilled_at', null).eq('payment_status', 'VERIFIED');
  if (!collection && status === 'fulfilled') query = query.not('fulfilled_at', 'is', null);
  const [{data: orders, error, count}, {data: batches}, {data: products}] = await Promise.all([
    query, supabaseAdmin.from('batches').select('id,product_id'), supabaseAdmin.from('products').select('id,name'),
  ]);
  const rows = orders || [];
  const batchNames = new Map((batches || []).map(b => [b.id, products?.find(p => p.id === b.product_id)?.name]));
  const pageUrl = (n: number, order?: string) => `/admin?${new URLSearchParams({q, status, ...(collection ? {mode: 'collection'} : {}), page: String(n), ...(order ? {order} : {})})}`;
  // Selection is restricted to this authorized, filtered page. A stale URL cannot show another order.
  const selected = rows.find(o => o.id === params.order) || rows[0];
  const metrics = [
    {label: 'Matching orders', value: error ? '—' : count ?? 0, foot: 'Across all result pages'},
    {label: collection ? 'Units on this page' : 'Deposit pending', value: error ? '—' : collection ? rows.reduce((n, o) => n + o.quantity, 0) : rows.filter(o => o.payment_status === 'PENDING_PAYNOW').length, foot: 'Current page only'},
    {label: 'Payment review', value: error ? '—' : rows.filter(o => !o.fulfilled_at && o.payment_status === 'VERIFIED' && !paymentCleared(o)).length, foot: 'Current page only'},
    {label: 'Ready for handover', value: error ? '—' : rows.filter(readyForHandover).length, foot: 'Current page · payment cleared'},
  ];
  return <AdminWorkspace collection={collection}>
    <header className={styles.heading}>
      <div><div className={styles.eyebrow}>{collection ? 'MAKE EVERY HANDOVER COUNT' : 'YOUR DAILY OPERATIONS'}</div><h1>{collection ? 'Collection desk' : 'Orders, in good order.'}</h1><p>{collection ? 'Find the customer. Check the payment. Record the handover.' : 'Follow payments, prepare your orders and keep every handover accounted for.'}</p></div>
      <div className={styles.actions}><Link className={styles.button} href={pageUrl(page)}>↻ Refresh</Link>{!collection && <Link href="/admin?compose=1#new-batch" className={styles.primaryButton}>＋ New batch</Link>}</div>
    </header>
    <section className={`${styles.metrics} ${collection ? styles.collectionMetrics : ''}`} aria-label="Order summary">{metrics.map(m => <div key={m.label} className={styles.metric}><span>{m.label}</span><strong>{m.value}</strong><small>{m.foot}</small></div>)}</section>
    <section className={styles.panel} aria-labelledby="order-list-heading">
      <div className={`${styles.panelHeading} ${collection ? styles.collectionSearchHeading : ''}`}><div><h2 id="order-list-heading">{collection ? 'Find a collection' : 'Order book'}</h2><p>{collection ? 'All items in an order are handed over together.' : 'Search customer details or open an order to manage payments.'}</p></div><small>50 orders per page</small></div>
      <form method="get" className={styles.toolbar}>
        {collection && <input type="hidden" name="mode" value="collection"/>}
        <label className={styles.searchField}><span className={styles.fieldLabel}>Search orders</span><input name="q" placeholder="Order code, name, phone or email" defaultValue={q} maxLength={120}/></label>
        <label><span className={styles.fieldLabel}>{collection ? 'Collection status' : 'Order status'}</span><select name="status" defaultValue={status}>{collection ? <><option value="">Awaiting collection</option><option value="fulfilled">Collected</option></> : <><option value="">All statuses</option><option value="PENDING_PAYNOW">Deposit pending</option><option value="VERIFIED">Deposit verified</option><option value="ready">Ready for collection / delivery</option><option value="fulfilled">Collected / delivered</option><option value="REFUNDED">Refunded</option></>}</select></label>
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
      {!error && <div className={styles.pagination}><span>{count ? `${from + 1}–${from + rows.length} of ${count} orders` : '0 orders'} · Page {page}</span><nav aria-label="Order pages">{page > 1 && <Link href={pageUrl(page - 1)}>← Previous</Link>}{from + 50 < (count || 0) && <Link href={pageUrl(page + 1)}>Next →</Link>}</nav></div>}
    </section>
    {collection && !error && selected && <div className={styles.collectionGrid} style={{marginTop: 22}}>
      <section className={`${styles.panel} ${styles.queue}`} aria-label="Collection queue"><div className={styles.panelHeading}><h2>Collection queue</h2></div>{rows.map(o => {const badge = orderStatus(o); return <Link key={o.id} href={pageUrl(page, o.id)} scroll={false} aria-current={o.id === selected.id ? 'true' : undefined} className={`${styles.queueLink} ${o.id === selected.id ? styles.queueSelected : ''}`}><div className={styles.queueTop}><strong>{o.customer_name}</strong><small>{o.quantity}×</small></div><small>{o.order_code}</small><p>{batchNames.get(o.batch_id) || 'Product unavailable'}</p><span className={`${styles.badge} ${styles[badge.tone]}`}>{badge.label}</span></Link>;})}</section>
      <section className={`${styles.panel} ${styles.collectionDetail}`} aria-label={`Collection details for ${selected.order_code}`}>
        <div className={styles.orderHeader}><div><div className={styles.eyebrow}>{selected.fulfilled_at ? 'HANDOVER RECORDED' : 'CHECK BEFORE HANDOVER'}</div><h2>{selected.order_code}</h2><small>Self-collection · {selected.quantity} unit(s)</small></div><Link href={`/admin/orders/${selected.id}`} className={styles.button}>Full order ↗</Link></div>
        <div className={styles.customerBlock}><div><h3>{selected.customer_name}</h3><p>{selected.customer_phone}<br/>{selected.customer_email}</p></div><div className={styles.productBlock}><span className={styles.fieldLabel}>ITEMS TO HAND OVER</span><strong>{batchNames.get(selected.batch_id) || 'Product unavailable'}</strong><small>Batch {selected.batch_id.slice(0, 8)} · Quantity {selected.quantity}</small></div></div>
        <div className={styles.paymentGrid}><div>Deposit<strong>{money(selected.deposit_due_cents)}</strong><small>{selected.payment_status === 'VERIFIED' ? 'Verified' : 'Not verified'}</small></div><div>Remaining balance<strong>{money(selected.balance_due_cents)}</strong><small>{selected.balance_due_cents === 0 ? 'No balance due' : selected.balance_paid_at ? 'Verified' : 'Not verified'}</small></div><div>Order total<strong>{money(selected.final_total_cents)}</strong><small>{paymentCleared(selected) ? 'Payment cleared' : 'Payment needs review'}</small></div></div>
        {selected.fulfilled_at ? <div className={styles.completed}><h3>✓ Collection already recorded</h3><p>Received by {selected.received_by} · {dateTime(selected.fulfilled_at)}<br/>Recorded by {selected.fulfilled_by}. A second handover is blocked.</p></div> : readyForHandover(selected) ? <div className={styles.handover}><h3>One final check, then hand it over.</h3><p>Match the customer, order code and all {selected.quantity} unit(s) before confirming.</p><CollectionCheckoff key={selected.id} id={selected.id} customerName={selected.customer_name}/></div> : <div className={styles.notice}><strong>Handover unavailable</strong><p>Review payment and readiness in the full order before handing over items.</p><Link href={`/admin/orders/${selected.id}`} className={styles.button}>Review order →</Link></div>}
      </section>
    </div>}
    <p className={styles.note}>Updated when you load or refresh this page. Payment verification and handover records are managed in the website.</p>
    {!collection && <details id="new-batch" open={params.compose === '1'} className={`${styles.panel} ${styles.createBatch}`}><summary>Create a new batch</summary><div><CreateLobangForm/></div></details>}
  </AdminWorkspace>;
}
