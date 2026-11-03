import {collectorActive} from '@/lib/collections/access';
import {notFound} from 'next/navigation';
import {loadCollectionAccess} from '@/lib/collections/server';
import CollectionAuthorisationForm from '@/components/CollectionAuthorisationForm';
import {COLLECTION_POLICY_TEXT} from '@/lib/collections/policy';
import {dateTime,money} from '@/components/admin/order-presentation';
export const dynamic='force-dynamic';
export const metadata={title:'Collection authorisation | SamaSama',robots:{index:false,follow:false,nocache:true},referrer:'no-referrer' as const};
export default async function CollectionPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;let access;
 try{access=await loadCollectionAccess(token);}catch{return <div className="container-site"><h1>Collection access temporarily unavailable</h1><p>Please wait a few minutes or contact hello@samasama.sg.</p></div>;}
 if(!access)notFound();
 const {order,db}=access;
 const [{data:fee,error:feeError},{data:collector,error:collectorError}]=await Promise.all([db.rpc('collection_fee_summary',{p_id:order.id}),db.from('order_collectors').select('name,expires_at,revoked_at,used_at').eq('order_id',order.id).maybeSingle()]);
 if(feeError||collectorError)throw Error('Collection information unavailable');
 return <div className="container-site" style={{maxWidth:700,padding:'3rem 1rem'}}><h1>Arrange collection</h1><p>Order {order.order_code} · {order.quantity} unit(s). Collection must be arranged with SamaSama before travelling.</p>
 {fee?.eligible&&<><p>{COLLECTION_POLICY_TEXT}</p><p>{fee.notice_at?<>Free collection until {dateTime(fee.free_until)}. Storage outstanding: <strong>{money(fee.due_cents)}</strong>.</>:<>The storage clock has not started.</>}{fee.paused&&' Your storage clock is paused.'}</p></>}
 <h2>Authorise another person</h2><p>Enter the collector’s full name as shown on their original photo ID. They bring their ID and the order code; no pickup code is needed. Use this form once to authorise, replace or revoke a collector. The link expires 24 hours after issue. Contact hello@samasama.sg for another owner-only link if needed.</p>
 {collector&&collectorActive(collector)&&<p>Currently authorised: {collector.name}. Expires {dateTime(collector.expires_at)}.</p>}
 <CollectionAuthorisationForm token={token}/><p>Need help or an extension? <a href="mailto:hello@samasama.sg">hello@samasama.sg</a>. Include your order code.</p></div>;
}
