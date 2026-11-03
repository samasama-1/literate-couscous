import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {workerMetrics,observeQuery,measuredFetch,observeWorkerRequest,percentileBucket} from '../src/lib/operations/telemetry.ts';
import {capacityModel} from '../src/lib/operations/capacity.ts';
import {orderCursor,parseOrderCursor} from '../src/lib/operations/pagination.ts';
async function fixture(){
 const db=new PGlite({extensions:{pg_trgm}});
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE TABLE products(id uuid PRIMARY KEY,name text,image_url text);CREATE TABLE batches(id uuid PRIMARY KEY,product_id uuid,deposit_amount numeric,status text DEFAULT 'OPEN',closes_at timestamptz DEFAULT now()+interval '1 day');CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code text,batch_id uuid,quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());CREATE TABLE email_deliveries(id uuid PRIMARY KEY,status text,provider text,attempted_at timestamptz,metadata jsonb NOT NULL DEFAULT '{}');CREATE TABLE campaign_rate_limits(key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);`);
 for(const name of ['order_fulfilment','order_integrations','collection_management','order_operations_runtime'])await db.exec(await readFile(new URL(`../database/sql/${name}.sql`,import.meta.url),'utf8'));
 const batch=randomUUID(),product=randomUUID();await db.query("INSERT INTO products VALUES($1,'Product','/product.png')",[product]);await db.query('INSERT INTO batches(id,product_id,deposit_amount)VALUES($1,$2,50)',[batch,product]);
 const order=async()=>{const id=randomUUID();await db.query("INSERT INTO orders(id,order_code,batch_id,quantity,payment_status,customer_name,customer_email)VALUES($1,$2,$3,1,'PENDING_PAYNOW','Owner','owner@example.test')",[id,'SAMA-0123456789ABCDEF',batch]);return id;};
 const job=async(oid,event)=>{const id=randomUUID();await db.query("INSERT INTO order_integration_jobs(id,order_id,kind,event,payload)VALUES($1,$2,'email',$3,'{}')",[id,oid,event]);return id;};
 return {db,order,job};
 }catch(e){await db.close();throw e;}
}
test('runtime migration reruns, counters remain exact, leases and lanes preserve ordering and provider limits fail closed',async()=>{
 const {db,order,job}=await fixture();try{
 const ids=[];for(let i=0;i<4;i++)ids.push(await order());
 await db.exec(await readFile(new URL('../database/sql/order_operations_runtime.sql',import.meta.url),'utf8'));
 const claim=async()=>(await db.query("SELECT * FROM claim_order_jobs_v2('email',10)")).rows;
 assert.equal((await claim()).length,0); // disabled until an operator approves budgets
 await db.exec("UPDATE order_runtime_limits SET enabled=true,minimum_gap_seconds=0 WHERE kind='email'");
 const routine=await job(ids[0],'campaign_update'),security=await job(ids[0],'owner_otp');
 await db.query("UPDATE order_integration_jobs SET status='review' WHERE order_id=$1 AND event='order_received'",[ids[0]]);
 let jobs=await claim();assert.ok(jobs.some(j=>j.id===routine));assert.ok(jobs.some(j=>j.id===security));assert.ok(!jobs.some(j=>j.order_id===ids[0]&&j.lane==='lifecycle'));
 const pick=jobs.find(j=>j.id===security),revision=(await db.query('SELECT integration_revision v FROM orders WHERE id=$1',[ids[0]])).rows[0].v;
 const start=(j,r=revision)=>db.query('SELECT begin_order_job_send($1,$2,$3) s',[j.id,j.lease_token,r]);
 assert.equal((await start(pick)).rows[0].s,'allowed');assert.equal((await start(pick)).rows[0].s,'stale');
 const contexts=(await db.query('SELECT order_job_contexts($1) c',[JSON.stringify(jobs.map(j=>({id:j.id,lease:j.lease_token})))])).rows[0].c;assert.equal(contexts.length,jobs.length);assert.ok(!JSON.stringify(contexts).includes('payment_reference'));assert.equal(contexts[0].product,'Product');
 const original=jobs.find(j=>j.order_id===ids[1]);await db.query("UPDATE orders SET customer_email='new@example.test' WHERE id=$1",[ids[1]]);assert.equal((await start(original,0)).rows[0].s,'changed');
 const routineJob=jobs.find(j=>j.id===routine);await db.exec("UPDATE order_runtime_limits SET hourly_limit=2,reserved_urgent=1,reserved_security=0 WHERE kind='email'");assert.equal((await start(routineJob)).rows[0].s,'deferred');
 const urgent=jobs.find(j=>j.order_id===ids[2]);assert.equal((await start(urgent,0)).rows[0].s,'allowed');const over=jobs.find(j=>j.order_id===ids[3]);assert.equal((await start(over,0)).rows[0].s,'deferred');
 await db.exec("UPDATE order_runtime_limits SET hourly_limit=40,reserved_urgent=10 WHERE kind='email'");
 // Lease recovery never repeats an uncertain POST.
 await db.query("UPDATE order_integration_jobs SET claimed_at=now()-interval '6 minutes' WHERE id=$1",[pick.id]);await claim();assert.equal((await db.query('SELECT status FROM order_integration_jobs WHERE id=$1',[pick.id])).rows[0].status,'review');
 const actual=(await db.query('SELECT kind,lane,status,count(*)::bigint n FROM order_integration_jobs GROUP BY 1,2,3 ORDER BY 1,2,3')).rows;
 const counted=(await db.query('SELECT kind,lane,status,sum(jobs)::bigint n FROM order_queue_counts GROUP BY 1,2,3 HAVING sum(jobs)>0 ORDER BY 1,2,3')).rows;assert.deepEqual(actual,counted);
 const report=(await db.query('SELECT order_runtime_report()r')).rows[0].r;assert.equal(report.oldest.length,6);assert.ok(!JSON.stringify(report).includes('owner@example.test'));
 await assert.rejects(db.query("SELECT claim_order_jobs_v2('email',11)"),/INVALID_CLAIM/);
 for(const role of ['anon','authenticated']){
 for(const signature of ['claim_order_jobs_v2(text,integer)','begin_order_job_send(uuid,uuid,bigint)','order_job_contexts(jsonb)','order_runtime_report()'])assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\')ok',[role,signature])).rows[0].ok,false);
 }
 assert.equal((await db.query("SELECT has_function_privilege('service_role','cleanup_order_runtime(integer)','EXECUTE')ok")).rows[0].ok,false);
 // A legacy server build cannot bypass guarded pacing with a direct send marker.
 await db.exec('GRANT SELECT,UPDATE ON order_integration_jobs TO service_role');await db.exec('SET ROLE service_role');
 await assert.rejects(db.query('UPDATE order_integration_jobs SET send_started_at=now() WHERE id=$1',[over.id]),/USE_GUARDED_SEND/);await db.exec('RESET ROLE');
 }finally{await db.close();}
});
test('hot rate-limit calls do not delete old rows; scheduled cleanup and batch contexts have hard bounds',async()=>{
 const {db}=await fixture();try{
 await db.exec("INSERT INTO campaign_rate_limits SELECT 'expired-'||i,1,now()-interval '3 days' FROM generate_series(1,20)i");
 assert.equal((await db.query("SELECT campaign_rate_limit('key',2,60)ok")).rows[0].ok,true);assert.equal((await db.query("SELECT campaign_rate_limit('key',2,60)ok")).rows[0].ok,true);assert.equal((await db.query("SELECT campaign_rate_limit('key',2,60)ok")).rows[0].ok,false);
 assert.equal((await db.query("SELECT count(*)::int n FROM campaign_rate_limits WHERE key LIKE 'expired-%'")).rows[0].n,20);
 assert.equal((await db.query('SELECT cleanup_order_runtime(5)r')).rows[0].r.rates,5);assert.equal((await db.query("SELECT count(*)::int n FROM campaign_rate_limits WHERE key LIKE 'expired-%'")).rows[0].n,15);
 await assert.rejects(db.query('SELECT cleanup_order_runtime(1001)'),/INVALID_CLEANUP/);await assert.rejects(db.query('SELECT order_job_contexts($1)',[JSON.stringify(Array.from({length:11},()=>({id:randomUUID(),lease:randomUUID()})))]),/INVALID_CONTEXT_BATCH/);
 const source=(await db.query("SELECT prosrc FROM pg_proc WHERE proname='campaign_rate_limit'")).rows[0].prosrc;assert.ok(!/DELETE/i.test(source));
 // Bound cleanup with an indexable cutoff, rather than a volatile per-row clock predicate.
 await db.exec("INSERT INTO campaign_rate_limits SELECT 'live-'||i,1,now()+interval '3 days' FROM generate_series(1,20000)i;ANALYZE campaign_rate_limits");
 const plan=JSON.stringify((await db.query("EXPLAIN(FORMAT JSON)SELECT key FROM campaign_rate_limits WHERE expires_at<statement_timestamp()-interval '1 day' ORDER BY expires_at,key LIMIT 5")).rows);
 assert.match(plan,/Index Cond/);assert.match(plan,/campaign_rate_expiry/);
 }finally{await db.close();}
});
test('latency and request reporting retains only bounded numbers and fixed labels',async()=>{
 const m=workerMetrics();observeQuery(m,10,false);observeQuery(m,900,true);assert.equal(m.queries,2);assert.equal(m.query_errors,1);assert.equal(percentileBucket(m.buckets),'≤1 s');
 const request=measuredFetch((ms,failed)=>observeQuery(m,ms,failed),async()=>new Response('secret',{status:503}));await request('https://private.example/collection/SECRET');assert.equal(m.query_errors,2);assert.ok(!JSON.stringify(m).includes('SECRET'));
 const lines=[];const res=await observeWorkerRequest(async()=>new Response('secret',{status:401}),line=>lines.push(line));assert.equal(res.status,401);assert.equal(JSON.parse(lines[0]).failed,true);assert.ok(!lines[0].includes('secret'));
 const cursor=orderCursor({id:randomUUID(),created_at:'2026-10-26T12:00:00+00:00'});assert.ok(parseOrderCursor(cursor));assert.equal(parseOrderCursor('invalid'),null);assert.equal(parseOrderCursor('x'.repeat(181)),null);
});

test('capacity model includes all conditional emails, both scheduled workers and daily paginated exports without double-counting Edge',()=>{
 const row=capacityModel(2000);assert.equal(row.emailsPerOrder,17);assert.equal(row.routinePerOrder,4);assert.equal(row.totalEmails,34000);assert.equal(row.scheduledInvocations,86400);assert.equal(row.vercelInvocations,136400);assert.equal(row.edgeExportInvocations,1470);assert.equal(row.otpWaveTenMinuteRequiredHourly,12000);assert.ok(row.averageEmailsPerHour>40);assert.ok(row.vercelMeteredHighUsd>row.vercelMeteredLowUsd);
 assert.throws(()=>capacityModel(0));assert.throws(()=>capacityModel(1,{days:0}));
});

test('campaign confirmations and order jobs share provider capacity; disabled/gap/urgent reserves and metric bounds are enforced',async()=>{
 const {db,order,job}=await fixture();try{
 const oid=await order(),mail=randomUUID();
 await db.query("INSERT INTO email_deliveries(id,status,provider,attempted_at,metadata)VALUES($1,'sending','zoho',now(),$2)",[mail,JSON.stringify({_mail_outcome:"preparing"})]);
 const at=(await db.query('SELECT attempted_at FROM email_deliveries WHERE id=$1',[mail])).rows[0].attempted_at;
 const begin=()=>db.query('SELECT begin_campaign_mail_send($1,$2)s',[mail,at]);assert.equal((await begin()).rows[0].s,'deferred');
 await db.exec("UPDATE order_runtime_limits SET enabled=true,hourly_limit=2,reserved_urgent=1,reserved_security=0,minimum_gap_seconds=0 WHERE kind='email'");assert.equal((await begin()).rows[0].s,'allowed');assert.equal((await begin()).rows[0].s,'stale');
 const critical=await job(oid,'owner_otp');const claimed=(await db.query("SELECT * FROM claim_order_jobs_v2('email',10)")).rows;assert.ok(claimed.some(j=>j.id===critical));
 const c=claimed.find(j=>j.id===critical);assert.equal((await db.query('SELECT begin_order_job_send($1,$2,0)s',[c.id,c.lease_token])).rows[0].s,'allowed');assert.equal((await db.query("SELECT sum(hits)::int n FROM order_send_minutes WHERE kind='email'")).rows[0].n,2);
 await db.exec("UPDATE order_runtime_limits SET hourly_limit=40,reserved_urgent=10,minimum_gap_seconds=60 WHERE kind='email'");assert.equal((await db.query("SELECT * FROM claim_order_jobs_v2('email',10)")).rows.length,0);
 const m=workerMetrics();observeQuery(m,45,false);await db.query('SELECT record_order_worker_metrics($1,$2)',['email',JSON.stringify(m)]);const r=(await db.query('SELECT order_runtime_report()r')).rows[0].r;assert.equal(r.metrics[0].queries,1);assert.equal(r.metrics[0].buckets[1],1);
 await assert.rejects(db.query('SELECT order_job_contexts($1)',[JSON.stringify({secret:'not accepted'})]),/INVALID_CONTEXT_BATCH/);
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE')ok",[role,'consume_runtime_capacity(text,integer,timestamptz)'])).rows[0].ok,false);
 }finally{await db.close();}
});
