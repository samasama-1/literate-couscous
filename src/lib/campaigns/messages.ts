type Offer={code:string;expiresAt:string};
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

// Customer-approved one-step acknowledgement. No owner-review token or second opt-in.
export function campaignAcknowledgement(input:{name:string;price:string;coupon?:Offer;origin:string;unsubscribeUrl:string}){
 const {name,price,coupon,origin,unsubscribeUrl}=input;
 const expiry=coupon?new Date(coupon.expiresAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}):null;
 const preview='Thanks for helping shape what SamaSama brings in next.';
 const blocks:{text:string;strong?:boolean;href?:string}[]=[
  {text:'Hi,'},
  {text:'Thanks for helping us choose what to bring in next.',strong:true},
  {text:`You’ve registered your interest in ${name}, with an estimated launch price of ${price}.`},
  {text:'Your input helps guide our sourcing decisions. Before we open a batch, we review suppliers, check product claims and samples, and work through the fulfilment details.'},
  {text:'There’s nothing to pay, and you haven’t placed an order.',strong:true},
  {text:'Before you commit, we’ll share the confirmed product details, batch pricing, estimated timeline and support terms.'},
 ];
 if(coupon)blocks.push(
  {text:'A thank-you for being here early',strong:true},
  {text:'Your personal first-order code:'},
  {text:coupon.code,strong:true},
  {text:'Get S$10 off each eligible unit in your first order, for up to 10 units. Use it on any eligible SamaSama product.'},
  {text:`Use the same email address you registered with. Valid until ${expiry}, Singapore time.`},
  {text:'Your deposit stays unchanged; the discount reduces your final balance.'},
  // Keep the agreed eligibility clear without changing the approved reward policy.
  {text:'Eligible products must cost at least S$50 per unit before discount.'},
  {text:'Terms and conditions apply',href:`${origin}/campaign-offer-terms`},
 );
 blocks.push(
  {text:'See how SamaSama works',href:`${origin}/how-it-works`},
  {text:`Questions about ${name} or the process?`},
  {text:'Reply to this email—we’re happy to help.'},
  {text:'Thanks for being part of the journey,\nThe SamaSama team'},
  {text:'You can unsubscribe from email marketing anytime. Unsubscribing does not invalidate an already-issued code or extend its original expiry. Existing unsubscribe preferences are preserved.'},
  {text:'Manage marketing preferences',href:unsubscribeUrl},
 );
 return {
  subject:coupon?'Your pick is in—here’s your S$10 thank-you':'Your pick is in—thanks for helping shape SamaSama',
  text:blocks.map(b=>b.href?`${b.text}: ${b.href}`:b.text).join('\n\n'),
  html:renderCampaignEmail(blocks,preview,origin,coupon),
 };
}

type Block={text:string;strong?:boolean;href?:string};
function renderCampaignEmail(blocks:Block[],preview:string,origin:string,coupon?:Offer){
 const paragraph=(b:Block)=>`<p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#2E3326">${b.href?`<a href="${escapeHtml(b.href)}" style="color:#4A533C;text-decoration:underline">${escapeHtml(b.text)}</a>`:b.strong?`<strong>${escapeHtml(b.text)}</strong>`:escapeHtml(b.text).replace(/\n/g,'<br>')}</p>`;
 const intro=blocks.slice(0,6).map(paragraph).join('');
 const reward=coupon?blocks.slice(6,14):[];
 const rest=blocks.slice(coupon?14:6);
 const footer=rest.slice(1).map(paragraph).join('');
 const code=coupon?escapeHtml(coupon.code).replace(/(.{8})/g,'$1<wbr>'):'';
 const couponHtml=coupon?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;border:1px solid #C0CBB1;border-radius:12px;background:#F5F2EB"><tr><td style="padding:24px"><p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;color:#616954;text-transform:uppercase">A thank-you for being here early</p><h2 style="margin:0 0 16px;font-size:28px;line-height:1.25;color:#4A533C">S$10 off each eligible unit</h2><p style="margin:0 0 10px;font-size:14px;color:#616954">Your personal first-order code</p><p style="margin:0 0 20px;padding:14px 12px;background:#FFFFFF;border:1px dashed #A0AA91;border-radius:6px;font-family:monospace;font-size:18px;font-weight:bold;line-height:1.6;letter-spacing:1px;color:#2E3326;overflow-wrap:anywhere;word-break:break-all">${code}</p>${reward.slice(3).map(paragraph).join('')}</td></tr></table>`:'';
 return `<div style="margin:0;padding:0;background:#FAF8F5;color:#2E3326;font-family:Arial,Helvetica,sans-serif;color-scheme:light"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preview)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FAF8F5"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;border:1px solid #E2DCD0;border-radius:12px"><tr><td style="padding:26px 28px 22px"><p style="margin:0;font-size:27px;letter-spacing:-1px;font-weight:bold;color:#4A533C">SamaSama</p><p style="margin:5px 0 0;font-size:11px;letter-spacing:1.6px;color:#616954;text-transform:uppercase">Tested first. Bought together.</p></td></tr><tr><td><img src="${escapeHtml(origin)}/email/campaign-thank-you.jpg" width="600" height="200" alt="" role="presentation" style="display:block;width:100%;max-width:600px;height:auto;background:#F5F2EB;border:0"></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 24px;font-size:32px;line-height:1.2;letter-spacing:-.7px;color:#2E3326">Your pick is in.</h1>${intro}${couponHtml}<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 28px"><tr><td bgcolor="#4A533C" style="border-radius:7px"><a href="${escapeHtml(origin)}/how-it-works" style="display:inline-block;padding:14px 20px;color:#FFFFFF;font-size:15px;font-weight:bold;text-decoration:none;border:1px solid #4A533C;border-radius:7px">See how SamaSama works</a></td></tr></table>${footer}</td></tr></table><p style="margin:18px 0 0;font-size:12px;color:#616954;line-height:1.6">SamaSama · <a href="mailto:hello@samasama.sg" style="color:#4A533C">hello@samasama.sg</a></p></td></tr></table></div>`;
}
