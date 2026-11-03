import Link from 'next/link';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
import {orderCursor,parseOrderCursor} from '@/lib/operations/pagination';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import CollectionNoticeHoldForm from '@/components/admin/CollectionNoticeHoldForm';
import {dateTime} from '@/components/admin/order-presentation';
import styles from '@/components/admin/workspace.module.css';
export const dynamic='force-dynamic';
type Notice={id:string;order_code:string;customer_name:string;held_at:string;recorded_at:string;reason:string};
type SafetyReport={mode:'off'|'suspended';frozen_at:string;notices:Notice[]};
const reasons:Record<string,string>={confirmed_bounce:'Confirmed bounce',reported_non_delivery:'Customer reports non-delivery',collection_unavailable:'Collection unavailable'};
export default async function StorageSafety({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 await verifyAdminAccess();
 if(process.env.COLLECTION_FEE_HOLD_INSTALLED!=='true')return <AdminWorkspace section="safety"><h1>Storage safety</h1><p>The reviewed storage safety migration and installation setting must be applied before this screen is available. Do not treat unavailable controls as confirmation that storage is clear.</p></AdminWorkspace>;
 const params=await searchParams,cursor=parseOrderCursor(params.after),q=typeof params.order==='string'?params.order.trim().toUpperCase():'';
 const db=orderDb();
 const{data,error}=await db.rpc('storage_safety_overview',{p_after:cursor?.created||null,p_after_id:cursor?.id||null});
 const report=data as SafetyReport|null,notices=report?.notices||[],rows=notices.slice(0,50);
 const validCode=/^SAMA-[A-F0-9]{16}$/.test(q);
 const found=validCode?await db.from('orders').select('id,order_code,customer_name,fulfilment_method,payment_status,fulfilled_at').eq('order_code',q).maybeSingle():null;
 const order=found?.data;
 const available=process.env.COLLECTION_AUTH_INSTALLED==='true'||process.env.FULFILMENT_V2_ENABLED==='true';
 return <AdminWorkspace section="safety"><header className={styles.heading}><div><div className={styles.eyebrow}>COLLECTION SAFEGUARDS</div><h1>Storage safety</h1><p>Review the fee hold and record collection notification issues. Payment and handover checks remain enforced.</p></div><Link href="/admin/storage-safety" className={styles.button}>Refresh</Link></header>
 {error||!report?<section className={styles.panel}><p role="alert">Storage safety status is unavailable. Check the reviewed setup; do not assume billing is off or goods are cleared.</p></section>:<>
 <section className={styles.panel}><h2>Storage accrual: {report.mode}</h2><p>Elapsed time is frozen at {dateTime(report.frozen_at)}. Existing balances, reductions, payments and audit records remain preserved.</p><p>No billing activation or resume control is available in this release. A provider accepting an email does not start a new fee clock or clear a notification hold.</p></section>
 <section className={styles.panel} style={{marginTop:20}}><h2>Record a notification issue</h2><form method="get" className={styles.toolbar}><label className={styles.searchField}>Exact order code<input name="order" defaultValue={q} placeholder="SAMA-0123456789ABCDEF" maxLength={21} required/></label><button className={styles.primaryButton}>Find order</button></form>
 {q&&!validCode?<p role="alert">Enter the complete order code beginning SAMA-, followed by 16 letters A–F or digits.</p>:found?.error?<p role="alert">Order lookup failed. Refresh before recording a hold.</p>:q&&!order?<p>No matching order.</p>:order?<><p><strong>{order.customer_name}</strong> · <Link href={`/admin/orders/${order.id}`}>{order.order_code}</Link></p>{!available?<p>Collection management must be installed before recording notification issues.</p>:order.fulfilment_method!=='collection'||order.fulfilled_at||order.payment_status==='REFUNDED'?<p>This is not an outstanding collection order. Review its full record.</p>:<CollectionNoticeHoldForm key={order.id} id={order.id}/>}</>:<p>Use the complete order code to find one order. No customer email, phone or address is required here.</p>}
 </section>
 <section className={styles.panel} style={{marginTop:20}}><h2>Notification holds</h2><p>Up to 50 records per page. Holds persist across email retries and require admin review.</p>{rows.length?<div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Order / customer</th><th>Issue</th><th>Recorded · Singapore time</th><th>Action</th></tr></thead><tbody>{rows.map(n=><tr key={n.id}><td><Link href={`/admin/orders/${n.id}`}>{n.order_code}</Link><small>{n.customer_name}</small></td><td>{reasons[n.reason]||'Needs review'}</td><td>{dateTime(n.recorded_at)}</td><td><Link href={`/admin/orders/${n.id}`} className={styles.button}>Review order</Link></td></tr>)}</tbody></table></div>:<p>No recorded notification holds.</p>}
 <nav aria-label="Notification hold pages" className={styles.pagination}>{cursor&&<Link href="/admin/storage-safety">First page</Link>}{notices.length>50&&rows.length>0&&<Link href={`/admin/storage-safety?${new URLSearchParams({after:orderCursor({id:rows[rows.length-1].id,created_at:rows[rows.length-1].recorded_at})})}`}>Next 50 holds →</Link>}</nav></section>
 </>}
 </AdminWorkspace>;
}
