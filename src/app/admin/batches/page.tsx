import Link from 'next/link';
import {batchPageTime} from '@/lib/batches/server';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import CreateLobangForm from '@/components/CreateLobangForm';
import {dateTime} from '@/components/admin/order-presentation';
import styles from '@/components/admin/workspace.module.css';
export const dynamic = 'force-dynamic';
export default async function BatchesPage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  await verifyAdminAccess();
  const params = await searchParams;
  const {now} = batchPageTime();
  const page = Math.floor(Math.max(1, Math.min(100000, Number(params.page) || 1))), from = (page - 1) * 50;
  const status = typeof params.status === 'string' ? params.status : '';
  let query = supabaseAdmin.from('batches').select('*', {count: 'exact'}).order('created_at', {ascending: false}).order('id').range(from, from + 49);
  if (status === 'OPEN' || status === 'CLOSED' || status === 'DELIVERED') query = query.eq('status', status);
  const {data: batches, error, count} = await query;
  const {data: products} = batches?.length ? await supabaseAdmin.from('products').select('id,name').in('id', batches.map(b => b.product_id)) : {data: []};
  const names = new Map((products || []).map(p => [p.id, p.name]));
  const pageUrl = (n: number) => `/admin/batches?${new URLSearchParams({page: String(n), status})}`;
  return <AdminWorkspace section="batches"><header className={styles.heading}><div><div className={styles.eyebrow}>YOUR GROUP BUYS</div><h1>Batches</h1><p>Open the public page, copy its link or manage an existing batch.</p></div><Link href="/admin/batches?compose=1#new-batch" className={styles.primaryButton}>＋ New batch</Link></header>
    {params.deleted === '1' && <p role="status" className={styles.notice}>Empty batch deleted. Its old public link is no longer available.</p>}
    <div className={styles.notice}>Batches are preorder/payment pages. Voting confirmation emails are tested through <Link href="/admin/campaigns/manage">campaign pages</Link>, not batch orders.</div>
    <section className={styles.panel}><div className={styles.panelHeading}><h2>All batches</h2><small>{count ?? 0} matching · Page {page}</small></div>
      <form method="get" className={styles.toolbar}><label><span className={styles.fieldLabel}>Batch status</span><select name="status" defaultValue={status}><option value="">All statuses</option><option value="OPEN">Open (including expired)</option><option value="CLOSED">Closed</option><option value="DELIVERED">Delivered / completed</option></select></label><button className={styles.primaryButton}>Apply filter</button><Link href="/admin/batches" className={styles.button}>Clear</Link></form>
      {error ? <div className={`${styles.notice} ${styles.error}`} role="alert">Could not load batches. Refresh and check the database connection.</div> : batches?.length ? <div className={styles.tableScroll}><table className={styles.table}><thead><tr>{['Product / batch', 'Status', 'Capacity', 'Deposit / unit', 'Closes · Singapore', 'Actions'].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{batches.map(b => <tr key={b.id}>
        <td className={styles.productCell}><Link href={`/admin/batches/${b.id}`} className={styles.orderLink}>{names.get(b.product_id) || 'Product unavailable'}</Link><small>{b.id.slice(0, 8)}</small></td>
        <td><span className={`${styles.badge} ${b.status === 'OPEN' && Date.parse(b.closes_at) > now ? styles.success : styles.neutral}`}>{b.status === 'OPEN' ? Date.parse(b.closes_at) > now ? 'Open' : 'Expired' : b.status === 'CLOSED' ? 'Closed' : 'Completed'}</span></td><td>{b.target_capacity} units</td><td>S${Number(b.deposit_amount).toFixed(2)}</td><td>{dateTime(b.closes_at)}</td>
        <td><div className={styles.actions}><Link className={styles.button} href={`/admin/batches/${b.id}`}>Manage & copy link</Link><Link className={styles.button} href={`/group-buys/${b.id}`} target="_blank" rel="noreferrer">Public page ↗</Link></div></td>
      </tr>)}</tbody></table></div> : <div className={styles.empty}><h2>No matching batches</h2><p>Create your first batch below or clear the status filter.</p></div>}
      <div className={styles.pagination}><span>Up to 50 batches per page</span><nav aria-label="Batch pages">{page > 1 && <Link href={pageUrl(page - 1)}>← Previous</Link>}{from + 50 < (count || 0) && <Link href={pageUrl(page + 1)}>Next →</Link>}</nav></div>
    </section>
    <details className={`${styles.panel} ${styles.createBatch}`} id="new-batch" open={params.compose === '1'}><summary>Create a new batch</summary><div><CreateLobangForm/></div></details>
  </AdminWorkspace>;
}
