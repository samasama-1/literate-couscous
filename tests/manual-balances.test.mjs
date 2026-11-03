import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {sealLink,openLink} from '../src/lib/order-integrations/links.ts';
import {emailStillRelevant} from '../src/lib/order-integrations/policy.ts';
import {parseBalanceSelection,deliveryBalanceBlock,confirmedTotal} from '../src/lib/orders/manual-balance.ts';
const key='a'.repeat(64);
async function fixture(){
 const db=new PGlite({extensions:{pg_trgm}});try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TABLE products(id uuid PRIMARY KEY,name text,image_url text);CREATE TABLE batches(id uuid PRIMARY KEY,product_id uuid,deposit_amount numeric,status text DEFAULT 'OPEN',closes_at timestamptz DEFAULT now()+interval '1 day');CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code text,batch_id uuid,quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());`);
 for(const f of ['order_fulfilment','order_integrations','collection_management','collection_named_authorisation','manual_balance_operations','manual_balance_operations'])await db.exec(await readFile(new URL(`../database/sql/${f}.sql`,import.meta.url),'utf8'));
 const product=randomUUID(),batch=randomUUID();await db.query("INSERT INTO products VALUES($1,'Dryer','/dryer.png')",[product]);await db.query('INSERT INTO batches(id,product_id,deposit_amount)VALUES($1,$2,50)',[batch,product]);
 const get=async id=>(await db.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];
 const order=async(method='collection',verified=true)=>{const id=randomUUID();await db.query("INSERT INTO orders(id,order_code,batch_id,quantity,payment_status,customer_name,customer_email,deposit_due_cents,fulfilment_method)VALUES($1,$2,$3,2,'PENDING_PAYNOW','Customer','owner@example.test',5000,$4)",[id,'SAMA-'+randomBytes(8).toString('hex').toUpperCase(),batch,method]);if(verified)await db.query("SELECT order_operation($1,'deposit','admin@example.test',5000,$2,NULL)",[id,'BANK-'+id]);return id;};
 const op=async(id,action,amount=null,reference=null,funds=false,revision=null)=>db.query('SELECT admin_balance_operation($1,$2,$3,$4,$5,$6,$7)s',[id,action,revision??(await get(id)).balance_revision,'admin@example.test',amount,reference,funds]);
 const entry=async id=>{const token=randomBytes(32).toString('hex');return{id,revision:(await get(id)).balance_revision,hash:createHash('sha256').update(token).digest('hex'),envelope:sealLink(token,id,key)};};
 const queue=(entries,request=randomUUID(),confirmed=true)=>db.query('SELECT queue_delivery_balances($1,$2,$3,$4)r',[request,'admin@example.test',JSON.stringify(entries),confirmed]);
 return{db,get,order,op,entry,queue};
 }catch(e){await db.close();throw e;}
}
test('collection can be ready while balance is due, but bank verification must precede the ID-checked single handover',async()=>{
 const{db,get,order,op}=await fixture();try{
 const pending=await order('collection',false);await assert.rejects(op(pending,'set_total',12000),/ORDER_UNAVAILABLE/);
 const id=await order();await assert.rejects(op(id,'collection_ready'),/TOTAL_REQUIRED/);
 await op(id,'set_total',12000);let o=await get(id);assert.equal(o.balance_due_cents,7000);assert.equal(o.balance_token_hash,null);
 await op(id,'collection_ready');o=await get(id);assert.ok(o.ready_at);assert.equal(o.balance_paid_at,null);assert.ok(emailStillRelevant('ready',{email:o.customer_email,method:'collection'},o,Date.now(),true));
 await assert.rejects(db.query("SELECT fulfil_order_named($1,'admin@example.test','Customer',NULL,true)",[id]),/NOT_READY/);
 await assert.rejects(op(id,'collection_payment',7000,'DESK-PAY',false),/FUNDS_CHECK_REQUIRED/);await assert.rejects(op(id,'collection_payment',6999,'DESK-PAY',true),/PAYMENT_MISMATCH/);
 const stale=o.balance_revision;await db.query("UPDATE orders SET customer_email='updated@example.test' WHERE id=$1",[id]);await assert.rejects(op(id,'collection_payment',7000,'DESK-PAY',true,stale),/STALE_PREVIEW/);
 const rev=(await get(id)).balance_revision;const payments=await Promise.all([op(id,'collection_payment',7000,'DESK-PAY',true,rev),op(id,'collection_payment',7000,'DESK-PAY',true,rev)]);assert.deepEqual(payments.map(r=>r.rows[0].s).sort(),['already_paid','saved']);o=await get(id);assert.ok(o.balance_paid_at);
 assert.equal((await op(id,'collection_payment',7000,'DESK-PAY',true)).rows[0].s,'already_paid');
 const audit=(await db.query("SELECT actor,metadata FROM order_activity WHERE order_id=$1 AND action='balance_paid'",[id])).rows;assert.equal(audit.length,1);assert.equal(audit[0].actor,'admin@example.test');assert.equal(audit[0].metadata.amount_cents,7000);
 assert.equal((await db.query("SELECT count(*)::int n FROM order_integration_jobs WHERE order_id=$1 AND event IN('balance_requested','balance_paid')AND kind='email'",[id])).rows[0].n,0);
 assert.equal((await db.query("SELECT fulfil_order_named($1,'admin@example.test','Customer',NULL,true)s",[id])).rows[0].s,'collected');assert.equal((await db.query("SELECT fulfil_order_named($1,'admin@example.test','Customer',NULL,true)s",[id])).rows[0].s,'already_collected');
 const other=await order();await op(other,'set_total',12000);await assert.rejects(op(other,'collection_payment',7000,' desk-pay ',true),/PAYMENT_REFERENCE_REUSED/);
 const zero=await order();await op(zero,'set_total',5000);await op(zero,'collection_ready');assert.equal((await get(zero)).balance_due_cents,0);await assert.rejects(op(zero,'collection_payment',0,'ZERO',true),/PAYMENT_MISMATCH/);
 const delivery=await order('delivery');await op(delivery,'set_total',12000);await assert.rejects(op(delivery,'collection_ready'),/TOTAL_REQUIRED/);await assert.rejects(op(delivery,'collection_payment',7000,'DELIVERY-AT-DESK',true),/PAYMENT_MISMATCH/);
 }finally{await db.close();}
});
test('delivery batches are delivery-only, stale-safe, encrypted, atomic and idempotent across duplicate submissions',async()=>{
 const{db,get,order,op,entry,queue}=await fixture();try{
 const ids=[await order('delivery'),await order('delivery')];for(const id of ids)await op(id,'set_total',12000);
 assert.equal((await db.query("SELECT count(*)::int n FROM order_integration_jobs WHERE event='balance_requested'AND kind='email'")).rows[0].n,0);
 const entries=await Promise.all(ids.map(entry)),request=randomUUID();await assert.rejects(queue(entries,request,false),/CONFIRMATION_REQUIRED/);
 assert.equal((await queue(entries,request)).rows[0].r.count,2);const hash=(await get(ids[0])).balance_token_hash;
 assert.equal((await queue(entries.map(e=>({...e,hash:'b'.repeat(64)})),request)).rows[0].r.status,'already_queued');assert.equal((await get(ids[0])).balance_token_hash,hash);
 await assert.rejects(queue([entries[0]],request),/REQUEST_MISMATCH/);await assert.rejects(queue([await entry(ids[0])]),/ALREADY_REQUESTED/);
 const jobs=(await db.query("SELECT order_id,payload FROM order_integration_jobs WHERE event='balance_requested'AND kind='email'")).rows;assert.equal(jobs.length,2);
 for(const j of jobs){assert.equal(j.payload.method,'delivery');assert.ok(!JSON.stringify(j.payload).includes('/balance/'));assert.equal(createHash('sha256').update(openLink(j.payload.link_envelope,j.order_id,j.payload.balance_hash,key)).digest('hex'),j.payload.balance_hash);assert.ok(emailStillRelevant('balance_requested',j.payload,await get(j.order_id)));}
 const delivery=await order('delivery'),collection=await order();for(const id of [delivery,collection])await op(id,'set_total',12000);
 const before=(await db.query('SELECT count(*)::int n FROM delivery_balance_runs')).rows[0].n;await assert.rejects(queue([await entry(delivery),await entry(collection)]),/STALE_PREVIEW/);assert.equal((await get(delivery)).balance_token_hash,null);assert.equal((await db.query('SELECT count(*)::int n FROM delivery_balance_runs')).rows[0].n,before);
 const stale=await entry(delivery);await op(delivery,'set_total',13000);await assert.rejects(queue([stale]),/STALE_PREVIEW/);
 await db.query("INSERT INTO order_integration_jobs(order_id,kind,event,status)VALUES($1,'email','balance_requested','review')",[delivery]);await assert.rejects(queue([await entry(delivery)]),/REVIEW_EXISTING_SEND/);
 await assert.rejects(queue(Array.from({length:26},()=>entries[0])),/INVALID_BATCH/);await assert.rejects(queue([entries[0],entries[0]]),/INVALID_BATCH/);
 const funcs=(await db.query("SELECT proowner::regrole::text owner,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('track_balance_revision','enqueue_order_integrations','queue_delivery_balances','admin_balance_operation')")).rows;for(const f of funcs){assert.equal(f.owner,'postgres');assert.ok(f.proconfig.includes('search_path=pg_catalog, pg_temp'));}
 for(const role of ['anon','authenticated'])for(const fn of ['queue_delivery_balances(uuid,text,jsonb,boolean)','admin_balance_operation(uuid,text,bigint,text,integer,text,boolean)'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE')ok",[role,fn])).rows[0].ok,false);
 await db.query("DELETE FROM order_integration_jobs WHERE event='balance_requested'AND kind='email'AND order_id=ANY($1::uuid[])",[ids]);assert.equal((await db.query('SELECT count(*)::int n FROM delivery_balance_items WHERE job_id IS NULL')).rows[0].n,2);
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("SELECT has_table_privilege($1,'delivery_balance_runs','INSERT')ok",[role])).rows[0].ok,false);
 }finally{await db.close();}
});
test('preview validates limits and financial snapshots without treating collection orders as delivery recipients',()=>{
 const id=randomUUID();assert.deepEqual(parseBalanceSelection(JSON.stringify([{id,revision:3,email:'ignored@example.test'}])),[{id,revision:3}]);
 for(const rows of [[],Array(26).fill({id,revision:1}),[{id,revision:1},{id,revision:1}],[{id,revision:-1}],[{id:'bad',revision:1}]])assert.throws(()=>parseBalanceSelection(JSON.stringify(rows)));
 const base={id,fulfilment_method:'delivery',payment_status:'VERIFIED',deposit_verified_at:'2026-01-01',deposit_due_cents:5000,final_total_cents:12000,balance_due_cents:7000,balance_paid_at:null,customer_email:'owner@example.test',ready_at:null,fulfilled_at:null,balance_revision:1};assert.ok(confirmedTotal(base));assert.equal(deliveryBalanceBlock(base),null);
 for(const patch of [{fulfilment_method:'collection'},{deposit_verified_at:null},{final_total_cents:null},{balance_paid_at:'2026-01-01'},{balance_token_expires_at:'2099-01-01'}])assert.ok(deliveryBalanceBlock({...base,...patch}));
});
async function loadAction(relative,imports){
 const ts=(await import('typescript')).default,vm=(await import('node:vm')).default,mod={exports:{}};
 const source=await readFile(new URL(relative,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>{if(name==='server-only')return{};assert.ok(name in imports,`Unexpected import ${name}`);return imports[name];},mod,mod.exports);return mod.exports;
}
test('manual send authenticates first, requires explicit consent, seals tokens server-side and handles retries and RPC failure safely',async()=>{
 const prior={...process.env};Object.assign(process.env,{MANUAL_BALANCE_INSTALLED:'true',ORDER_INTEGRATIONS_INSTALLED:'true',ORDER_EMAIL_ENABLED:'true',ORDER_EMAIL_LINK_KEY:key});
 let authorised=false,calls=0,configCalls=0,outcome='queued',failure=false;const id=randomUUID();
 try{
 const{sendDeliveryBalances}=await loadAction('../src/app/actions/delivery-balances.ts',{
 'node:crypto':{randomBytes,createHash},'@/lib/adminAuth':{verifyAdminAccess:async()=>{if(!authorised)throw Error('denied');return{email:'admin@example.test'};}},
 '@/lib/orders/db':{orderDb:()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'queue_delivery_balances');assert.equal(args.p_actor,'admin@example.test');assert.equal(args.p_entries.length,1);const e=args.p_entries[0];assert.equal(e.id,id);assert.equal(e.revision,7);assert.deepEqual(Object.keys(e).sort(),['envelope','hash','id','revision']);assert.equal(createHash('sha256').update(openLink(e.envelope,id,e.hash,key)).digest('hex'),e.hash);return failure?{error:{message:'private database diagnostics'}}:{data:{status:outcome,count:1}};}})},
 '@/lib/orders/manual-balance':{parseBalanceSelection},'@/lib/order-integrations/links':{sealLink},'@/lib/mail/config':{mailSendingConfig:()=>{configCalls++;}},'next/cache':{revalidatePath:()=>{}}
 });
 const f=new FormData();f.set('request_id',randomUUID());f.set('selection',JSON.stringify([{id,revision:7,email:'attacker@example.test',amount:1}]));f.set('confirmed','on');
 assert.ok((await sendDeliveryBalances({},f)).error);assert.equal(calls,0);assert.equal(configCalls,0);authorised=true;f.delete('confirmed');assert.ok((await sendDeliveryBalances({},f)).error);assert.equal(calls,0);f.set('confirmed','on');
 assert.match((await sendDeliveryBalances({},f)).success,/queued/);outcome='already_queued';assert.match((await sendDeliveryBalances({},f)).success,/no duplicates/);failure=true;const result=await sendDeliveryBalances({},f);assert.ok(result.error);assert.ok(!JSON.stringify(result).includes('private database'));assert.equal(calls,3);
 }finally{for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];Object.assign(process.env,prior);}
});
test('collection payment action requires actual-funds attestation and revision and stops on already verified balances',async()=>{
 const prior={...process.env};process.env.MANUAL_BALANCE_INSTALLED='true';let calls=0,authorised=false,outcome='saved';
 try{
 const{operateOrder}=await loadAction('../src/app/actions/order-operations.ts',{
 '@/lib/operations/telemetry':{observeOperation:(_name,fn)=>fn()},'node:crypto':{randomBytes,createHash},'@/lib/adminAuth':{verifyAdminAccess:async()=>{if(!authorised)throw Error('denied');return{email:'admin@example.test'};}},
 '@/lib/orders/db':{orderDb:()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'admin_balance_operation');assert.equal(args.p_actor,'admin@example.test');assert.equal(args.p_revision,3);assert.equal(args.p_funds_checked,true);assert.equal(args.p_amount,7000);return{data:outcome};}})},
 '@/lib/orders/validation':{moneyCents:value=>Math.round(Number(value)*100)},'next/cache':{revalidatePath:()=>{}},'next/server':{after:()=>{throw Error('no external work allowed');}},'./zoho':{updateDealStageInZoho:()=>{throw Error('no external work allowed');}},'@/lib/order-integrations/links':{sealLink}
 });
 const f=new FormData();f.set('id',randomUUID());f.set('operation','collection_payment');f.set('amount','70.00');f.set('reference','BANK');f.set('revision','3');
 assert.ok((await operateOrder({},f)).error);assert.equal(calls,0);authorised=true;assert.match((await operateOrder({},f)).error,/actual credited funds/);assert.equal(calls,0);f.set('funds_checked','on');f.delete('revision');assert.ok((await operateOrder({},f)).error);assert.equal(calls,0);f.set('revision','3');assert.match((await operateOrder({},f)).success,/separate identity/);outcome='already_paid';assert.match((await operateOrder({},f)).error,/already verified/);assert.equal(calls,2);
 }finally{for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];Object.assign(process.env,prior);}
});
test('manual rollout preserves legacy producers and collection mail when disabled, suppressing obsolete mail only when enabled',async()=>{
 const{db,get,order}=await fixture();try{
 for(const method of ['collection','delivery']){
 const id=await order(method),token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
 await db.query("SELECT order_operation_with_email($1,'balance_request','admin@example.test',12000,NULL,$2,$3)",[id,hash,sealLink(token,id,key)]);
 const jobs=(await db.query("SELECT payload FROM order_integration_jobs WHERE order_id=$1 AND kind='email'AND event='balance_requested'",[id])).rows;assert.equal(jobs.length,1);
 assert.equal(emailStillRelevant('balance_requested',jobs[0].payload,await get(id),Date.now(),false),true);
 assert.equal(emailStillRelevant('balance_requested',jobs[0].payload,await get(id),Date.now(),true),method==='delivery');
 await db.query("SELECT order_operation($1,'balance_paid','admin@example.test',7000,$2,NULL)",[id,'BALANCE-'+id]);
 assert.equal((await db.query("SELECT count(*)::int n FROM order_integration_jobs WHERE order_id=$1 AND kind='email'AND event='balance_paid'",[id])).rows[0].n,1);
 }
 const o={customer_email:'owner@example.test',payment_status:'VERIFIED',ready_at:new Date().toISOString(),fulfilled_at:null,final_total_cents:12000,deposit_due_cents:5000,balance_due_cents:7000,balance_paid_at:null,fulfilment_method:'collection'};
 assert.equal(emailStillRelevant('ready',{email:o.customer_email,method:'collection'},o,Date.now(),false),false);assert.equal(emailStillRelevant('ready',{email:o.customer_email,method:'collection'},o,Date.now(),true),true);
 }finally{await db.close();}
});
test('old payment action is denied for collection in manual mode, but delivery and legacy mode remain supported',async()=>{
 const prior={...process.env};Object.assign(process.env,{MANUAL_BALANCE_INSTALLED:'true',ORDER_INTEGRATIONS_INSTALLED:'true'});let method='collection',readError=false,calls=0;
 try{
 const{operateOrder}=await loadAction('../src/app/actions/order-operations.ts',{
 '@/lib/operations/telemetry':{observeOperation:(_name,fn)=>fn()},'node:crypto':{randomBytes,createHash},'@/lib/adminAuth':{verifyAdminAccess:async()=>({email:'admin@example.test'})},
 '@/lib/orders/db':{orderDb:()=>({from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>readError?{error:{message:'private'}}:{data:{fulfilment_method:method}}};return q;},rpc:async()=>{calls++;return{data:null};}})},
 '@/lib/orders/validation':{moneyCents:()=>7000},'next/cache':{revalidatePath:()=>{}},'next/server':{after:()=>{}},'./zoho':{updateDealStageInZoho:()=>{}},'@/lib/order-integrations/links':{sealLink}
 });
 const f=new FormData();f.set('id',randomUUID());f.set('operation','balance_paid');f.set('amount','70');f.set('reference','BANK');
 assert.match((await operateOrder({},f)).error,/at collection/);assert.equal(calls,0);readError=true;assert.ok((await operateOrder({},f)).error);assert.equal(calls,0);readError=false;method='delivery';assert.ok((await operateOrder({},f)).success);assert.equal(calls,1);process.env.MANUAL_BALANCE_INSTALLED='false';method='collection';assert.ok((await operateOrder({},f)).success);assert.equal(calls,2);process.env.MANUAL_BALANCE_INSTALLED='true';process.env.COLLECTION_AUTH_INSTALLED='false';process.env.FULFILMENT_V2_ENABLED='false';f.set('operation','fulfil');assert.match((await operateOrder({},f)).error,/identity-checked/);assert.equal(calls,2);method='delivery';assert.ok((await operateOrder({},f)).success);assert.equal(calls,3);
 }finally{for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];Object.assign(process.env,prior);}
});
test('storage safety hold preserves accrued debt, prevents new fee clocks, records non-delivery and cannot resume billing',async()=>{
 const{db,order,op}=await fixture();try{
 const id=await order();await op(id,'set_total',12000);await op(id,'collection_ready');await db.query("INSERT INTO order_collection_accounts(order_id,policy_version,accepted_at,notice_at)VALUES($1,'collection-2026-10-v1',now()-interval '10 days',now()-interval '8 days')",[id]);
 const summary=async(oid=id,at='2099-01-01T00:00:00Z')=>(await db.query('SELECT collection_fee_summary($1,$2)f',[oid,at])).rows[0].f;
 const before=(await summary(id,new Date().toISOString())).due_cents;assert.equal(before,1000);
 for(let i=0;i<2;i++)await db.exec(await readFile(new URL('../database/sql/collection_fee_safety_hold.sql',import.meta.url),'utf8'));
 assert.equal((await summary()).due_cents,before);assert.equal((await summary()).accrual_mode,'off');
 await assert.rejects(db.query("SELECT collection_admin_operation($1,'resume','admin',NULL,'Resume',NULL)",[id]),/FEES_SAFETY_HELD/);
 await db.query("SELECT collection_admin_operation($1,'notice_hold','admin',NULL,'Confirmed issue','confirmed_bounce')",[id]);assert.equal((await summary()).notice_held,true);
 await db.query("UPDATE order_integration_jobs SET status='sent',completed_at=now() WHERE order_id=$1 AND event='ready'AND kind='email'",[id]);assert.equal((await summary()).notice_held,true);assert.ok((await summary()).provider_accepted_at);
 await db.query("SELECT suspend_storage_fees('manager','Maintain safety suspension')");assert.equal((await summary()).due_cents,1000);assert.equal((await summary()).accrual_mode,'suspended');assert.equal((await db.query('SELECT count(*)::int n FROM storage_fee_control_events')).rows[0].n,1);
 await db.query("SELECT collection_admin_operation($1,'reduce','manager',500,'Approved waiver',NULL)",[id]);assert.equal((await summary()).due_cents,500);
 const fresh=await order();await op(fresh,'set_total',12000);await op(fresh,'collection_ready');await db.query("INSERT INTO order_collection_accounts(order_id,policy_version,accepted_at)VALUES($1,'collection-2026-10-v1',now())",[fresh]);
 await db.query("UPDATE order_integration_jobs SET status='sent',completed_at=now() WHERE order_id=$1 AND event='ready'AND kind='email'",[fresh]);assert.equal((await summary(fresh)).notice_at,null);assert.equal((await summary(fresh)).due_cents,0);
 for(const role of ['anon','authenticated','service_role']){
 for(const f of ['collection_fee_before_hold(uuid,timestamp with time zone)','collection_admin_before_hold(uuid,text,text,bigint,text,text)','suspend_storage_fees(text,text)'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE')ok",[role,f])).rows[0].ok,false);
 assert.equal((await db.query("SELECT has_table_privilege($1,'storage_fee_controls','UPDATE')ok",[role])).rows[0].ok,false);
 }
 assert.equal((await db.query("SELECT has_table_privilege('service_role','order_collection_accounts','UPDATE')ok")).rows[0].ok,false);
 }finally{await db.close();}
});
test('existing private payment pages retain advance payment instructions until the manual rollout is enabled',async()=>{
 const prior=process.env.MANUAL_BALANCE_INSTALLED;let method='collection',paid=false;
 try{
 const jsx=(type,props)=>({type:typeof type==='string'?type:'component',props});
 const{default:page}=await loadAction('../src/app/balance/[token]/page.tsx',{
 'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/collections/policy':{productImage:()=>null},'next/image':()=>null,'next/navigation':{notFound:()=>{throw Error('not found');}},
 '@/lib/orders/balance':{loadBalanceOrder:async()=>({batch_id:randomUUID(),order_code:'SAMA-0123456789ABCDEF',quantity:1,final_total_cents:12000,deposit_due_cents:5000,balance_due_cents:7000,balance_paid_at:paid?'2026-01-01':null,fulfilment_method:method})},
 '@/lib/orders/db':{orderDb:()=>({from:table=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:table==='batches'?{product_id:randomUUID()}:{name:'Dryer'}})};return q;}})},'@/lib/orders/payment-config':{paymentConfig:()=>({configured:true,uen:'TEST-UEN',payee:'Test Company'})}
 });
 const render=async()=>JSON.stringify(await page({params:Promise.resolve({token:'b'.repeat(64)})}));
 process.env.MANUAL_BALANCE_INSTALLED='false';assert.match(await render(),/Transfer the exact remaining amount/);process.env.MANUAL_BALANCE_INSTALLED='true';assert.match(await render(),/payable at collection/);assert.ok(!(await render()).includes('Transfer the exact remaining amount'));method='delivery';assert.match(await render(),/Transfer the exact remaining amount/);paid=true;assert.match(await render(),/fully paid/);assert.ok(!(await render()).includes('Transfer the exact remaining amount'));
 }finally{if(prior===undefined)delete process.env.MANUAL_BALANCE_INSTALLED;else process.env.MANUAL_BALANCE_INSTALLED=prior;}
});
test('storage safety overview is bounded, seek-paginated, service-only and excludes contact/payment data',async()=>{
 const{db}=await fixture();try{
 await db.exec(await readFile(new URL('../database/sql/collection_fee_safety_hold.sql',import.meta.url),'utf8'));
 await db.exec("INSERT INTO orders(id,order_code,customer_name,customer_email,customer_phone,fulfilment_method,payment_status,quantity)SELECT gen_random_uuid(),'SAMA-'||upper(lpad(to_hex(n),16,'0')),'Sample customer','private@example.test','PRIVATE-PHONE','collection','VERIFIED',1 FROM generate_series(1,55)n;INSERT INTO collection_notice_evidence(order_id,held_at,recorded_at,hold_reason)SELECT id,'2026-11-01','2026-11-01','confirmed_bounce'FROM orders;");
 const read=async(at=null,id=null)=>(await db.query('SELECT storage_safety_overview($1,$2)f',[at,id])).rows[0].f;
 const first=await read();assert.equal(first.mode,'off');assert.equal(first.notices.length,51);assert.ok(!JSON.stringify(first).includes('private@example.test'));assert.ok(!JSON.stringify(first).includes('PRIVATE-PHONE'));
 const cursor=first.notices[49],second=await read(cursor.recorded_at,cursor.id);assert.equal(second.notices.length,5);assert.equal(new Set([...first.notices.slice(0,50),...second.notices].map(x=>x.id)).size,55);
 await assert.rejects(read(cursor.recorded_at,null),/INVALID_CURSOR/);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'storage_safety_overview(timestamp with time zone,uuid)','EXECUTE')ok",[role])).rows[0].ok,false);
 assert.equal((await db.query("SELECT has_function_privilege('service_role','storage_safety_overview(timestamp with time zone,uuid)','EXECUTE')ok")).rows[0].ok,true);
 const f=(await db.query("SELECT proowner::regrole::text owner,proconfig FROM pg_proc WHERE proname='storage_safety_overview'")).rows[0];assert.equal(f.owner,'postgres');assert.ok(f.proconfig.includes('search_path=pg_catalog, pg_temp'));
 const delivery=(await db.query("UPDATE orders SET fulfilment_method='delivery'WHERE id=$1 RETURNING id",[cursor.id])).rows[0].id;await assert.rejects(db.query("SELECT collection_admin_operation($1,'notice_hold','admin',NULL,'Issue','confirmed_bounce')",[delivery]),/ORDER_UNAVAILABLE/);
 }finally{await db.close();}
});
