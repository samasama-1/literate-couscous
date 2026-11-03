import {productImage} from '@/lib/collections/policy';
import Image from 'next/image';
import {loadBalanceOrder} from '@/lib/orders/balance';
import {notFound} from 'next/navigation';
import {orderDb} from '@/lib/orders/db';
import {paymentConfig} from '@/lib/orders/payment-config';
export const dynamic='force-dynamic';
export const metadata={title:'Your remaining payment | SamaSama',robots:{index:false,follow:false, nocache:true},referrer:'no-referrer' as const};
export default async function BalancePage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;if(!/^[a-f0-9]{64}$/.test(token))notFound();const db=orderDb();
 const o=await loadBalanceOrder(token);if(!o)notFound();
 const {data:b}=await db.from('batches').select('product_id').eq('id',o.batch_id).single();const {data:p}=b?await db.from('products').select('name,image_url').eq('id',b.product_id).single():{data:null};
 const image=productImage(p?.image_url,process.env.NEXT_PUBLIC_SITE_URL||'https://www.samasama.sg');
 const pay=paymentConfig(),money=(n:number)=>`S$${(n/100).toFixed(2)}`;
 return <div className="container-site" style={{maxWidth:650,padding:'3rem 1rem'}}><h1>Your remaining payment</h1><h2>{p?.name||'Your order'}</h2><p>Order {o.order_code} · {o.quantity} unit(s)</p>
 {image&&<Image unoptimized src={image} width={320} height={320} alt={p?.name||'Your product'} style={{maxWidth:'100%',height:'auto'}}/>}
 <p>Final order total: <strong>{money(o.final_total_cents)}</strong><br/>Verified deposit: {money(o.deposit_due_cents)}<br/>Remaining payment: <strong>{money(o.balance_due_cents)}</strong></p>
 {o.balance_paid_at||o.balance_due_cents===0?<p>Your order is fully paid. SamaSama will confirm collection or delivery arrangements.</p>:process.env.MANUAL_BALANCE_INSTALLED==='true'&&o.fulfilment_method==='collection'?<p>Your remaining product balance is payable at collection. Our team will verify the actual funds before handover; no advance balance payment is requested here.</p>:pay.configured?<><p>Transfer the exact remaining amount by PayNow to UEN <strong>{pay.uen}</strong>. Confirm the payee is <strong>{pay.payee}</strong>.</p>{pay.qr&&<Image unoptimized src={pay.qr} width={240} height={240} alt="PayNow QR"/>}<p>Payment reference: <strong>{o.order_code}-BAL</strong></p><p>Your payment is confirmed after our team checks the bank transaction. Refresh this page after verification to see the updated status.</p></>:<p>Payment instructions are being prepared. Please wait for SamaSama to confirm them before transferring.</p>}
 <p>Your address is already saved with the order. If it needs changing, contact SamaSama before fulfilment.</p>
 <p>Need help? <a href="mailto:hello@samasama.sg">hello@samasama.sg</a>. Include your order code when contacting us.</p>
 </div>;
}
