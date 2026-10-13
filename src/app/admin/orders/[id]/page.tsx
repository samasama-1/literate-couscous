import Link from 'next/link';
import {notFound} from 'next/navigation';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
import OrderOperationForm from '@/components/OrderOperationForm';
export const dynamic='force-dynamic';
const money=(n:number|null)=>n==null?'Not set':`S$${(n/100).toFixed(2)}`;
export default async function OrderDetail({params}:{params:Promise<{id:string}>}){
 await verifyAdminAccess();const {id}=await params;if(!/^[a-f0-9-]{36}$/i.test(id))notFound();
 const {data:o}=await supabaseAdmin.from('orders').select('*').eq('id',id).single();if(!o)notFound();
 const {data:batch}=await supabaseAdmin.from('batches').select('*').eq('id',o.batch_id).single();
 const {data:product}=batch?await supabaseAdmin.from('products').select('name').eq('id',batch.product_id).single():{data:null};
 const {data:history,error}=await orderDb().from('order_activity').select('action,actor,metadata,created_at').eq('order_id',id).order('created_at',{ascending:false});
 const deposit=o.deposit_due_cents??Math.round(Number(batch?.deposit_amount||0)*100)*o.quantity;
 const active=o.payment_status!=='REFUNDED'&&!o.fulfilled_at;
 const full=o.payment_status==='VERIFIED'&&o.final_total_cents!=null&&(o.balance_due_cents===0||!!o.balance_paid_at);
 return <div className="container-site" style={{padding:'3rem 1rem',maxWidth:850}}><Link href="/admin">Back to orders</Link><h1>{o.order_code}</h1>
 <h2>{product?.name} · {o.quantity} unit(s)</h2><p>{o.customer_name} · {o.customer_phone} · {o.customer_email}</p>
 <h3>Address saved for fulfilment</h3><p>{o.address_line1||'Address missing — older order'}<br/>{o.address_line2}<br/>{o.postal_code&&`Singapore ${o.postal_code}`}</p><p>Preference: {o.fulfilment_method||'collection'}</p>
 <p>Deposit: {money(o.deposit_due_cents)} ({o.payment_status})<br/>Final total: {money(o.final_total_cents)}<br/>Remaining balance: {money(o.balance_due_cents)} {o.balance_paid_at?'— verified':''}</p>
 {error?<p role="alert">Apply order_fulfilment.sql before using payment and fulfilment actions.</p>:<>
 {active&&o.payment_status==='PENDING_PAYNOW'&&<OrderOperationForm id={id} operation="deposit" label="Verify deposit" amount={deposit} referenceLabel="Bank transaction reference (check the bank receipt first)"/>}
 {active&&o.payment_status==='VERIFIED'&&o.deposit_due_cents==null&&<OrderOperationForm id={id} operation="legacy_deposit" label="Record historical deposit" amount={deposit} referenceLabel="Original bank reference — confirm amount actually received"/>}
 {active&&o.payment_status==='VERIFIED'&&o.deposit_due_cents!=null&&!o.balance_paid_at&&!o.ready_at&&<OrderOperationForm id={id} operation="balance_request" label="Create / replace balance request" amount={o.final_total_cents??Math.max(deposit,Math.round(Number(batch?.tier_1_price||0)*100)*o.quantity)}/>}
 {active&&o.payment_status==='VERIFIED'&&o.balance_due_cents!=null&&o.balance_due_cents>0&&!o.balance_paid_at&&<OrderOperationForm id={id} operation="balance_paid" label="Verify remaining payment" amount={o.balance_due_cents} referenceLabel="Bank transaction reference"/>}
 {active&&full&&!o.ready_at&&<OrderOperationForm id={id} operation="ready" label="Mark ready for collection / delivery"/>}
 {active&&full&&o.ready_at&&<OrderOperationForm id={id} operation="fulfil" label={o.fulfilment_method==='delivery'?'Mark delivered':'Confirm collection'} referenceLabel={o.fulfilment_method==='delivery'?'Delivery proof / recipient reference':'Name of person collecting (check their order code and contact details)'}/>}
 {o.fulfilled_at&&<p role="status">{o.fulfilment_method==='delivery'?'Delivered':'Collected'}: {new Date(o.fulfilled_at).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})} · Received by {o.received_by} · Recorded by {o.fulfilled_by}</p>}
 <h2>Activity history</h2>{(history||[]).map(h=><div key={`${h.created_at}-${h.action}`} style={{borderTop:'1px solid #ddd',padding:12}}><strong>{h.action}</strong> · {h.actor} · {new Date(h.created_at).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})}<pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(h.metadata,null,2)}</pre></div>)}
 </>}
 </div>;
}
