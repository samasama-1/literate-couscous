import {workerMetrics,observeQuery,observeOperation} from '../src/lib/operations/telemetry.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {collectionToken,parseCollectionToken,accessMatches} from '../src/lib/collections/access.ts';
import {storageFee,productImage} from '../src/lib/collections/policy.ts';
const key='a'.repeat(64);
test('storage fee boundaries have no cap and approved extensions/pauses shift the deadline',()=>{
 const day=86400000;
 for(const [days,cents] of [[0,0],[7,0],[7.01,1000],[14,1000],[14.01,2000],[21,2000],[21.01,3000],[365,52000]])assert.equal(storageFee(0,days*day),cents);
 assert.equal(storageFee(0,9*day,86400,1),0);
 for(const value of ['', 'javascript:alert(1)','http://example.com/x','https://user:pass@example.com/x','https://example.com/a b'])assert.equal(productImage(value,'https://example.com'),null);
 assert.equal(productImage('/dryer.jpg','https://example.com'),'https://example.com/dryer.jpg');
});
test('private collection links are purpose/key/state bound, expiring, revocable and tamper resistant',()=>{
 const now=Date.now(),o={id:randomUUID(),ready_at:new Date(now).toISOString(),customer_email:'owner@example.com',collection_access_version:1,payment_status:'VERIFIED',fulfilment_method:'collection',fulfilled_at:null};
 const token=collectionToken(o,key,now),claims=parseCollectionToken(token,key,now);assert.ok(claims);assert.ok(accessMatches(claims,o));assert.ok(!token.includes(o.customer_email));
 assert.equal(parseCollectionToken(token,'b'.repeat(64),now),null);assert.equal(parseCollectionToken(token,key,now+86400000),null);assert.equal(parseCollectionToken(token+'x',key,now),null);
 for(const changed of [{customer_email:'changed@example.com'},{collection_access_version:2},{ready_at:null},{payment_status:'REFUNDED'},{fulfilled_at:'2026-10-26'},{fulfilment_method:'delivery'}])assert.equal(accessMatches(claims,{...o,...changed}),false);
});
test('collection SQL is rerunnable, service-only, atomic and preserves payment, expiry and one-handover guards',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TABLE batches(id uuid PRIMARY KEY,deposit_amount numeric,status text DEFAULT 'OPEN',closes_at timestamptz DEFAULT now()+interval '1 day');CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code text,batch_id uuid,quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());`);
 for(const file of ['order_fulfilment','order_integrations','collection_management','collection_management','collection_named_authorisation','collection_named_authorisation'])await db.exec(await readFile(new URL(`../database/sql/${file}.sql`,import.meta.url),'utf8'));
 await db.exec('UPDATE collection_controls SET delegated_enabled=true');
 const batch=randomUUID();await db.query('INSERT INTO batches(id,deposit_amount)VALUES($1,50)',[batch]);
 const register=async(extra={})=>{const p={order_code:`SAMA-${randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`,batch_id:batch,quantity:1,customer_name:'Owner',customer_phone:'+65'+String(Math.floor(Math.random()*100000000)).padStart(8,'0'),customer_email:'owner@example.com',address_line1:'12 Test Road',postal_code:'123456',fulfilment_method:'collection',policy_accepted:true,collection_policy_version:'collection-2026-10-v1',...extra};await db.query('SELECT register_batch_order_v2($1::jsonb)',[JSON.stringify(p)]);return (await db.query('SELECT id FROM orders WHERE order_code=$1',[p.order_code])).rows[0].id;};
 await assert.rejects(register({policy_accepted:false}),/POLICY_ACCEPTANCE_REQUIRED/);assert.equal((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n,0);
 const id=await register();
 const op=(action,amount=null,ref=null,oid=id)=>db.query('SELECT order_operation($1,$2,$3,$4,$5,$6)',[oid,action,'admin@example.com',amount,ref,action==='balance_request'?'a'.repeat(64):null]);
 await assert.rejects(op('ready'),/NOT_FULLY_PAID/);await op('deposit',5000,'DEPOSIT1');await op('balance_request',5000);await op('ready');
 const summary=async(oid=id,at=new Date().toISOString())=>(await db.query('SELECT collection_fee_summary($1,$2) f',[oid,at])).rows[0].f;
 assert.equal((await summary()).notice_at,null);
 await db.query("UPDATE order_integration_jobs SET status='sent',completed_at=now() WHERE order_id=$1 AND kind='email' AND event='ready'",[id]);assert.ok((await summary()).notice_at);
 const stamp=Date.now();await db.query('UPDATE order_collection_accounts SET notice_at=$2 WHERE order_id=$1',[id,new Date(stamp-8*86400000).toISOString()]);assert.equal((await summary(id,new Date(stamp).toISOString())).due_cents,1000);
 const admin=(action,amount=null,note='Agreed with customer',ref=null,oid=id)=>db.query('SELECT collection_admin_operation($1,$2,$3,$4,$5,$6)',[oid,action,'admin@example.com',amount,note,ref]);
 await assert.rejects(admin('reduce',1000,''),/REASON_REQUIRED/);await assert.rejects(admin('reduce',1001),/INVALID_REDUCTION/);
 await assert.rejects(db.query('SELECT fulfil_order_named($1,$2,$3,NULL,true)',[id,'admin@example.com','Owner']),/STORAGE_FEES_DUE/);
 await assert.rejects(op('fulfil',null,'Owner'),/USE_VERIFIED_HANDOVER/);
 await admin('reduce',500);await admin('payment',500,'Bank payment verified','STORAGE1');assert.equal((await summary()).due_cents,0);
 await admin('pause');const before=(await summary()).gross_cents;assert.equal((await summary(id,new Date(stamp+100*86400000).toISOString())).gross_cents,before);await admin('resume');
 assert.equal((await summary(id,new Date(stamp+7*86400000).toISOString())).due_cents,1000); // current waiver is not an unlimited future waiver
 const other=await register();await assert.rejects(op('deposit',5000,' storage1 ',other),/PAYMENT_REFERENCE_REUSED/);
 await assert.rejects(admin('payment',1000,'Duplicate bank payment','DEPOSIT1'),/PAYMENT_MISMATCH/);
 const ready=(await db.query('SELECT ready_at FROM orders WHERE id=$1',[id])).rows[0].ready_at;
 const setCollector=(version=1,name='Collector',consent=true,email='owner@example.com',expires=Math.floor(Date.now()/1000)+3600)=>db.query('SELECT set_named_collector($1,$2,$3,$4,$5,$6,$7,false) id',[id,version,email,ready,expires,consent,name]);
 await assert.rejects(setCollector(1,'Collector',true,'other@example.com'),/OWNER_LINK_UNAVAILABLE/);
 await assert.rejects(setCollector(1,'Collector',false),/INVALID_COLLECTOR/);
 await assert.rejects(setCollector(1,'Collector',true,'owner@example.com',1),/OWNER_LINK_UNAVAILABLE/);
 const first=(await setCollector()).rows[0].id;
 await assert.rejects(setCollector(),/OWNER_LINK_UNAVAILABLE/); // single-use email link
 const fulfil=(aid,identity=true,name='Collector')=>db.query('SELECT fulfil_order_named($1,$2,$3,$4,$5)',[id,'admin@example.com',name,aid,identity]);
 await assert.rejects(fulfil(first,false),/IDENTITY_CHECK_REQUIRED/);await assert.rejects(fulfil(first,true,'Someone else'),/COLLECTOR_NOT_AUTHORISED/);
 const second=(await setCollector(2,'Replacement')).rows[0].id;await assert.rejects(fulfil(first),/COLLECTOR_NOT_AUTHORISED/);
 await db.exec('UPDATE collection_controls SET delegated_enabled=false');await assert.rejects(fulfil(second,true,'Replacement'),/DELEGATION_PAUSED/);
 await db.query('SELECT set_named_collector($1,3,$2,$3,$4,false,$5,true)',[id,'owner@example.com',ready,Math.floor(Date.now()/1000)+3600,'']); // revocation remains available while paused
 await db.exec('UPDATE collection_controls SET delegated_enabled=true');const third=(await setCollector(4)).rows[0].id;
 await assert.rejects(op('fulfil',null,'Collector'),/USE_VERIFIED_HANDOVER/);
 const outcomes=await Promise.all([fulfil(third),fulfil(third)]);assert.deepEqual(outcomes.map(r=>r.rows[0].fulfil_order_named).sort(),['already_collected','collected']);
 assert.equal((await db.query("SELECT count(*)::int n FROM order_activity WHERE order_id=$1 AND action='fulfil'",[id])).rows[0].n,1);
 assert.ok((await db.query('SELECT used_at FROM order_collectors WHERE order_id=$1',[id])).rows[0].used_at);
 const checks=(await db.query('SELECT * FROM order_handover_checks WHERE order_id=$1',[id])).rows[0];assert.equal(checks.identity_checked,true);assert.equal(checks.authorisation_id,third);
 assert.equal((await db.query("SELECT to_regprocedure('fulfil_order_v2(uuid,text,text,uuid,text)')f")).rows[0].f,null);
 const delivery=await register({fulfilment_method:'delivery'});await db.query("UPDATE order_collection_accounts SET notice_at=now()-interval '500 days' WHERE order_id=$1",[delivery]);assert.equal((await summary(delivery)).due_cents,0);
 const legacy=randomUUID();await db.query("INSERT INTO orders(id,batch_id,quantity,payment_status)VALUES($1,$2,1,'PENDING_PAYNOW')",[legacy,batch]);assert.equal((await summary(legacy)).eligible,false);
 const review=await register();await db.query("UPDATE order_collection_accounts SET notice_at=now()-interval '22 days' WHERE order_id=$1",[review]);assert.ok((await summary(review)).review_due);await admin('review',null,'Contact customer before cancellation',null,review);assert.ok((await summary(review)).reviewed_at);assert.equal((await summary(review)).stopped,false);await assert.rejects(admin('payment',3000,'Duplicate bank reference','DEPOSIT1',review),/PAYMENT_REFERENCE_REUSED/);
 await db.query("UPDATE orders SET payment_status='REFUNDED' WHERE id=$1",[review]);assert.equal((await summary(review)).stopped,true);
 for(const role of ['anon','authenticated']){
 for(const name of ['order_collectors','order_collection_accounts','order_collection_payments'])assert.equal((await db.query('SELECT has_table_privilege($1,$2,\'SELECT\') ok',[role,name])).rows[0].ok,false);
 const funcs=await db.query("SELECT oid::regprocedure::text signature,proowner::regrole::text owner,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('collection_fee_summary','register_batch_order_v2','collection_admin_operation','set_named_collector','fulfil_order_named','queue_collection_access')");
 for(const f of funcs.rows){assert.equal(f.owner,'postgres');assert.ok(f.proconfig.includes('search_path=pg_catalog, pg_temp'));assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') ok',[role,f.signature])).rows[0].ok,false);}
 }
 }finally{await db.close();}
});
async function loadTs(relative,imports){
 const ts=(await import('typescript')).default,vm=(await import('node:vm')).default;
 const source=await readFile(new URL(relative,import.meta.url),'utf8'),mod={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>{if(name==='server-only')return {};assert.ok(name in imports,`Unexpected import ${name}`);return imports[name];},mod,mod.exports);return mod.exports;
}
test('collection access checks feature and MAC before any database read, then applies rate and current-state checks',async()=>{
 const previous=process.env.COLLECTION_AUTH_INSTALLED,oldKey=process.env.ORDER_EMAIL_LINK_KEY;
 let reads=0,limits=0;const o={id:randomUUID(),ready_at:new Date().toISOString(),customer_email:'owner@example.com',collection_access_version:1,payment_status:'VERIFIED',fulfilment_method:'collection',fulfilled_at:null};
 const q={select(){return q;},eq(){return q;},async single(){reads++;return {data:o};}};
 const {loadCollectionAccess}=await loadTs('../src/lib/collections/server.ts',{'@/lib/orders/db':{orderDb:()=>({from:()=>q})},'./access':{parseCollectionToken,accessMatches},'@/lib/campaigns/security':{limitRequest:async()=>{limits++;}}});
 try{
 process.env.ORDER_EMAIL_LINK_KEY=key;process.env.COLLECTION_AUTH_INSTALLED='false';assert.equal(await loadCollectionAccess(collectionToken(o,key)),null);
 process.env.COLLECTION_AUTH_INSTALLED='true';assert.equal(await loadCollectionAccess('malformed'),null);assert.equal(reads,0);assert.equal(limits,0);
 const token=collectionToken(o,key);assert.ok(await loadCollectionAccess(token));assert.equal(reads,1);assert.equal(limits,1);
 o.collection_access_version=2;assert.equal(await loadCollectionAccess(token),null);
 }finally{if(previous===undefined)delete process.env.COLLECTION_AUTH_INSTALLED;else process.env.COLLECTION_AUTH_INSTALLED=previous;if(oldKey===undefined)delete process.env.ORDER_EMAIL_LINK_KEY;else process.env.ORDER_EMAIL_LINK_KEY=oldKey;}
});
test('collection actions reject unauthorised admins, missing consent, malformed details and RPC failure without exposing secrets',async()=>{
 const previousDelegation=process.env.DELEGATED_COLLECTION_ENABLED;process.env.DELEGATED_COLLECTION_ENABLED='true';
 let calls=0;let rpcError=false;let enabled=true;
 const db={rpc:async()=>{calls++;return rpcError?{error:{message:'PRIVATE KEY VALUE'}}:{data:randomUUID()};}};
 const {manageCollection,authoriseCollector}=await loadTs('../src/app/actions/collections.ts',{'@/lib/operations/telemetry':{observeOperation},'@/lib/collections/server':{loadCollectionAccess:async()=>enabled?{claims:{version:1,expires:Math.floor(Date.now()/1000)+3600},order:{id:randomUUID(),customer_email:'owner@example.com',ready_at:new Date().toISOString()},db}:null},'@/lib/campaigns/security':{limitRequest:async()=>{}},'@/lib/orders/db':{orderDb:()=>db},'@/lib/adminAuth':{verifyAdminAccess:async()=>{throw Error('Not authorised');}},'@/lib/orders/validation':{moneyCents:()=>1000},'next/cache':{revalidatePath:()=>{}}});
 assert.ok((await manageCollection({},new FormData())).error);assert.equal(calls,0);
 const form=new FormData();form.set('token','private');form.set('name','Collector');form.set('phone','+6580000000');
 assert.ok((await authoriseCollector({},form)).error);assert.equal(calls,0);form.set('consent','on');
 const ok=await authoriseCollector({},form);assert.ok(ok.success);assert.equal(ok.code,undefined);assert.equal(calls,1);
 rpcError=true;const failure=await authoriseCollector({},form);assert.ok(failure.error);assert.ok(!JSON.stringify(failure).includes('PRIVATE'));assert.ok(!failure.code);
 enabled=false;assert.ok((await authoriseCollector({},form)).error);assert.equal(calls,2);if(previousDelegation===undefined)delete process.env.DELEGATED_COLLECTION_ENABLED;else process.env.DELEGATED_COLLECTION_ENABLED=previousDelegation;
});
test('enabled ready-email worker supplies a signed collection link and accepted policy alongside catalog imagery',async()=>{
 const prior={...process.env};Object.assign(process.env,{MANUAL_BALANCE_INSTALLED:'true',FULFILMENT_V2_ENABLED:'true',COLLECTION_AUTH_INSTALLED:'true',DELEGATED_COLLECTION_ENABLED:'true',ORDER_EMAIL_ENABLED:'true',ORDER_EMAIL_LINK_KEY:key,NEXT_PUBLIC_SITE_URL:'https://example.com'});
 try{
 const {emailStillRelevant,publicOrigin}=await import('../src/lib/order-integrations/policy.ts');
 const o={id:randomUUID(),batch_id:randomUUID(),customer_email:'owner@example.com',customer_name:'Owner',quantity:1,payment_status:'VERIFIED',deposit_due_cents:5000,final_total_cents:5000,balance_due_cents:0,deposit_verified_at:new Date().toISOString(),ready_at:new Date().toISOString(),fulfilled_at:null,fulfilment_method:'collection',collection_access_version:3};
 const job={id:randomUUID(),order_id:o.id,event:'ready',kind:'email',payload:{email:o.customer_email,method:'collection'},lease_token:randomUUID(),attempts:1};let captured,sends=0,claimed=false;
 const db={rpc:async()=>{const data=claimed?[]:[job];claimed=true;return {data};},from(table){const q={select(){return q;},eq(){return q;},is(){return q;},update(){return q;},async single(){return {data:table==='orders'?o:table==='batches'?{product_id:randomUUID()}:{name:'Dryer',image_url:'/dryer.png'}};},async maybeSingle(){return {data:table==='order_collection_accounts'?{policy_version:'collection-2026-10-v1'}:{id:job.id}};}};return q;}};
 const {processOrderJobs}=await loadTs('../src/lib/order-integrations/worker.ts',{'@/lib/operations/telemetry':{workerMetrics,observeQuery,observeOperation},'@/lib/collections/access':{collectionToken},'@/lib/orders/db':{orderDb:()=>db},'@/lib/mail/config':{mailSendingConfig:()=>({})},'@/lib/mail/zoho-transport':{prepareZohoMail:async()=>async()=>{sends++;return '1';}},'./policy':{emailStillRelevant:(...args)=>{assert.equal(args[4],true);return emailStillRelevant(...args);},publicOrigin},'./messages':{orderMessage:(_event,p)=>{captured=p;return {to:p.email,text:'Test'};}},'./crm':{validateCrm:()=>{},prepareCrm:()=>{},crmRecord:()=>{}}});
 await processOrderJobs('email');assert.equal(sends,1);assert.equal(captured.image_url,'/dryer.png');assert.equal(captured.collection_policy,true);process.env.COLLECTION_FEE_HOLD_INSTALLED='true';claimed=false;await processOrderJobs('email');assert.equal(sends,2);assert.equal(captured.collection_policy,false);
 const claims=parseCollectionToken(captured.collection_url.split('/collection/')[1],key);assert.ok(claims);assert.equal(claims.id,o.id);assert.equal(claims.version,3);
 }finally{for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];Object.assign(process.env,prior);}
});

test('admin handover passes the ID attestation and treats already-collected as a stop, not release success',async()=>{
 const prior={...process.env};Object.assign(process.env,{COLLECTION_AUTH_INSTALLED:'true',ORDER_INTEGRATIONS_INSTALLED:'true'});
 let outcome='collected',calls=0;
 try{
 const {operateOrder}=await loadTs('../src/app/actions/order-operations.ts',{
 '@/lib/operations/telemetry':{observeOperation},'node:crypto':{randomBytes:()=>{throw Error('not used');},createHash:()=>{throw Error('not used');}},
 '@/lib/adminAuth':{verifyAdminAccess:async()=>({email:'admin@example.test'})},'@/lib/orders/db':{orderDb:()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'fulfil_order_named');assert.equal(args.p_actor,'admin@example.test');return args.p_identity_checked?{data:outcome}:{error:{message:'IDENTITY_CHECK_REQUIRED'}};}})},
 '@/lib/orders/validation':{moneyCents:()=>0},'next/cache':{revalidatePath:()=>{}},'next/server':{after:()=>{}},'./zoho':{updateDealStageInZoho:()=>{}},'@/lib/order-integrations/links':{sealLink:()=>{}}
 });
 const form=new FormData();form.set('id',randomUUID());form.set('operation','fulfil');form.set('reference','Owner');
 assert.match((await operateOrder({},form)).error,/photo ID/);form.set('identity_checked','on');assert.ok((await operateOrder({},form)).success);
 outcome='already_collected';const duplicate=await operateOrder({},form);assert.ok(!duplicate.success);assert.match(duplicate.error,/Do not release/);assert.equal(calls,3);
 }finally{for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];Object.assign(process.env,prior);}
});
