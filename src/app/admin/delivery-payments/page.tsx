import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
import {orderCursor,parseOrderCursor} from '@/lib/operations/pagination';
import type {BalanceCandidate} from '@/lib/orders/manual-balance';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import DeliveryBalanceBatch from '@/components/admin/DeliveryBalanceBatch';
import styles from '@/components/admin/workspace.module.css';
export const dynamic='force-dynamic';
async function capturePreviewTime(){return Date.now();}
export default async function DeliveryPayments({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 await verifyAdminAccess();
 if(process.env.MANUAL_BALANCE_INSTALLED!=='true')return <AdminWorkspace section="delivery"><h1>Delivery balance emails</h1><p>The reviewed manual-balance migration and rollout flag must be installed before this page is available.</p></AdminWorkspace>;
 const capturedAt=await capturePreviewTime();
 const params=await searchParams,q=typeof params.q==='string'?params.q.slice(0,120):'',term=q.replace(/[^\p{L}\p{N}@+ .-]/gu,'').trim(),cursor=parseOrderCursor(params.after);
 let query=orderDb().from('orders').select('id,order_code,customer_name,customer_email,quantity,batch_id,fulfilment_method,payment_status,deposit_due_cents,deposit_verified_at,final_total_cents,balance_due_cents,balance_paid_at,balance_token_expires_at,balance_requested_at,ready_at,fulfilled_at,balance_revision,created_at').eq('fulfilment_method','delivery').eq('payment_status','VERIFIED').is('fulfilled_at',null).is('balance_paid_at',null).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
 if(term&&!/[\p{L}\p{N}]{3}/u.test(term))return <AdminWorkspace section="delivery"><p>Enter at least three characters. <Link href="/admin/delivery-payments">Clear search</Link></p></AdminWorkspace>;
 if(cursor)query=query.or(`created_at.lt.${cursor.created},and(created_at.eq.${cursor.created},id.lt.${cursor.id})`);
 if(term)query=query.or(['order_code','customer_name','customer_email'].map(k=>`${k}.ilike.%${term}%`).join(','));
 const{data,error}=await query.returns<(BalanceCandidate&{created_at:string})[]>();const rows=(data||[]).slice(0,50),more=(data?.length||0)>50;
 const ids=[...new Set(rows.map(o=>o.batch_id))];const{data:batches}=ids.length?await orderDb().from('batches').select('id,product_id').in('id',ids).limit(50):{data:[]};
 const productIds=[...new Set((batches||[]).map(b=>b.product_id))];const{data:products}=productIds.length?await orderDb().from('products').select('id,name').in('id',productIds).limit(50):{data:[]};
 const names=Object.fromEntries((batches||[]).map(b=>[b.id,(products||[]).find(p=>p.id===b.product_id)?.name||'Product unavailable']));
 return <AdminWorkspace section="delivery"><header className={styles.heading}><div><h1>Delivery balance emails</h1><p>Review delivery orders, then choose exactly which payment requests to send. Self-collection balances are handled at the collection desk.</p></div><Link href="/admin?mode=collection" className={styles.button}>Collection desk</Link></header>
 <section className={styles.panel}><form method="get" className={styles.toolbar}><label>Find delivery orders<input name="q" defaultValue={q} placeholder="Order code, customer or email" maxLength={120}/></label><button className={styles.button}>Search</button><Link href="/admin/delivery-payments">Clear</Link></form>
 <p>Confirm each final order total in the order details first. Changing a total invalidates the old payment link. A current request is not a reminder: reconcile its job status rather than sending a duplicate.</p>
 {error?<p role="alert">Unable to load delivery orders. Check the manual-balance setup.</p>:!rows.length?<p>No outstanding delivery orders match.</p>:<DeliveryBalanceBatch orders={rows} products={names} requestId={randomUUID()} capturedAt={capturedAt}/>}
 <nav aria-label="Delivery order pages" className={styles.pagination}>{cursor&&<Link href={`/admin/delivery-payments?${new URLSearchParams({q})}`}>First page</Link>}{more&&rows.length>0&&<Link href={`/admin/delivery-payments?${new URLSearchParams({q,after:orderCursor(rows[rows.length-1])})}`}>Next 50 orders →</Link>}</nav>
 </section></AdminWorkspace>;
}
