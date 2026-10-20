import Link from 'next/link';
import {notFound} from 'next/navigation';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {publicBatchUrl, uuid} from '@/lib/batches/validation';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import BatchForm, {DeleteBatchForm} from '@/components/admin/BatchForm';
import BatchShareLinks from '@/components/admin/BatchShareLinks';
import styles from '@/components/admin/workspace.module.css';
export const dynamic = 'force-dynamic';
export default async function ManageBatch({params}: {params: Promise<{id: string}>}) {
  await verifyAdminAccess();
  const {id} = await params;
  if (!uuid.test(id)) notFound();
  const {data: batch, error} = await supabaseAdmin.from('batches').select('*').eq('id', id).single();
  if (error || !batch) notFound();
  const [{data: product}, {count, error: orderError}] = await Promise.all([
    supabaseAdmin.from('products').select('*').eq('id', batch.product_id).single(),
    supabaseAdmin.from('orders').select('id', {count: 'exact', head: true}).eq('batch_id', id),
  ]);
  const url = publicBatchUrl(id, process.env.NEXT_PUBLIC_SITE_URL || 'https://www.samasama.sg');
  const initial = {id, revision: batch.admin_revision || 1, name: product?.name || '', description: product?.description || '', image_url: product?.image_url || '', features: Array.isArray(product?.features) ? product.features.filter(f => typeof f === 'string').join('\n') : '', retail_price: product?.retail_price == null ? '' : Number(product.retail_price).toFixed(2), target_capacity: batch.target_capacity, deposit_amount: Number(batch.deposit_amount).toFixed(2), tier_1_price: Number(batch.tier_1_price).toFixed(2), tier_2_price: batch.tier_2_price == null ? '' : Number(batch.tier_2_price).toFixed(2), tier_3_price: batch.tier_3_price == null ? '' : Number(batch.tier_3_price).toFixed(2), closes_at: new Date(Date.parse(batch.closes_at) + 8 * 3600000).toISOString().slice(0, 16), status: batch.status};
  return <AdminWorkspace section="batches"><Link href="/admin/batches" className={styles.backLink}>← Back to batches</Link><header className={styles.heading}><div><div className={styles.eyebrow}>BATCH MANAGEMENT</div><h1>{product?.name || 'Manage batch'}</h1><p>{id} · {orderError ? 'Order count unavailable' : `${count || 0} order(s)`}</p></div><Link href={`/group-buys/${id}`} target="_blank" rel="noreferrer" className={styles.button}>Open public page ↗</Link></header>
    <section className={`${styles.panel} ${styles.detailSection}`}><h2>Share this batch</h2><BatchShareLinks url={url}/><p className={styles.note}>Closing a batch stops new orders but keeps the public details and existing customer records. The homepage may still show Coming soon; this direct link opens the batch.</p></section>
    <section className={`${styles.panel} ${styles.detailSection}`} style={{marginTop: 22}}>{orderError || !product ? <p role="alert">Unable to verify product/order data. Editing and deletion are unavailable; refresh and try again.</p> : <><BatchForm key={batch.admin_revision || 1} initial={initial} publicOrigin={new URL(url).origin} pricesLocked={(count || 0) > 0}/>{count ? <div className={styles.notice} style={{marginTop: 24}}>This batch has orders and cannot be deleted. Set its status to Closed to stop new orders.</div> : <DeleteBatchForm id={id} revision={batch.admin_revision || 1}/>}</>}</section>
  </AdminWorkspace>;
}
