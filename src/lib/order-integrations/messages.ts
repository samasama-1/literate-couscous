import {publicOrigin} from './policy';
import {productImage,COLLECTION_POLICY_TEXT} from '../collections/policy';
import {openLink} from './links';
import type {MailMessage} from '../mail/zoho-transport';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function money(v:unknown) {if(!Number.isSafeInteger(v)||Number(v)<0)throw Error('INVALID_AMOUNT');return `S$${(Number(v)/100).toFixed(2)}`;}
export function orderMessage(event:string,p:Record<string,unknown>,orderId:string,origin:string,key:string):MailMessage {
 const code=String(p.order_code||'');if(!/^SAMA-[A-F0-9]{16}$/.test(code))throw Error('INVALID_ORDER_CODE');
 const batch=String(p.batch_id||'');if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(batch))throw Error('INVALID_BATCH');
 const base=publicOrigin(origin);let title:string,body:string;
 if(event==='order_received'){title='We received your order';body=`Your order has been recorded. Payment has not yet been verified. Deposit due: ${money(p.deposit_cents)}. Follow the payment instructions on your order page; contact us if you need help.`;}
 else if(event==='deposit_received'){title='Your deposit is verified';body=`We have verified your deposit of ${money(p.deposit_cents)}. We will contact you when the next step is ready.`;}
 else if(event==='balance_requested'){title='Your remaining balance is ready';const token=openLink(String(p.link_envelope||''),orderId,String(p.balance_hash||''),key);body=`${p.total_cents!=null?`Final order total: ${money(p.total_cents)}. Verified deposit: ${money(p.deposit_cents)}. `:''}Remaining balance: ${money(p.balance_cents)}. View your private payment instructions: ${base}/balance/${token}\nKeep this link private. A newer payment link replaces this one.`;}
 else if(event==='balance_paid'){title='Your remaining payment is verified';body=`We have verified your remaining payment of ${money(p.balance_cents)}. Please wait for your collection or delivery instructions.`;}
 else if(event==='collection_access'){title='Your private collector authorisation form';body='Use the private form below to authorise, replace or revoke a collector. The link expires after 24 hours and can be used once. Enter their full name as shown on their original photo ID. Contact hello@samasama.sg for another link if needed.';}
 else if(event==='collector_changed'){title='Your collector authorisation has changed';body=p.change==='revoked'?'The third-party collection authorisation for this order has been revoked.':`Authorised collector: ${String(p.collector_name||'See your collection record')}. They must bring the order code and their original photo ID. Staff verify the person and name against the current authorisation.`;body+=' If you did not make this change, contact hello@samasama.sg immediately. No pickup code is required.';}
 else if(event==='ready'){title=p.method==='delivery'?'Your order is ready for delivery':'Your order is ready for collection';body=p.method==='delivery'?'Your order is ready for delivery. Reply to arrange the delivery details.':'Your order is ready for collection. Reply to confirm the collection location and time before travelling. Bring your order code.';}
 else throw Error('INVALID_EMAIL_EVENT');
 if(event==='ready'&&p.method==='collection'&&Number(p.balance_cents)>0)body+=`\nRemaining product balance: ${money(p.balance_cents)}, payable at collection. Our team must verify receipt before releasing the goods.`;
 if((event==='ready'||event==='collection_access')&&p.method!=='delivery'){
  if(p.collection_policy===true)body+=`\n${COLLECTION_POLICY_TEXT}`;
  if(typeof p.collection_url==='string'&&p.collection_url.startsWith(`${base}/collection/`))body+=`\nPrivate collector authorisation form: ${p.collection_url}\nKeep this single-use owner link private; it expires after 24 hours. Your collector needs only the order code and their original photo ID. No pickup code is required.`;
 }
 if(!Number.isInteger(p.quantity)||Number(p.quantity)<1)throw Error('INVALID_QUANTITY');
 const lines=[`Hi ${String(p.name||'there')},`,'',body,'',`Order code: ${code}`,`Product: ${String(p.product||'Your selected product')}`,`Quantity: ${p.quantity}`,`Batch ID: ${batch}`,`Product and batch details: ${base}/group-buys/${batch}`,'','Questions? Reply to this email or contact hello@samasama.sg.','— SamaSama'];
 const image=productImage(p.image_url,base);
 const imageHtml=image?`<p><img src="${escape(image)}" alt="${escape(String(p.product||'Your product'))}" width="320" style="max-width:100%;height:auto"/></p>`:'';
 return {to:String(p.email||''),subject:`${title} · ${code}`,text:lines.join('\n'),html:imageHtml+lines.map(l=>`<p>${escape(l)}</p>`).join('')+'<p><a href="mailto:hello@samasama.sg">Contact SamaSama support</a></p>'};
}
