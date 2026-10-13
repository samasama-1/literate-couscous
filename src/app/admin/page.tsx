import CollectionCheckoff from '@/components/CollectionCheckoff';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {signOut} from '../actions/auth';
import CreateLobangForm from '@/components/CreateLobangForm';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function AdminDashboard({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 await verifyAdminAccess();
 const params=await searchParams;
 const q=typeof params.q==='string'?params.q.slice(0,120):'';
 const term=q.replace(/[^\p{L}\p{N}@+ .-]/gu,'').trim();
 const collection=params.mode==='collection';
 const status=typeof params.status==='string'?params.status:'';
 const page=Math.max(1,Math.min(100000,Number(params.page)||1));const from=(Math.floor(page)-1)*50;
 let query=supabaseAdmin.from('orders').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(from,from+49);
 if(term)query=query.or(['order_code','customer_name','customer_phone','customer_email'].map(k=>`${k}.ilike.%${term}%`).join(','));
 if(collection){
  query=query.eq('fulfilment_method','collection').eq('payment_status','VERIFIED');
  query=status==='fulfilled'?query.not('fulfilled_at','is',null):query.not('ready_at','is',null).is('fulfilled_at',null);
 }
 if(!collection&&(status==='PENDING_PAYNOW'||status==='VERIFIED'||status==='REFUNDED'))query=query.eq('payment_status',status);
 if(!collection&&status==='ready')query=query.not('ready_at','is',null).is('fulfilled_at',null).eq('payment_status','VERIFIED');
 if(!collection&&status==='fulfilled')query=query.not('fulfilled_at','is',null);
 const [{data:orders,error,count},{data:batches},{data:products}]=await Promise.all([query,supabaseAdmin.from('batches').select('id,product_id'),supabaseAdmin.from('products').select('id,name')]);
 const batchNames=new Map((batches||[]).map(b=>[b.id,products?.find(p=>p.id===b.product_id)?.name]));
 const pageUrl=(n:number)=>`/admin?${new URLSearchParams({q,status,...(collection?{mode:'collection'}:{}),page:String(n)})}`;
 return <div className="container-site" style={{padding:'3rem 1rem'}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><h1>{collection?'Collection checklist':'Orders & collection'}</h1><Link href="/admin/campaigns" className="btn btn-secondary">Campaign leads</Link><form action={signOut}><button className="btn btn-outline">Logout</button></form></div>
 <div style={{display:'flex',gap:12,marginTop:20}}><Link href="/admin" className="btn btn-secondary">All orders</Link><Link href="/admin?mode=collection" className="btn btn-primary">Collection checklist</Link></div>
 {collection&&<p>Search by the customer’s order code or contact details. Check the order and quantity before handing over all items, then mark collected. Completed orders move to the collected list.</p>}
 <p>Search for an order, verify deposits and balances, then record collection or delivery. Refresh this page to see new submissions.</p>
 <form method="get" style={{display:'flex',gap:12,flexWrap:'wrap',margin:'2rem 0'}}>
 {collection&&<input type="hidden" name="mode" value="collection"/>}
 <input name="q" aria-label="Search orders" placeholder="Order code, name, phone or email" defaultValue={q} maxLength={120} style={{padding:12,minWidth:280}}/>
 {collection?<select name="status" aria-label="Collection status" defaultValue={status}><option value="">Awaiting collection</option><option value="fulfilled">Collected</option></select>:(<select name="status" aria-label="Order status" defaultValue={status}><option value="">All statuses</option><option value="PENDING_PAYNOW">Deposit pending</option><option value="VERIFIED">Deposit verified</option><option value="ready">Ready for collection / delivery</option><option value="fulfilled">Collected / delivered</option><option value="REFUNDED">Refunded</option></select>)}

 <button className="btn btn-primary">Search</button><Link href={collection?'/admin?mode=collection':'/admin'} className="btn btn-secondary">Clear</Link>
 </form>
 {error?<p role="alert">Could not load orders. Check the database connection and apply order_fulfilment.sql before using the new workflow.</p>:<>
 <p>{count||0} matching orders · Page {Math.floor(page)}</p>
 {collection?(<div>{(orders||[]).map(o=><article key={o.id} style={{border:'1px solid var(--color-border)',borderRadius:12,background:'white',padding:24,margin:'16px 0',maxWidth:1000}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}><div style={{flex:1,minWidth:230}}><h2 style={{marginTop:0}}>{o.order_code}</h2><strong>{o.customer_name}</strong><p>{o.customer_phone}<br/>{o.customer_email}</p><p><strong>{batchNames.get(o.batch_id)||'Product unavailable'} · {o.quantity} unit(s)</strong></p>
 <p>{o.fulfilled_at?'Collected':(o.final_total_cents!=null&&(o.balance_due_cents===0||o.balance_paid_at))?'Fully paid · Ready for collection':'Payment needs review'}</p>
 {o.fulfilled_at&&<p>Received by {o.received_by}<br/>{new Date(o.fulfilled_at).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})}<br/>Recorded by {o.fulfilled_by}</p>}</div>
 {!o.fulfilled_at&&o.ready_at&&o.final_total_cents!=null&&(o.balance_due_cents===0||o.balance_paid_at)?<CollectionCheckoff id={o.id} customerName={o.customer_name}/>:<Link href={`/admin/orders/${o.id}`} className="btn btn-secondary">Manage order</Link>}
 </div></article>)}</div>):(<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Order / date','Customer','Product / batch','Quantity','Deposit','Balance','Fulfilment','Action'].map(h=><th key={h} style={{textAlign:'left',padding:12}}>{h}</th>)}</tr></thead><tbody>
 {(orders||[]).map(o=><tr key={o.id} style={{borderTop:'1px solid var(--color-border)'}}>
 <td style={{padding:12}}><strong>{o.order_code}</strong><br/>{new Date(o.created_at).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})}</td>
 <td style={{padding:12}}>{o.customer_name}<br/>{o.customer_phone}<br/>{o.customer_email}</td>
 <td style={{padding:12}}>{batchNames.get(o.batch_id)||'Product unavailable'}<br/><small>{o.batch_id.slice(0,8)}</small></td><td style={{padding:12}}>{o.quantity}</td>
 <td style={{padding:12}}>{o.payment_status}</td>
 <td style={{padding:12}}>{o.balance_due_cents==null?'Not requested':o.balance_due_cents===0?'No balance due':o.balance_paid_at?'Verified':`S$${(o.balance_due_cents/100).toFixed(2)} pending`}</td>
 <td style={{padding:12}}>{o.fulfilled_at?(o.fulfilment_method==='delivery'?'Delivered':'Collected'):o.ready_at?'Ready':'Not ready'}{o.fulfilled_at&&<><br/><small>{new Date(o.fulfilled_at).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})} · {o.received_by} · {o.fulfilled_by}</small></>}</td>
 <td style={{padding:12}}>{collection&&!o.fulfilled_at&&o.ready_at&&o.payment_status==='VERIFIED'&&o.final_total_cents!=null&&(o.balance_due_cents===0||o.balance_paid_at)?<CollectionCheckoff id={o.id} customerName={o.customer_name}/>:<Link className="btn btn-secondary btn-sm" href={`/admin/orders/${o.id}`}>Manage order</Link>}</td>
 </tr>)}
 </tbody></table></div>)}
 {!orders?.length&&<p>No matching orders.</p>}
 <div style={{display:'flex',gap:20,margin:'2rem 0'}}>{page>1&&<Link href={pageUrl(page-1)}>Previous</Link>}{from+50<(count||0)&&<Link href={pageUrl(page+1)}>Next</Link>}</div>
 </>}
 {!collection&&<><h2>Create a new batch</h2><CreateLobangForm/></>}
 </div>;
}
