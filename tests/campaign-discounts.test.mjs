import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {orderSummary} from '../src/lib/order-integrations/crm.ts';
import {emailStillRelevant} from '../src/lib/order-integrations/policy.ts';
import {sealLink,openLink} from '../src/lib/order-integrations/links.ts';
const {randomUUID}=crypto,key='a'.repeat(64);
async function load(relative,imports){const ts=(await import('typescript')).default,vm=(await import('node:vm')).default,mod={exports:{}};const source=await readFile(new URL(relative,import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>{if(name==='server-only')return{};assert.ok(name in imports,`Unexpected import ${name}`);return imports[name];},mod,mod.exports);return mod.exports;}
const codes=await load('../src/lib/discounts/codes.ts',{'node:crypto':crypto,'../order-integrations/links':{sealLink,openLink}});
async function fixture(){const db=new PGlite({extensions:{pg_trgm}});try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TABLE products(id uuid PRIMARY KEY,name text,image_url text);CREATE TABLE batches(id uuid PRIMARY KEY,product_id uuid,deposit_amount numeric,tier_1_price numeric DEFAULT 160,status text DEFAULT 'OPEN',closes_at timestamptz DEFAULT now()+interval '1 day');CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code text,batch_id uuid,quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());");
 for(const file of ['add_campaign_lead_system','harden_campaign_lead_system','campaign_content_editor','order_fulfilment','order_integrations','collection_management','collection_named_authorisation','manual_balance_operations','collection_fee_safety_hold','campaign_discounts','campaign_discounts'])await db.exec(await readFile(new URL(`../database/sql/${file}.sql`,import.meta.url),'utf8'));
 const campaign=randomUUID(),option=randomUUID(),product=randomUUID(),batch=randomUUID();
 await db.query("INSERT INTO campaigns(id,name,slug,status,is_test)VALUES($1,'Campaign','discount-test','active',false)",[campaign]);await db.query("INSERT INTO campaign_products(id,campaign_id,public_name,estimated_price_cents)VALUES($1,$2,'Sample',16000)",[option,campaign]);await db.query("INSERT INTO products VALUES($1,'Sample','/sample.jpg')",[product]);await db.query('INSERT INTO batches(id,product_id,deposit_amount)VALUES($1,$2,20)',[batch,product]);
 const issue=async(email='buyer@example.test',extra={})=>{const candidate=codes.prepareDiscountCode(key),p={email,campaign_slug:'discount-test',product_id:option,price_shown_cents:16000,currency:'SGD',purchase_intent:'yes',marketing_consent:false,session_id:randomUUID(),request_id:randomUUID(),attribution:{},...extra};const r=(await db.query('SELECT register_campaign_intent_discount($1,$2)r',[JSON.stringify(p),JSON.stringify(candidate)])).rows[0].r;return{r,candidate,p};};
 const enable=()=>db.query("SELECT configure_campaign_discount(true,'admin@example.test')");
 const coupon=async(email='buyer@example.test')=>(await db.query('SELECT * FROM campaign_discount_codes WHERE email_normalized=$1',[email])).rows[0];
 const get=async id=>(await db.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];
 let seq=0;
 const order=async(hash,email='buyer@example.test',quantity=2,method='collection')=>{const p={order_code:'SAMA-'+crypto.randomBytes(8).toString('hex').toUpperCase(),batch_id:batch,customer_name:'Buyer',customer_phone:'650000'+String(++seq).padStart(5,'0'),customer_email:email,quantity,address_line1:'Test address',postal_code:'123456',fulfilment_method:method};const r=(await db.query('SELECT register_batch_order_discount($1,$2)r',[JSON.stringify(p),hash])).rows[0].r;const o=(await db.query('SELECT * FROM orders WHERE order_code=$1',[p.order_code])).rows[0];return{...o,registration:r};};
 const deposit=async(id)=>{const o=await get(id);return db.query("SELECT order_operation($1,'deposit','admin',$2,$3,NULL)",[id,o.deposit_due_cents,'BANK-'+id]);};
 const quote=async(id,unit=16000,delivery=0,revision=null)=>db.query('SELECT quote_order_discount($1,$2,$3,$4,$5)',[id,revision??(await get(id)).balance_revision,unit,delivery,'admin']);
 return{db,campaign,option,batch,issue,enable,coupon,get,order,deposit,quote};
 }catch(e){await db.close();throw e;}}
test('coupon codes are high entropy, case-normalized, encrypted and bound to their own purpose and record',()=>{
 const c=codes.prepareDiscountCode(key),code=codes.revealDiscountCode(c,key);assert.match(code,/^SAMA10-[0-9A-F]{32}$/);assert.equal(codes.discountCodeHash(code.toLowerCase()),c.hash);assert.ok(!JSON.stringify(c).includes(code));assert.throws(()=>codes.revealDiscountCode({...c,id:randomUUID()},key));assert.throws(()=>codes.revealDiscountCode(c,'b'.repeat(64)));assert.throws(()=>codes.normalizeDiscountCode('SAMA10-short'));assert.notEqual(codes.prepareDiscountCode(key).hash,c.hash);
});
test('new live interest awards once, uses six calendar months, keeps retry expiry and excludes prior/test/no-interest registrations',async()=>{
 const{db,issue,enable,coupon,campaign}=await fixture();try{
 await issue('old@example.test');assert.equal(await coupon('old@example.test'),undefined);await enable();await issue('old@example.test');assert.equal(await coupon('old@example.test'),undefined);
 const first=await issue();const c=await coupon();assert.equal(c.id,first.candidate.id);assert.equal((await db.query("SELECT expires_at=((issued_at AT TIME ZONE 'Asia/Singapore')+interval '6 months')AT TIME ZONE 'Asia/Singapore' ok FROM campaign_discount_codes WHERE id=$1",[c.id])).rows[0].ok,true);
 const retry=await issue('buyer@example.test',{request_id:first.p.request_id});assert.deepEqual((await coupon()).expires_at,c.expires_at);assert.equal((await coupon()).id,c.id);assert.equal(retry.r.delivery_id,first.r.delivery_id);
 const mail=(await db.query('SELECT campaign_discount_mail($1)m',[first.r.delivery_id])).rows[0].m;assert.equal(codes.revealDiscountCode(mail,key),codes.revealDiscountCode(first.candidate,key));assert.ok(!JSON.stringify(first.r).includes(first.candidate.hash));
 await issue('no@example.test',{purchase_intent:'no'});assert.equal(await coupon('no@example.test'),undefined);await db.query('UPDATE campaigns SET is_test=true WHERE id=$1',[campaign]);await issue('test@example.test');assert.equal(await coupon('test@example.test'),undefined);
 assert.equal((await db.query("SELECT marketing_consent FROM contacts WHERE email_normalized='buyer@example.test'")).rows[0].marketing_consent,false);
 }finally{await db.close();}
});
test('S$10 per unit, 10-unit cap, product-only S$50 minimum, final quotes, deposit and handover safeguards',async()=>{
 const{db,enable,issue,coupon,order,deposit,quote,get,batch}=await fixture();try{
 await enable();await issue();const c=await coupon();const o=await order(c.code_hash);assert.equal(o.registration.discount_cents,2000);assert.equal(o.deposit_due_cents,4000);await assert.rejects(order(c.code_hash),/DISCOUNT_UNAVAILABLE/);await deposit(o.id);assert.equal((await coupon()).status,'redeemed');await quote(o.id);let saved=await get(o.id);assert.equal(saved.final_total_cents,30000);assert.equal(saved.balance_due_cents,26000);assert.equal(saved.quoted_unit_cents,16000);
 await assert.rejects(quote(o.id,4999),/DISCOUNT_MINIMUM/);await assert.rejects(quote(o.id,5000,1000),/INVALID_QUOTE/);const revision=saved.balance_revision;await quote(o.id,15000);await assert.rejects(quote(o.id,16000,0,revision),/STALE_PREVIEW/);
 await assert.rejects(db.query("SELECT admin_balance_operation($1,'set_total',$2,'admin',9999,NULL,false)",[o.id,(await get(o.id)).balance_revision]),/DISCOUNT_PRICE_MISMATCH/);
 await issue('ten@example.test');const c10=await coupon('ten@example.test');await assert.rejects(order(c10.code_hash,'ten@example.test',11),/INVALID_ORDER/);const ten=await order(c10.code_hash,'ten@example.test',10);await deposit(ten.id);await quote(ten.id,5000);assert.equal((await get(ten.id)).campaign_discount_cents,10000);assert.equal((await get(ten.id)).final_total_cents,40000);
 await issue('delivery@example.test');const delivery=await order((await coupon('delivery@example.test')).code_hash,'delivery@example.test',1,'delivery');await deposit(delivery.id);await quote(delivery.id,5000,1500);assert.equal((await get(delivery.id)).final_total_cents,5500);
 await issue('cheap@example.test');await db.query('UPDATE batches SET tier_1_price=49.99 WHERE id=$1',[batch]);await assert.rejects(order((await coupon('cheap@example.test')).code_hash,'cheap@example.test',1,'delivery'),/DISCOUNT_MINIMUM/);
 await assert.rejects(db.query("SELECT fulfil_order_named($1,'admin','Buyer',NULL,true)",[o.id]),/NOT_READY/);
 }finally{await db.close();}
});
test('email-bound expiry, first paid order, concurrent reservation, admin-only reinstatement and cancelled-order blocking',async()=>{
 const{db,enable,issue,coupon,order,deposit,get,quote}=await fixture();try{
 await enable();await issue();let c=await coupon();await assert.rejects(order(c.code_hash,'someone@example.test'),/DISCOUNT_UNAVAILABLE/);
 const attempts=await Promise.allSettled([order(c.code_hash),order(c.code_hash)]);assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);const o=attempts.find(x=>x.status==='fulfilled').value;
 await db.query("SELECT admin_campaign_discount($1,'reinstate','admin','Approved unpaid cancellation')",[c.id]);assert.ok((await get(o.id)).cancelled_at);const cancelled=await get(o.id);assert.equal(orderSummary(JSON.parse(JSON.stringify(cancelled))).fulfilment,'Cancelled');assert.equal(emailStillRelevant('order_received',{email:cancelled.customer_email},cancelled),false);await assert.rejects(deposit(o.id),/ORDER_CANCELLED/);assert.equal((await coupon()).status,'issued');assert.deepEqual((await coupon()).expires_at,c.expires_at);
 const replacement=await order(c.code_hash);await deposit(replacement.id);await quote(replacement.id);await assert.rejects(db.query("SELECT admin_campaign_discount($1,'reinstate','admin','Not refunded')",[c.id]),/DISCOUNT_REINSTATEMENT_REVIEW/);
 await db.query("UPDATE orders SET payment_status='REFUNDED'WHERE id=$1",[replacement.id]);await db.query("SELECT admin_campaign_discount($1,'reinstate','admin','Refund reconciled at discounted amount actually paid')",[c.id]);const next=await order(c.code_hash);await deposit(next.id);assert.equal((await coupon()).status,'redeemed');
 await issue('paid@example.test');const nonCoupon=await order(null,'paid@example.test',1);await deposit(nonCoupon.id);await assert.rejects(order((await coupon('paid@example.test')).code_hash,'paid@example.test'),/DISCOUNT_UNAVAILABLE/);
 await issue('expired@example.test');c=await coupon('expired@example.test');await db.query("UPDATE campaign_discount_codes SET expires_at=now()-interval '1 second'WHERE id=$1",[c.id]);await assert.rejects(order(c.code_hash,'expired@example.test'),/DISCOUNT_UNAVAILABLE/);
 for(const role of ['anon','authenticated'])for(const signature of ['register_batch_order_discount(jsonb,text)','register_campaign_intent_discount(jsonb,jsonb)','campaign_discount_mail(uuid)','admin_campaign_discount(uuid,text,text,text)','quote_order_discount(uuid,bigint,integer,integer,text)','campaign_discount_report(timestamptz,uuid)'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE')ok",[role,signature])).rows[0].ok,false);
 assert.equal((await db.query("SELECT has_table_privilege('service_role','campaign_discount_codes','SELECT')ok")).rows[0].ok,false);
 }finally{await db.close();}
});
test('admin discount actions authenticate first and quote inputs never trust a posted discount amount',async()=>{
 const before={...process.env};Object.assign(process.env,{CAMPAIGN_DISCOUNTS_INSTALLED:'true',MANUAL_BALANCE_INSTALLED:'true'});let authorised=false,calls=0,rpcError=false;const seen=[];
 try{
 const{manageDiscount,quoteDiscountOrder}=await load('../src/app/actions/discounts.ts',{
 '@/lib/adminAuth':{verifyAdminAccess:async()=>{if(!authorised)throw Error('Denied');return{email:'approved@example.test'};}},'@/lib/orders/db':{orderDb:()=>({rpc:async(name,args)=>{calls++;seen.push({name,args});return rpcError?{error:{message:'PRIVATE-DATABASE-TEXT'}}:{data:null};}})},'@/lib/orders/validation':{moneyCents:value=>{if(!/^\d+(\.\d{1,2})?$/.test(String(value)))throw Error('invalid');return Math.round(Number(value)*100);}},'next/cache':{revalidatePath:()=>{}}
 });
 const form=new FormData();form.set('id',randomUUID());form.set('action','reinstate');form.set('reason','Refund verified');form.set('confirmed','on');assert.ok((await manageDiscount({},form)).error);assert.equal(calls,0);authorised=true;form.delete('confirmed');assert.ok((await manageDiscount({},form)).error);assert.equal(calls,0);form.set('confirmed','on');assert.ok((await manageDiscount({},form)).success);assert.equal(seen[0].args.p_actor,'approved@example.test');
 const quote=new FormData();quote.set('id',randomUUID());quote.set('revision','3');quote.set('unit','160');quote.set('delivery','15');quote.set('discount','999999');assert.ok((await quoteDiscountOrder({},quote)).success);assert.equal(seen[1].name,'quote_order_discount');assert.equal(seen[1].args.p_unit,16000);assert.equal(seen[1].args.p_delivery,1500);assert.ok(!Object.hasOwn(seen[1].args,'discount'));rpcError=true;const failed=await quoteDiscountOrder({},quote);assert.ok(failed.error);assert.ok(!JSON.stringify(failed).includes('PRIVATE-DATABASE'));const count=calls;process.env.CAMPAIGN_DISCOUNTS_INSTALLED='false';assert.ok((await manageDiscount({},form)).error);assert.equal(calls,count);
 }finally{for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}
});
test('calendar boundaries, revocation, unchanged expiry, safe resends, financial mail snapshot and role restrictions',async()=>{
 const{db,enable,issue,coupon,order,deposit,quote,get}=await fixture();try{
 const dates=(await db.query("SELECT ('2026-08-31'::timestamptz+interval '6 months')::date::text a,('2027-08-31'::timestamptz+interval '6 months')::date::text b")).rows[0];assert.equal(dates.a,'2027-02-28');assert.equal(dates.b,'2028-02-29');const boundary=(await db.query("SELECT (((('2026-08-30T16:30:00Z'::timestamptz AT TIME ZONE 'Asia/Singapore')+interval '6 months')AT TIME ZONE 'Asia/Singapore')AT TIME ZONE 'Asia/Singapore')::text d")).rows[0].d;assert.equal(boundary,'2027-02-28 00:30:00');
 await enable();const award=await issue();const c=await coupon();await db.query("SELECT admin_campaign_discount($1,'revoke','admin','Incorrect award reviewed')",[c.id]);await assert.rejects(order(c.code_hash),/DISCOUNT_UNAVAILABLE/);await db.query("SELECT admin_campaign_discount($1,'reinstate','admin','Unused code approved')",[c.id]);assert.deepEqual((await coupon()).expires_at,c.expires_at);
 const o=await order(c.code_hash,'buyer@example.test',1,'delivery');await db.query("UPDATE campaign_discount_codes SET expires_at=now()-interval '1 second'WHERE id=$1",[c.id]);await deposit(o.id);await quote(o.id,5000,1500);
 const token=codes.prepareDiscountCode(key);await db.query('SELECT queue_delivery_balances($1,$2,$3,true)',[randomUUID(),'admin',JSON.stringify([{id:o.id,revision:(await get(o.id)).balance_revision,hash:token.token_hash,envelope:token.envelope}])]);
 const payload=(await db.query("SELECT payload FROM order_integration_jobs WHERE order_id=$1 AND event='balance_requested'AND kind='email'",[o.id])).rows[0].payload;assert.equal(payload.discount_cents,1000);assert.equal(payload.product_subtotal_cents,5000);assert.equal(payload.delivery_cents,1500);assert.equal(payload.total_cents,5500);
 const report=(await db.query('SELECT campaign_discount_report()r')).rows[0].r;assert.ok(!JSON.stringify(report).includes(c.code_hash));assert.ok(!JSON.stringify(report).includes(c.envelope));assert.equal(report.codes[0].paid_cents,2000);
 const mail=(await db.query('SELECT campaign_discount_mail($1)m',[award.r.delivery_id])).rows[0].m;assert.equal(mail.status,'redeemed');
 for(const role of ['anon','authenticated','service_role'])for(const table of ['campaign_discount_codes','campaign_discount_controls','campaign_discount_events'])assert.equal((await db.query("SELECT has_table_privilege($1,$2,'UPDATE')ok",[role,table])).rows[0].ok,false);
 const funcs=(await db.query("SELECT proowner::regrole::text owner,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('register_batch_order','register_campaign_intent_discount','register_batch_order_discount','guard_campaign_discount_order','quote_order_discount','admin_campaign_discount','campaign_discount_report')")).rows;for(const f of funcs){assert.equal(f.owner,'postgres');assert.ok(f.proconfig.includes('search_path=pg_catalog, pg_temp'));}
 }finally{await db.close();}
});
test('the existing confirmation email includes the private code and terms; public registration results never reveal it',async()=>{
 const before={...process.env};Object.assign(process.env,{CAMPAIGN_EMAIL_PROVIDER:'zoho',ZOHO_MAIL_CLIENT_ID:'test',ZOHO_MAIL_CLIENT_SECRET:'test',ZOHO_MAIL_REFRESH_TOKEN:'test',ZOHO_MAIL_ACCOUNT_ID:'test',ORDER_EMAIL_LINK_KEY:key});
 try{
 const candidate=codes.prepareDiscountCode(key),plain=codes.revealDiscountCode(candidate,key),id=randomUUID();let message;
 const job={id,contact_id:randomUUID(),template_key:'intent_confirmation',recipient_email:'owner@example.test',status:'queued',metadata:{campaign_coupon_id:candidate.id,product_name:'Dryer',price_shown_cents:16000,currency:'SGD',purchase_intent:'yes'}};
 const db={rpc:async()=>({data:{...candidate,status:'issued',expires_at:'2099-01-01T00:00:00Z'}}),from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:job}),insert:async()=>({})};return q;}};
 const{deliverConfirmation}=await load('../src/lib/campaigns/email.ts',{
 '@/lib/discounts/codes':{revealDiscountCode:codes.revealDiscountCode},'@/lib/orders/db':{orderDb:()=>db},'@/lib/supabaseAdmin':{supabaseAdmin:db},'./messages':await load('../src/lib/campaigns/messages.ts',{}),'./utils':{formatMoney:n=>'S$'+(n/100).toFixed(2)},'./security':{unsubscribeToken:()=> 'SAFE-TEST'},'./types':{purchaseIntentLabels:{yes:'Yes'}},'@/lib/mail/config':{mailSendingConfig:()=>({})},'@/lib/mail/zoho-transport':{prepareZohoMail:()=>{throw Error('No provider allowed');}},'@/lib/mail/delivery':{deliverOnce:async options=>{message=options.buildMessage();return'sent';}}
 });
 assert.equal(await deliverConfirmation(id),'sent');assert.ok(message.text.includes(plain));assert.match(message.text,/S\$10 off each eligible unit/);assert.match(message.text,/at least S\$50/);assert.match(message.text,/deposit stays unchanged/);
 const{submitCampaignIntent}=await load('../src/app/actions/campaigns.ts',{
 '@/lib/orders/db':{orderDb:()=>({rpc:async()=>({data:{lead_id:randomUUID(),product_name:'Dryer',already_registered:false,delivery_id:null,is_test:true}})})},'@/lib/discounts/codes':{prepareDiscountCode:()=>candidate},'@/lib/campaigns/ownership':{prepareOwnerRequest:()=>{throw Error('Not enabled');}},'next/server':{after:()=>{}},'@/lib/campaigns/zoho-sync':{syncCampaignContact:()=>{}},'next/cache':{revalidatePath:()=>{}},'@/lib/supabaseAdmin':{supabaseAdmin:{}},'@/lib/campaigns/email':{deliverConfirmation:()=>{throw Error('Not sent for test');}},'@/lib/campaigns/security':{campaignSession:async()=>randomUUID(),limitRequest:async()=>{}},'@/lib/campaigns/validation':{parseIntent:()=>({email:'owner@example.test',purchase_intent:'yes'})}
 });
 process.env.CAMPAIGN_DISCOUNTS_INSTALLED='true';const result=await submitCampaignIntent({});assert.equal(result.success,true);assert.ok(!JSON.stringify(result).includes(plain));assert.ok(!JSON.stringify(result).includes(candidate.hash));assert.ok(!JSON.stringify(result).includes(candidate.envelope));
 }finally{for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}
});
