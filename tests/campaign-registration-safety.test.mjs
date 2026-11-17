import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import ts from 'typescript';
import vm from 'node:vm';
import {sealLink,openLink} from '../src/lib/order-integrations/links.ts';
import {handleWorker} from '../src/lib/order-integrations/endpoint.ts';
async function load(file,imports){const m={exports:{}};const source=await readFile(new URL(file,import.meta.url),'utf8');vm.runInThisContext('(function(require,module,exports){'+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'\n})')(name=>{if(name==='server-only')return {};assert.ok(name in imports,`Unexpected import: ${name}`);return imports[name];},m,m.exports);return m.exports;}
const sql=await readFile(new URL('../database/sql/campaign_registration_safety.sql',import.meta.url),'utf8');
const key='a'.repeat(64);
const codes=await load('../src/lib/discounts/codes.ts',{'node:crypto':{randomUUID,randomBytes,createHash},'../order-integrations/links':{sealLink,openLink}});
const messages=await load('../src/lib/campaigns/messages.ts',{});
async function fixture(){
 const db=new PGlite({extensions:{pg_trgm}});
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,description text,retail_price numeric,image_url text,features jsonb);
  CREATE TABLE batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid REFERENCES products(id),status text DEFAULT 'OPEN',target_capacity integer NOT NULL,deposit_amount numeric,tier_1_price numeric,tier_2_price numeric,tier_3_price numeric,closes_at timestamptz DEFAULT now()+interval '1 day',created_at timestamptz DEFAULT now());
  CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code text,batch_id uuid REFERENCES batches(id),quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());`);
  for(const f of ['add_campaign_lead_system','harden_campaign_lead_system','campaign_content_editor','campaign_zoho_sync','order_fulfilment','order_integrations','collection_management','collection_named_authorisation','manual_balance_operations','collection_fee_safety_hold','campaign_discounts'])await db.exec(await readFile(new URL(`../database/sql/${f}.sql`,import.meta.url),'utf8'));
  await db.exec(sql);await db.exec(sql);
  const campaign=(await db.query("INSERT INTO campaigns(name,slug,status,is_test)VALUES('Sample','sample','active',false)RETURNING id")).rows[0].id;
  const products=(await db.query("INSERT INTO campaign_products(campaign_id,public_name,estimated_price_cents)VALUES($1,'Dryer',11900),($1,'Second dryer',10900)RETURNING id",[campaign])).rows;
  await db.query("SELECT configure_campaign_discount(true,'admin@example.test')");
  const p=(changes={})=>({email:'buyer@example.test',phone:'+6580000000',telegram_handle:'@buyer',campaign_slug:'sample',product_id:products[0].id,request_id:randomUUID(),price_shown_cents:11900,currency:'SGD',purchase_intent:'yes',marketing_consent:true,session_id:randomUUID(),attribution:{},...changes});
  const submit=async(changes={})=>{const input=p(changes),coupon=codes.prepareDiscountCode(key);const result=(await db.query('SELECT register_campaign_intent_v2($1,$2)r',[input,coupon])).rows[0].r;return{input,result};};
  const contact=async()=>(await db.query("SELECT * FROM contacts WHERE email_normalized='buyer@example.test'")).rows[0];
  return{db,campaign,products,p,submit,contact};
 }catch(e){await db.close();throw e;}
}
test('missing runtime can be installed with current campaign/discount/collection schema, then campaign safety restored',async()=>{
 const{db,submit,contact}=await fixture();try{
  const runtime=await readFile(new URL('../database/sql/order_operations_runtime.sql',import.meta.url),'utf8');
  assert.equal((await db.query("SELECT to_regclass('public.order_runtime_limits')v")).rows[0].v,null);
  await db.exec(runtime);await db.exec(sql);
  // Reapplication is safe and campaign definitions remain last in the sequence.
  await db.exec(runtime);await db.exec(sql);
  const pre=await db.exec(await readFile(new URL('../database/sql/campaign_registration_preflight.sql',import.meta.url),'utf8'));
  const functions=pre.flatMap(r=>r.rows).filter(r=>r.signature);assert.equal(functions.length,8);
  for(const f of functions){assert.equal(f.installed,true);assert.equal(f.owner,'postgres');assert.equal(f.anon_can_execute,false);assert.equal(f.authenticated_can_execute,false);assert.equal(f.service_can_execute,true);}
  const budgets=(await db.query('SELECT kind,enabled FROM order_runtime_limits ORDER BY kind')).rows;
  assert.deepEqual(budgets,[{kind:'crm',enabled:false},{kind:'email',enabled:false}]);
  assert.equal((await db.query("SELECT * FROM claim_order_jobs_v2('email',10)")).rows.length,0);
  const result=await submit({marketing_consent:false});assert.ok(result.result.delivery_id);assert.equal((await contact()).marketing_consent,false);
  assert.ok((await db.query('SELECT metadata FROM email_deliveries WHERE id=$1',[result.result.delivery_id])).rows[0].metadata.campaign_coupon_id);
 }finally{await db.close();}
});
test('release SQL checks are read-only and old owner schemas stop the migration',async()=>{
 const{db}=await fixture();try{
  const before=(await db.query('SELECT count(*)::int n FROM email_deliveries')).rows[0].n;
  const pre=await db.exec(await readFile(new URL('../database/sql/campaign_registration_preflight.sql',import.meta.url),'utf8'));
  assert.ok(pre.flatMap(r=>r.rows).some(r=>r.no_superseded_owner_flow===true));
  assert.ok(pre.flatMap(r=>r.rows).some(r=>r.signature?.includes('begin_campaign_mail_send')&&r.installed===false));
  const post=await db.exec(await readFile(new URL('../database/sql/campaign_registration_postcheck.sql',import.meta.url),'utf8'));
  const checks=post.flatMap(r=>r.rows).filter(r=>r.signature);assert.equal(checks.length,8);
  for(const r of checks){assert.equal(r.installed,true);assert.equal(r.owner,'postgres');assert.equal(r.security_definer,true);assert.equal(r.anon_can_execute,false);assert.equal(r.authenticated_can_execute,false);assert.equal(r.service_can_execute,true);}
  assert.equal((await db.query('SELECT count(*)::int n FROM email_deliveries')).rows[0].n,before);
  await db.exec('CREATE TABLE campaign_owner_requests(id uuid PRIMARY KEY)');
  await assert.rejects(db.exec(sql),/OLD_CAMPAIGN_OWNER_FLOW_REQUIRES_COMPATIBILITY_REVIEW/);await db.exec('ROLLBACK');
 }finally{await db.close();}
});
test('single-step registration saves optional contact/consent and queues the original coupon with no verification records',async()=>{
 const{db,submit,contact}=await fixture();try{
  const first=await submit();const ct=await contact();assert.equal(ct.phone,'+6580000000');assert.equal(ct.telegram_handle,'@buyer');assert.equal(ct.marketing_consent,true);assert.match(ct.consent_source,/single-opt-in/);
  assert.ok(first.result.delivery_id);assert.equal(first.result.verification_pending,undefined);
  const coupon=(await db.query('SELECT id,code_hash,expires_at FROM campaign_discount_codes')).rows[0];assert.ok(coupon.id);
  const replay=(await db.query('SELECT register_campaign_intent_v2($1,NULL)r',[first.input])).rows[0].r;assert.deepEqual(replay,first.result);
  assert.deepEqual((await db.query('SELECT id,code_hash,expires_at FROM campaign_discount_codes')).rows[0],coupon);
  assert.equal((await db.query("SELECT to_regclass('public.campaign_owner_requests')x")).rows[0].x,null);
  assert.equal((await db.query('SELECT count(*)::int n FROM email_deliveries')).rows[0].n,1);
 }finally{await db.close();}
});
test('public repeats preserve contacts, saved picks and unsubscribe; no-consent registration stays unsubscribed',async()=>{
 const{db,submit,contact,products,p}=await fixture();try{
  await submit({marketing_consent:false});assert.equal((await contact()).marketing_consent,false);
  await db.query('SELECT unsubscribe_campaign_contact($1)',[(await contact()).id]);const before=await contact();
  const repeat=await submit({phone:'ATTACK',product_id:products[1].id,price_shown_cents:10900});assert.equal(repeat.result.cooldown,true);assert.equal(repeat.result.delivery_id,null);
  assert.deepEqual(await contact(),before);
  await db.query("UPDATE email_deliveries SET created_at=now()-interval '11 minutes'");const retry=await submit();assert.ok(retry.result.delivery_id);
  await db.query('SELECT register_campaign_intent($1)',[p({phone:'ATTACK',marketing_consent:true})]);assert.deepEqual(await contact(),before);
  await db.query("UPDATE campaign_leads SET funnel_status='reserved'");await submit({product_id:products[1].id,price_shown_cents:10900});
  const lead=(await db.query('SELECT * FROM campaign_leads')).rows[0];assert.equal(lead.selected_campaign_product_id,products[0].id);assert.equal(lead.funnel_status,'reserved');
  assert.equal((await db.query('SELECT count(*)::int n FROM campaign_discount_codes')).rows[0].n,1);
 }finally{await db.close();}
});
test('retry candidates are bounded, lease-safe and exclude sent/unknown sends; retries preserve the coupon and status snapshots',async()=>{
 const{db,submit}=await fixture();try{
  const first=await submit();
  await db.query("INSERT INTO email_deliveries(template_key,recipient_email,status,provider,attempted_at,metadata)VALUES('intent_confirmation','unknown@example.test','failed','zoho',now(),'{\"_mail_outcome\":\"unknown\"}'),('intent_confirmation','sent@example.test','sent','zoho',now(),'{\"_mail_outcome\":\"accepted\"}'),('intent_confirmation','safe@example.test','failed','zoho',now(),'{\"_mail_outcome\":\"not_sent\",\"registration_v2\":true}')");
  const result=await Promise.all([db.query('SELECT claim_campaign_confirmations(1)r'),db.query('SELECT claim_campaign_confirmations(1)r')]);const claimed=result.flatMap(r=>r.rows[0].r);assert.equal(claimed.length,2);assert.notEqual(claimed[0].id,claimed[1].id);assert.equal((await db.query('SELECT claim_campaign_confirmations(5)r')).rows[0].r.length,0);
  await assert.rejects(db.query('SELECT claim_campaign_confirmations(6)'),/INVALID_LIMIT/);
  const metadata=(await db.query('SELECT metadata FROM email_deliveries WHERE id=$1',[first.result.delivery_id])).rows[0].metadata;assert.ok(metadata.campaign_coupon_id);assert.equal(metadata.owner_request_id,undefined);
  await db.query('SELECT finish_campaign_confirmation_claim($1,$2)',[claimed[0].id,randomUUID()]);assert.ok((await db.query('SELECT retry_claim FROM email_deliveries WHERE id=$1',[claimed[0].id])).rows[0].retry_claim);
  for(const c of claimed)await db.query('SELECT finish_campaign_confirmation_claim($1,$2)',[c.id,c.claim]);
  assert.deepEqual((await db.query('SELECT metadata FROM email_deliveries WHERE id=$1',[first.result.delivery_id])).rows[0].metadata,metadata);
  await db.query("UPDATE email_deliveries SET retry_due_at=now()-interval '1 minute',attempted_at=now()-interval '24 hours',status='failed',metadata=metadata||'{\"_mail_outcome\":\"not_sent\",\"registration_v2\":true}'WHERE id=$1",[first.result.delivery_id]);
  const old=(await db.query('SELECT claim_campaign_confirmations(1)r')).rows[0].r[0];await db.query('SELECT finish_campaign_confirmation_claim($1,$2)',[old.id,old.claim]);assert.equal((await db.query('SELECT retry_due_at::text AS due FROM email_deliveries WHERE id=$1',[old.id])).rows[0].due,'infinity');
 }finally{await db.close();}
});
test('all registration RPCs are service-only, safe-owner functions; reports and cleanup do not expose private tokens',async()=>{
 const{db,submit}=await fixture();try{
  await submit();const names=['register_campaign_intent_v2(jsonb,jsonb)','claim_campaign_confirmations(integer)','cleanup_campaign_registration(integer)','campaign_confirmation_report()'];
  for(const role of ['anon','authenticated']){for(const fn of names)assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE')ok",[role,fn])).rows[0].ok,false);}
  const fns=(await db.query("SELECT pg_get_userbyid(proowner)owner,proconfig,prosecdef FROM pg_proc WHERE proname IN('register_campaign_intent_v2','register_campaign_intent','claim_campaign_confirmations')")).rows;for(const f of fns){assert.equal(f.owner,'postgres');assert.equal(f.prosecdef,true);assert.ok(f.proconfig.includes('search_path=pg_catalog, pg_temp'));}
  const report=JSON.stringify((await db.query('SELECT campaign_confirmation_report()r')).rows[0].r);for(const word of ['buyer@example','envelope','token_hash','+658','campaign_coupon_id'])assert.ok(!report.includes(word));
  // Rate checks no longer delete expired rows on customer requests.
  const k='f'.repeat(64);await db.query("INSERT INTO campaign_rate_limits VALUES($1,1,now()-interval '2 days')",[k]);assert.equal((await db.query('SELECT campaign_rate_limit($1,1,60)ok',['a'.repeat(64)])).rows[0].ok,true);assert.equal((await db.query('SELECT campaign_rate_limit($1,1,60)ok',['a'.repeat(64)])).rows[0].ok,false);assert.equal((await db.query('SELECT count(*)::int n FROM campaign_rate_limits WHERE key=$1',[k])).rows[0].n,1);await db.query('SELECT cleanup_campaign_registration(100)');assert.equal((await db.query('SELECT count(*)::int n FROM campaign_rate_limits WHERE key=$1',[k])).rows[0].n,0);
 }finally{await db.close();}
});

test('confirmation worker is opt-in, bounded, reuses provider preparation and never sends after RPC failure',async()=>{
 const previous={...process.env};
 try{
  Object.assign(process.env,{CAMPAIGN_CONFIRMATION_RETRIES_ENABLED:'false',ORDER_RUNTIME_V2:'true',CAMPAIGN_EMAIL_PROVIDER:'zoho'});
  let failed=false,claims=0,prepares=0,sends=0,finishes=0;const rpcNames=[];
  const worker=await load('../src/lib/campaigns/confirmation-worker.ts',{
   '@/lib/orders/db':{orderDb:()=>({rpc:async(name,args)=>{rpcNames.push(name);if(name==='claim_campaign_confirmations'){claims++;assert.equal(args.p_limit,5);return failed?{error:{message:'PRIVATE'}}:{data:[{id:randomUUID(),claim:randomUUID()},{id:randomUUID(),claim:randomUUID()}]};}if(name==='finish_campaign_confirmation_claim')finishes++;return {data:{}};}})},
   '@/lib/mail/config':{mailSendingConfig:()=>({})},'@/lib/mail/zoho-transport':{prepareZohoMail:async()=>{prepares++;return async()=>{};}},
   './email':{deliverConfirmation:async(_id,prepare)=>{await prepare();sends++;return 'sent';}}
  });
  assert.equal((await worker.processCampaignConfirmations()).enabled,false);assert.equal(claims,0);
  process.env.CAMPAIGN_CONFIRMATION_RETRIES_ENABLED='true';const result=await worker.processCampaignConfirmations();assert.equal(result.sent,2);assert.equal(prepares,1);assert.equal(finishes,2);assert.ok(rpcNames.includes('record_campaign_confirmation_run'));assert.ok(rpcNames.includes('cleanup_campaign_registration'));
  failed=true;await assert.rejects(worker.processCampaignConfirmations(),/CAMPAIGN_QUEUE_UNAVAILABLE/);assert.equal(sends,2);
  process.env.ORDER_RUNTIME_V2='false';await assert.rejects(worker.processCampaignConfirmations(),/SETUP_REQUIRED/);assert.equal(claims,2);
 }finally{for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);}
});

test('approved email copy includes code, dynamic price/expiry and escaped links without reconfirmation',async()=>{
 const message=messages.campaignAcknowledgement({name:'Dryer <test>',price:'S$119.00',coupon:{code:'SAMA10-ORIGINAL',expiresAt:'2027-05-17T10:00:00Z'},origin:'https://www.samasama.sg',unsubscribeUrl:'https://www.samasama.sg/unsubscribe?token=TEST'});
 assert.equal(message.subject,'Your pick is in—here’s your S$10 thank-you');assert.match(message.text,/SAMA10-ORIGINAL/);assert.match(message.text,/2027/);assert.match(message.text,/S\$50/);assert.match(message.text,/up to 10 units/);assert.match(message.text,/deposit stays unchanged/);assert.match(message.text,/haven’t placed an order/);
 assert.match(message.text,/each eligible unit in your first order/);assert.ok(!message.text.includes('each unit in this campaign'));assert.match(message.text,/any eligible SamaSama product/);
 assert.ok(message.html.includes('Dryer &lt;test&gt;'));assert.ok(!message.html.includes('Dryer <test>'));assert.ok(message.html.includes('display:none'));assert.ok(message.html.includes('/how-it-works'));assert.ok(message.html.includes('/campaign-offer-terms'));
 for(const text of ['campaign/confirm','Review your registration','24 hours','[First name]','16 May 2027'])assert.ok(!message.text.includes(text));
 const withoutImages=message.html.replace(/<img[^>]*>/g,'').replace(/<wbr>/g,'');assert.ok(withoutImages.includes('SAMA10-ORIGINAL'));assert.ok(withoutImages.includes('2027'));assert.ok(withoutImages.includes('/campaign-offer-terms'));assert.ok(!message.html.includes('token=TEST&amp;'));assert.match(message.html,/role="presentation"/);
 const noCoupon=messages.campaignAcknowledgement({name:'Second dryer',price:'S$109.00',origin:'https://www.samasama.sg',unsubscribeUrl:'https://www.samasama.sg/unsubscribe?token=TEST'});assert.ok(!noCoupon.subject.includes('S$10'));assert.ok(!noCoupon.text.includes('personal first-order code'));
});

test('scheduled route retains authentication and always runs order work before the opt-in campaign consumer',async()=>{
 const previous={...process.env};
 try{
  Object.assign(process.env,{ORDER_WORKER_SECRET:key,CAMPAIGN_CONFIRMATION_RETRIES_ENABLED:'true'});const calls=[];
  const route=await load('../src/app/api/internal/order-integrations/route.ts',{
   '@/lib/operations/telemetry':{observeWorkerRequest:fn=>fn()},'@/lib/orders/db':{orderDb:()=>({rpc:async()=>({data:true})})},'@/lib/order-integrations/endpoint':{handleWorker},'@/lib/order-integrations/worker':{processOrderJobs:async kind=>{calls.push(kind);return {processed:0};}},'@/lib/campaigns/confirmation-worker':{processCampaignConfirmations:async()=>{calls.push('campaign');return {processed:0};}}
  });
  for(const auth of [undefined,'Bearer wrong'])assert.equal((await route.POST(new Request('https://example.test/api/internal/order-integrations?kind=email',{method:'POST',headers:auth?{Authorization:auth}:{}}))).status,401);
  assert.deepEqual(calls,[]);
  const request=kind=>new Request(`https://example.test/api/internal/order-integrations?kind=${kind}`,{method:'POST',headers:{Authorization:`Bearer ${key}`}});
  assert.equal((await route.POST(request('email'))).status,200);assert.deepEqual(calls,['email','campaign']);
  calls.length=0;await route.POST(request('crm'));assert.deepEqual(calls,['crm']);
  calls.length=0;process.env.CAMPAIGN_CONFIRMATION_RETRIES_ENABLED='false';await route.POST(request('email'));assert.deepEqual(calls,['email']);
 }finally{for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);}
});

test('public V2 registration does not return existing-contact flags or private code material',async()=>{
 const previous={...process.env};
 try{
  Object.assign(process.env,{CAMPAIGN_REGISTRATION_V2:'true',ORDER_RUNTIME_V2:'true',CAMPAIGN_EMAIL_PROVIDER:'zoho',CAMPAIGN_DISCOUNTS_INSTALLED:'false',ORDER_EMAIL_LINK_KEY:key});let sent;
  const api=await load('../src/app/actions/campaigns.ts',{
   '@/lib/orders/db':{orderDb:()=>({rpc:async(name,args)=>{assert.equal(name,'register_campaign_intent_v2');sent=args;return {data:{lead_id:randomUUID(),product_name:'Dryer',already_registered:true,delivery_id:null,is_test:false}};}})},
   '@/lib/discounts/codes':{prepareDiscountCode:()=>{throw Error('Not enabled');}},'next/server':{after:()=>{}},'@/lib/campaigns/zoho-sync':{syncCampaignContact:async()=>{}},'next/cache':{revalidatePath:()=>{}},'@/lib/supabaseAdmin':{supabaseAdmin:{}},'@/lib/campaigns/email':{deliverConfirmation:async()=>{throw Error('No job');}},'@/lib/campaigns/security':{campaignSession:async()=>randomUUID(),limitRequest:async()=>{}},'@/lib/campaigns/validation':{parseIntent:()=>({email:'owner@example.test',purchase_intent:'yes'})}
  });
  const result=await api.submitCampaignIntent({});assert.equal(result.success,true);assert.equal(result.alreadyRegistered,false);assert.equal(result.verificationPending,undefined);assert.equal(sent.p_verification,undefined);assert.equal(result.emailStatus,'queued');assert.equal(Object.keys(sent).sort().join(','),'p,p_coupon');
 }finally{for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);}
});

test('promotional email consent is enforced in SQL, versioned, and never reverses opt-outs or revokes issued coupons',async()=>{
 const{db,submit,contact,p}=await fixture();try{
  const migration=await readFile(new URL('../database/sql/campaign_marketing_offer.sql',import.meta.url),'utf8');
  const wording=await load('../src/lib/campaigns/consent.ts',{});
  assert.ok(migration.includes(wording.campaignConsentVersion));assert.ok(migration.includes(wording.campaignConsentText));
  await db.exec(migration);await db.exec(migration);
  for(const changes of [{marketing_consent:false},{marketing_consent:true},{marketing_consent:true,marketing_consent_version:'old'}]){
   await assert.rejects(submit(changes),/MARKETING_CONSENT_REQUIRED/);
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM contacts')).rows[0].n,0);
  // Base RPC cannot bypass the promotion gate either.
  await assert.rejects(db.query('SELECT register_campaign_intent($1)',[p({marketing_consent:false})]),/MARKETING_CONSENT_REQUIRED/);
  const consent={marketing_consent:true,marketing_consent_version:'campaign-email-offer-2026-11-17'};
  const first=await submit(consent);const ct=await contact();
  const coupon=(await db.query('SELECT id,expires_at,status FROM campaign_discount_codes')).rows[0];assert.ok(coupon.id);
  const evidence=(await db.query("SELECT metadata,created_at FROM funnel_events WHERE event_type='intent_submitted'")).rows[0];
  assert.equal(evidence.metadata.consent_version,consent.marketing_consent_version);assert.equal(evidence.metadata.consent_scope,'email-marketing');
  assert.match(evidence.metadata.consent_text,/subscription is required/);assert.ok(evidence.created_at);assert.match(ct.consent_source,/campaign-email-offer-2026-11-17/);
  await db.query('SELECT unsubscribe_campaign_contact($1)',[ct.id]);const optedOut=await contact();
  const repeat=await submit(consent);assert.equal(repeat.result.cooldown,true);assert.deepEqual(await contact(),optedOut);
  assert.deepEqual((await db.query('SELECT id,expires_at,status FROM campaign_discount_codes')).rows[0],coupon);
  // Previously unsubscribed address without a code must not receive a new award.
  await db.query("INSERT INTO contacts(email,email_normalized,marketing_consent,unsubscribed_at)VALUES('old@example.test','old@example.test',false,now())");
  await submit({...consent,email:'old@example.test'});
  assert.equal((await db.query("SELECT count(*)::int n FROM campaign_discount_codes WHERE email_normalized='old@example.test'")).rows[0].n,0);
  const old=(await db.query("SELECT marketing_consent,unsubscribed_at FROM contacts WHERE email_normalized='old@example.test'")).rows[0];assert.equal(old.marketing_consent,false);assert.ok(old.unsubscribed_at);
  // Non-promotional registration remains available when offer issuance is disabled.
  await db.query("SELECT configure_campaign_discount(false,'admin@example.test')");await submit({email:'plain@example.test',marketing_consent:false});
  assert.equal((await db.query("SELECT count(*)::int n FROM campaign_discount_codes WHERE email_normalized='plain@example.test'")).rows[0].n,0);
  const acl=(await db.query("SELECT has_function_privilege('anon','register_campaign_intent(jsonb)','EXECUTE') a,has_function_privilege('authenticated','register_campaign_intent_discount(jsonb,jsonb)','EXECUTE') b,has_function_privilege('service_role','register_campaign_intent_discount(jsonb,jsonb)','EXECUTE') s")).rows[0];assert.deepEqual(acl,{a:false,b:false,s:true});
  const replay=(await db.query('SELECT register_campaign_intent_v2($1,NULL)r',[first.input])).rows[0].r;assert.deepEqual(replay,first.result);
 }finally{await db.close();}
});
