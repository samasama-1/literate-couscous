import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {sealLink,openLink} from '../src/lib/order-integrations/links.ts';
import {emailStillRelevant,publicOrigin} from '../src/lib/order-integrations/policy.ts';
import {handleWorker} from '../src/lib/order-integrations/endpoint.ts';
import {crmRecord,prepareCrm,orderSummary,orderFieldTypes,validateOrderFields} from '../src/lib/order-integrations/crm.ts';
const secret='a'.repeat(64);
const fieldMetadata={fields:Object.entries(orderFieldTypes).map(([api_name,types])=>({api_name,data_type:types[0],operation_type:{api_create:true,api_update:true},field_read_only:false,read_only:false}))};
test('worker rejects missing/wrong credentials and malformed kinds without dispatch or leaking errors',async()=>{
 let calls=0;const run=async()=>{calls++;throw Error('PRIVATE TOKEN');};
 for(const auth of [null,'Bearer wrong'])assert.equal((await handleWorker(new Request('https://example.com/?kind=email',{headers:auth?{authorization:auth}:{}}),secret,run)).status,401);
 assert.equal(calls,0);
 const headers={authorization:`Bearer ${secret}`};
 assert.equal((await handleWorker(new Request('https://example.com/?kind=bad',{headers}),secret,run)).status,400);
 const res=await handleWorker(new Request('https://example.com/?kind=email',{headers}),secret,run);assert.equal(res.status,503);assert.ok(!(await res.text()).includes('PRIVATE'));assert.equal(calls,1);
});
test('encrypted payment tokens are bound to order/key/hash and mail eligibility rejects stale states',()=>{
 const token='b'.repeat(64),id=randomUUID(),hash=createHash('sha256').update(token).digest('hex');const envelope=sealLink(token,id,secret);
 assert.ok(!envelope.includes(token));assert.equal(openLink(envelope,id,hash,secret),token);
 for(const args of [[envelope,randomUUID(),hash,secret],[envelope,id,'c'.repeat(64),secret],[envelope,id,hash,'d'.repeat(64)],['bad',id,hash,secret]])assert.throws(()=>openLink(...args));
 const o={customer_email:'test@example.com',payment_status:'VERIFIED',deposit_verified_at:'2026-01-01',balance_token_hash:hash,balance_token_expires_at:'2099-01-01',balance_paid_at:null,ready_at:null,fulfilled_at:null,final_total_cents:10000,deposit_due_cents:5000,balance_due_cents:5000};
 const p={email:o.customer_email,balance_hash:hash};assert.equal(emailStillRelevant('balance_requested',p,o),true);
 for(const change of [{payment_status:'REFUNDED'},{customer_email:'other@example.com'},{balance_paid_at:'2026-01-01'},{balance_token_hash:'other'},{balance_token_expires_at:'2000-01-01'},{fulfilled_at:'2026-01-01'}])assert.equal(emailStillRelevant('balance_requested',p,{...o,...change}),false);
 assert.equal(emailStillRelevant('order_received',p,o),false);assert.equal(emailStillRelevant('ready',p,{...o,ready_at:'2026-01-01'}),false);
 assert.equal(emailStillRelevant('ready',p,{...o,ready_at:'2026-01-01',balance_paid_at:'2026-01-01'}),true);
 assert.throws(()=>publicOrigin('https://user:pass@example.com'));assert.throws(()=>publicOrigin('http://example.com'));
});
test('CRM mapping excludes bank references, addresses and tokens; upserts by unique order and suppresses workflows',async()=>{
 const record=crmRecord({order_code:'SAMA-0123456789ABCDEF',customer_name:'Test',customer_email:'test@example.com',address_line1:'PRIVATE',payment_reference:'PRIVATE',balance_token_hash:'PRIVATE'});assert.ok(!JSON.stringify(record).includes('PRIVATE'));assert.equal(record.Email,'test@example.com');assert.equal(record.Name,'SAMA-0123456789ABCDEF');const second=crmRecord({order_code:'SAMA-1123456789ABCDEF',customer_email:'test@example.com'});assert.equal(second.Email,record.Email);assert.notEqual(second.Name,record.Name);assert.deepEqual(Object.keys(record).sort(),Object.keys(orderFieldTypes).sort());
 const c={clientId:'id',clientSecret:'secret',refreshToken:'refresh',accountsUrl:'https://accounts.zoho.com',apiUrl:'https://www.zohoapis.com',module:'SamaSama_Orders'};
 let calls=0;const request=async(url,init)=>{calls++;assert.equal(init.redirect,'error');if(url.includes('/token'))return Response.json({access_token:'access'});if(url.includes('/settings/fields'))return Response.json(fieldMetadata);const body=JSON.parse(init.body);assert.deepEqual(body.trigger,[]);assert.deepEqual(body.duplicate_check_fields,['Name']);assert.deepEqual(body.skip_feature_execution,[{name:'cadences',action:'insert'},{name:'cadences',action:'update'}]);return Response.json({data:[{status:'success',details:{id:'123456'}}]});};
 const send=await prepareCrm(c,request);assert.equal(await send(record),'123456');
 await assert.rejects(prepareCrm({...c,apiUrl:'https://evil.example.com'},request));assert.equal(calls,3);
 const fail=await prepareCrm(c,async url=>url.includes('/token')?Response.json({access_token:'access'}):url.includes('/settings/fields')?Response.json(fieldMetadata):Response.json({data:[{status:'error',message:'PRIVATE'}]}));await assert.rejects(fail(record),/CRM_WRITE_UNCONFIRMED/);
});
test('reduced CRM schema rejects missing/read-only/wrong-type fields and per-customer uniqueness before any order write',async()=>{
 validateOrderFields(fieldMetadata);
 for(const change of [f=>f.filter(x=>x.api_name!=='Email'),f=>f.map(x=>x.api_name==='Email'?{...x,read_only:true}:x),f=>f.map(x=>x.api_name==='Quantity'?{...x,data_type:'text'}:x),f=>f.map(x=>x.api_name==='Email'?{...x,unique:{casesensitive:false}}:x),f=>f.map(x=>x.api_name==='Name'?{...x,operation_type:{api_create:false,api_update:true}}:x)])assert.throws(()=>validateOrderFields({fields:change(fieldMetadata.fields)}),/CRM_FIELD_CONFIGURATION/);
 let writes=0;
 const c={clientId:'id',clientSecret:'secret',refreshToken:'refresh',accountsUrl:'https://accounts.zoho.com',apiUrl:'https://www.zohoapis.com',module:'SamaSama_Orders'};
 await assert.rejects(prepareCrm(c,async(url,init)=>{if(url.includes('/token'))return Response.json({access_token:'access'});if(url.includes('/settings/fields'))return Response.json({fields:[]});if(init.method==='POST')writes++;throw Error('should not write');}),/CRM_FIELD_CONFIGURATION/);assert.equal(writes,0);
});
test('payment and fulfilment summaries retain website history without omitted CRM fields or changing dates on sync',()=>{
 const registered='2026-10-20T01:00:00Z',deposit='2026-10-20T02:00:00Z',ready='2026-10-20T03:00:00Z',fulfilled='2026-10-20T04:00:00Z';
 const base={order_code:'SAMA-0123456789ABCDEF',payment_status:'PENDING_PAYNOW',created_at:registered,fulfilment_method:'collection'};
 assert.deepEqual(orderSummary(base),{payment:'Awaiting deposit',fulfilment:'Pending',changed:'2026-10-20T01:00:00+00:00'});
 const paid={...base,payment_status:'VERIFIED',deposit_verified_at:deposit,deposit_due_cents:5000};
 assert.equal(orderSummary(paid).payment,'Deposit verified');assert.equal(orderSummary(paid).fulfilment,'Preparing');
 const due={...paid,final_total_cents:10000,balance_due_cents:5000,balance_requested_at:ready};
 assert.equal(orderSummary(due).payment,'Awaiting balance');assert.equal(orderSummary(due).changed,'2026-10-20T02:00:00+00:00');
 const full={...due,balance_paid_at:ready};assert.equal(orderSummary(full).payment,'Fully paid');
 assert.equal(orderSummary({...paid,final_total_cents:5000,balance_due_cents:0}).payment,'Fully paid');
 assert.equal(orderSummary({...full,final_total_cents:1}).payment,'Awaiting balance');
 assert.equal(orderSummary({...due,ready_at:ready}).fulfilment,'Needs review');
 assert.equal(orderSummary({...full,ready_at:ready}).fulfilment,'Ready');
 assert.equal(orderSummary({...full,fulfilled_at:fulfilled}).fulfilment,'Collected');
 assert.equal(orderSummary({...full,fulfilled_at:fulfilled,fulfilment_method:'delivery'}).fulfilment,'Delivered');
 const cancelled={...full,payment_status:'REFUNDED',fulfilment_status_changed_at:fulfilled};
 assert.deepEqual(orderSummary(cancelled),{payment:'Refunded',fulfilment:'Cancelled',changed:'2026-10-20T04:00:00+00:00'});
 assert.equal(orderSummary({...cancelled,fulfilment_status_changed_at:null}).changed,null);
 assert.deepEqual(crmRecord(full),crmRecord(full));assert.ok(!('Order_Code' in crmRecord(full)));assert.ok(!('Created_By' in crmRecord(full)));assert.ok(!('Modified_By' in crmRecord(full)));
});
test('transactional queue rolls back with orders, preserves payment guards, serialises claims and quarantines uncertain work',async()=>{
 const db=new PGlite();await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE batches(id uuid PRIMARY KEY,deposit_amount numeric,status text DEFAULT 'OPEN',closes_at timestamptz DEFAULT now()+interval '1 day'); CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code text,batch_id uuid,quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());`);
 await db.exec(await readFile(new URL('../database/sql/order_fulfilment.sql',import.meta.url),'utf8'));
 const sql=await readFile(new URL('../database/sql/order_integrations.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const batch=randomUUID();await db.query('INSERT INTO batches(id,deposit_amount) VALUES($1,50)',[batch]);
 const insert=()=>db.query("INSERT INTO orders(order_code,batch_id,quantity,payment_status,customer_email,deposit_due_cents) VALUES('SAMA-0123456789ABCDEF',$1,1,'PENDING_PAYNOW','owner@example.com',5000) RETURNING id",[batch]);
 await db.exec('BEGIN');await insert();await db.exec('ROLLBACK');assert.equal((await db.query('SELECT count(*)::int n FROM order_integration_jobs')).rows[0].n,0);
 const id=(await insert()).rows[0].id;
 assert.equal((await db.query('SELECT count(*)::int n FROM order_integration_jobs')).rows[0].n,2);
 const op=(action,amount=null,ref=null,hash=null,envelope=null)=>db.query('SELECT order_operation_with_email($1,$2,$3,$4,$5,$6,$7)',[id,action,'owner@example.com',amount,ref,hash,envelope]);
 await assert.rejects(op('deposit',4999,'BANK'),/PAYMENT_MISMATCH/);
 const registeredStamp=(await db.query('SELECT fulfilment_status_changed_at FROM orders WHERE id=$1',[id])).rows[0].fulfilment_status_changed_at;assert.ok(registeredStamp);
 await op('deposit',5000,'BANK');await op('deposit',5000,'BANK');
 const depositStamp=(await db.query('SELECT fulfilment_status_changed_at FROM orders WHERE id=$1',[id])).rows[0].fulfilment_status_changed_at;assert.ok(depositStamp);
 await db.query("UPDATE orders SET payment_reference='BANK-EDIT',fulfilment_status_changed_at='1999-01-01' WHERE id=$1",[id]);
 assert.equal(String((await db.query('SELECT fulfilment_status_changed_at FROM orders WHERE id=$1',[id])).rows[0].fulfilment_status_changed_at),String(depositStamp));
 assert.equal((await db.query("SELECT count(*)::int n FROM order_integration_jobs WHERE event='deposit_received' AND kind='email'")).rows[0].n,1);
 await assert.rejects(op('balance_request',10000,null,'a'.repeat(64)),/EMAIL_LINK_REQUIRED/);
 await op('balance_request',10000,null,'a'.repeat(64),'encrypted');
 assert.equal(String((await db.query('SELECT fulfilment_status_changed_at FROM orders WHERE id=$1',[id])).rows[0].fulfilment_status_changed_at),String(depositStamp));
 await op('balance_paid',5000,'BALANCE');await op('ready');await op('fulfil',null,'Owner collection');
 assert.equal((await db.query('SELECT order_fulfilment_stage(o) stage FROM orders o WHERE id=$1',[id])).rows[0].stage,'Collected');
 await db.query("UPDATE orders SET payment_status='REFUNDED' WHERE id=$1",[id]);
 assert.equal((await db.query('SELECT order_fulfilment_stage(o) stage FROM orders o WHERE id=$1',[id])).rows[0].stage,'Cancelled');
 assert.equal((await db.query("SELECT payload->>'link_envelope' val FROM order_integration_jobs WHERE event='balance_requested' AND kind='email'")).rows[0].val,'encrypted');
 const claim=()=>db.query("SELECT * FROM claim_order_jobs('email',10)");const a=await claim();assert.equal(a.rows.length,1);assert.equal((await claim()).rows.length,0);
 await db.query("UPDATE order_integration_jobs SET claimed_at=now()-interval '6 minutes' WHERE id=$1",[a.rows[0].id]);const retry=await claim();assert.equal(retry.rows[0].id,a.rows[0].id);assert.notEqual(retry.rows[0].lease_token,a.rows[0].lease_token);
 await db.query("UPDATE order_integration_jobs SET claimed_at=now()-interval '6 minutes',send_started_at=now() WHERE id=$1",[retry.rows[0].id]);assert.equal((await claim()).rows.length,0);
 assert.equal((await db.query('SELECT status FROM order_integration_jobs WHERE id=$1',[a.rows[0].id])).rows[0].status,'review');
 await assert.rejects(db.query("SELECT * FROM claim_order_jobs('email',999)"),/INVALID_CLAIM/);
 for(const role of ['anon','authenticated']){assert.equal((await db.query(`SELECT has_table_privilege('${role}','order_integration_jobs','SELECT') ok`)).rows[0].ok,false);for(const fn of ['order_fulfilment_stage(orders)','track_order_fulfilment_time()','claim_order_jobs(text,integer)','enqueue_order_integrations()','order_operation_with_email(uuid,text,text,integer,text,text,text)'])assert.equal((await db.query(`SELECT has_function_privilege('${role}',$1,'EXECUTE') ok`,[fn])).rows[0].ok,false);}
 const funcs=(await db.query("SELECT proconfig,pg_get_userbyid(proowner) owner FROM pg_proc WHERE proname IN ('track_order_fulfilment_time','order_fulfilment_stage','claim_order_jobs','enqueue_order_integrations','order_operation_with_email')")).rows;for(const fn of funcs){assert.equal(fn.owner,'postgres');assert.deepEqual(fn.proconfig,['search_path=pg_catalog, pg_temp']);}
 await db.close();
});

async function loadTs(relative,imports){
 const ts=(await import('typescript')).default,vm=(await import('node:vm')).default;
 const source=await readFile(new URL(relative,import.meta.url),'utf8');const mod={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>{if(name==='server-only')return {};assert.ok(name in imports,`Unexpected import ${name}`);return imports[name];},mod,mod.exports);return mod.exports;
}
test('actual email templates escape customer text and encrypt/decrypt private balance links without exposing them to CRM',async()=>{
 const {orderMessage}=await loadTs('../src/lib/order-integrations/messages.ts',{'./policy':{publicOrigin},'./links':{openLink}});
 const id=randomUUID(),token='b'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
 const p={batch_id:randomUUID(),order_code:'SAMA-0123456789ABCDEF',name:'<script>bad</script>',email:'owner@example.com',quantity:1,deposit_cents:5000,balance_cents:1000,product:'Dryer',balance_hash:hash,link_envelope:sealLink(token,id,secret)};
 const pending=orderMessage('order_received',p,id,'https://example.com',secret);assert.match(pending.text,/not yet been verified/);assert.ok(!pending.html.includes('<script>'));assert.ok(pending.html.includes('&lt;script&gt;'));
 for(const event of ['order_received','deposit_received','balance_requested','balance_paid','ready']){const message=orderMessage(event,p,id,'https://example.com',secret);assert.ok(message.text.includes('Product: Dryer'));assert.ok(message.text.includes(`Batch ID: ${p.batch_id}`));assert.ok(message.text.includes(`https://example.com/group-buys/${p.batch_id}`));assert.ok(message.html.includes(`/group-buys/${p.batch_id}`));}
 assert.throws(()=>orderMessage('order_received',{...p,batch_id:'https://evil.example.com'},id,'https://example.com',secret),/INVALID_BATCH/);
 assert.ok(orderMessage('balance_requested',p,id,'https://example.com',secret).text.includes(`/balance/${token}`));
 assert.throws(()=>orderMessage('balance_requested',{...p,link_envelope:'bad'},id,'https://example.com',secret));
});
test('worker leases, pre-send retries, changed state, RPC failure and ambiguous provider outcomes fail safely',async()=>{
 const previous={...process.env};Object.assign(process.env,{ORDER_EMAIL_ENABLED:'true',ORDER_EMAIL_LINK_KEY:secret,NEXT_PUBLIC_SITE_URL:'https://example.com'});
 try{
 for(const scenario of ['success','preparation','timeout','save_failure','changed','lost_marker','rpc_failure']){
 let sends=0,reads=0,claimed=false;const job={id:randomUUID(),order_id:randomUUID(),kind:'email',event:'order_received',payload:{email:'owner@example.com'},lease_token:randomUUID(),attempts:1,status:'queued',send_started_at:null};
 const order={id:job.order_id,batch_id:randomUUID(),customer_email:'owner@example.com',payment_status:'PENDING_PAYNOW'};
 const db={rpc:async()=>{if(scenario==='rpc_failure')return {error:{message:'PRIVATE'}};if(claimed)return {data:[]};claimed=true;job.status='processing';return {data:[{...job}]};},from(table){
 let patch=null,filters=[];const q={update(v){patch=v;return q;},select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},async single(){
 if(table==='orders'){reads++;return {data:scenario==='changed'&&reads>1?{...order,payment_status:'VERIFIED'}:order};}
 return {data:table==='batches'?{product_id:randomUUID()}:{name:'Dryer'}};
 },async maybeSingle(){return apply(true);},then(resolve,reject){return Promise.resolve(apply(false)).then(resolve,reject);}};
 function apply(single){
 if(scenario==='lost_marker'&&patch?.send_started_at)return {data:null};
 if(scenario==='save_failure'&&patch?.status==='sent')return {error:{message:'PRIVATE'}};
 if(!filters.every(([k,v])=>job[k]===v))return {data:null};
 Object.assign(job,patch);return single?{data:{id:job.id}}:{data:null};
 }return q;
 }};
 const {processOrderJobs}=await loadTs('../src/lib/order-integrations/worker.ts',{
 '@/lib/orders/db':{orderDb:()=>db},'@/lib/mail/config':{mailSendingConfig:()=>({})},
 '@/lib/mail/zoho-transport':{prepareZohoMail:async()=>{if(scenario==='preparation')throw Error('PRIVATE');return async()=>{sends++;if(scenario==='timeout')throw Error('PRIVATE');return '123';};}},
 './policy':{emailStillRelevant,publicOrigin},'./messages':{orderMessage:()=>({to:'owner@example.com',text:'Test'})},'./crm':{validateCrm:()=>{},prepareCrm:()=>{},crmRecord:()=>{}}
 });
 if(scenario==='rpc_failure'){await assert.rejects(processOrderJobs('email'),/QUEUE_UNAVAILABLE/);assert.equal(sends,0);continue;}
 await Promise.all([processOrderJobs('email'),processOrderJobs('email')]);
 if(scenario==='success'){assert.equal(sends,1);assert.equal(job.status,'sent');assert.deepEqual(job.payload,{});}
 if(scenario==='preparation'){assert.equal(sends,0);assert.equal(job.status,'queued');assert.equal(job.error_code,'PREPARATION_FAILED');}
 if(['timeout','save_failure'].includes(scenario)){assert.equal(sends,1);assert.equal(job.status,'review');assert.equal(job.error_code,'PROVIDER_OUTCOME_UNCERTAIN');}
 if(scenario==='changed'){assert.equal(sends,0);assert.equal(job.status,'skipped');}
 if(scenario==='lost_marker')assert.equal(sends,0);
 }
 }finally{for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);}
});
