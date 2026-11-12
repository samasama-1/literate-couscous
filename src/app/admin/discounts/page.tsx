import Link from 'next/link';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
import {orderCursor,parseOrderCursor} from '@/lib/operations/pagination';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import DiscountControls from '@/components/admin/DiscountControls';
import {dateTime,money} from '@/components/admin/order-presentation';
import styles from '@/components/admin/workspace.module.css';
export const dynamic='force-dynamic';
type Coupon={id:string;lead_id:string;email:string;issued_at:string;expires_at:string;status:string;expired:boolean;paid_cents:number;order_id:string|null};
export default async function Discounts({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 await verifyAdminAccess();
 if(process.env.CAMPAIGN_DISCOUNTS_INSTALLED!=='true')return <AdminWorkspace section="discounts"><h1>Campaign discounts</h1><p>The reviewed discount migration and feature setting must be installed first.</p></AdminWorkspace>;
 const params=await searchParams,cursor=parseOrderCursor(params.after);
 const{data,error}=await orderDb().rpc('campaign_discount_report',{p_after:cursor?.created||null,p_after_id:cursor?.id||null});
 const report=data as {enabled:boolean;codes:Coupon[]}|null,rows=(report?.codes||[]).slice(0,50);
 return <AdminWorkspace section="discounts"><header className={styles.heading}><div><h1>Campaign discounts</h1><p>S$10 per unit · Up to 10 units · Products S$50 or more · First order · Six calendar months</p></div><Link href="/admin/discounts" className={styles.button}>Refresh</Link></header>
 {error||!report?<p role="alert">Discount controls are unavailable. Check the reviewed database setup.</p>:<><section className={styles.panel}><h2>New code issuance: {report.enabled?'enabled':'paused'}</h2><DiscountControls key={String(report.enabled)} enabled={report.enabled}/></section>
 <section className={styles.panel} style={{marginTop:20}}><h2>Issued rewards</h2><p>Code secrets are never displayed here. Customers receive their code in the campaign confirmation email. Up to 50 records per page.</p><div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Registered email</th><th>State</th><th>Issued / expires · Singapore time</th><th>Order / approval</th></tr></thead><tbody>{rows.map(v=><tr key={v.id}><td>{v.email}<small><Link href={`/admin/campaigns/leads/${v.lead_id}`}>Confirmation email & retries →</Link></small></td><td>{v.status}{v.expired&&<small>Expired for new redemption</small>}</td><td>{dateTime(v.issued_at)}<small>{dateTime(v.expires_at)}</small></td><td>{v.order_id&&<Link href={`/admin/orders/${v.order_id}`}>Review linked order →</Link>}<small>Recorded received: {money(v.paid_cents||0)}. Refund only actual discounted funds received.</small><details><summary>Manage reward</summary><DiscountControls key={[v.id,v.status,v.order_id].join(':')} id={v.id}/></details></td></tr>)}</tbody></table></div>{!rows.length&&<p>No rewards issued yet.</p>}
 <nav className={styles.pagination} aria-label="Reward pages">{cursor&&<Link href="/admin/discounts">First page</Link>}{(report.codes?.length||0)>50&&<Link href={`/admin/discounts?${new URLSearchParams({after:orderCursor({id:rows[rows.length-1].id,created_at:rows[rows.length-1].issued_at})})}`}>Next 50 →</Link>}</nav></section></>}
 </AdminWorkspace>;
}
