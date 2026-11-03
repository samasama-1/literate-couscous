// Synthetic embedded PostgreSQL only. No network, no credentials, no provider calls.
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const results=[];
const extraEvents=['deposit_received','balance_requested','balance_paid','ready','owner_otp','owner_otp','collector_authorised','deposit_reminder','balance_reminder','collection_reminder','deadline_warning','deadline_warning',...Array(6).fill('campaign_update')];
async function timed(fn,n=5){const ms=[];for(let i=0;i<n;i++){const start=performance.now();await fn();ms.push(performance.now()-start);}ms.sort((a,b)=>a-b);return {p50_ms:+ms[Math.floor(n/2)].toFixed(2),p95_ms:+ms[Math.ceil(n*.95)-1].toFixed(2)};}
function nodes(plan){return [plan['Node Type'],...(plan.Plans||[]).flatMap(nodes)];}
for(const orders of [100,500,1000,2000]){
 const db=new PGlite({extensions:{pg_trgm}});
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TABLE products(id uuid PRIMARY KEY,name text,image_url text);CREATE TABLE batches(id uuid PRIMARY KEY,product_id uuid,deposit_amount numeric,status text DEFAULT 'OPEN',closes_at timestamptz DEFAULT now()+interval '1 day');CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code text,batch_id uuid,quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());CREATE TABLE email_deliveries(id uuid PRIMARY KEY,status text,provider text,attempted_at timestamptz,metadata jsonb NOT NULL DEFAULT '{}');CREATE TABLE campaign_rate_limits(key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);`);
 for(const file of ['order_fulfilment','order_integrations','collection_management','order_operations_runtime'])await db.exec(await readFile(new URL(`../database/sql/${file}.sql`,import.meta.url),'utf8'));
 const batch=randomUUID(),product=randomUUID();await db.query("INSERT INTO products VALUES($1,'Synthetic product','/product.png')",[product]);await db.query('INSERT INTO batches(id,product_id,deposit_amount)VALUES($1,$2,50)',[batch,product]);
 await db.query("INSERT INTO orders(order_code,batch_id,quantity,payment_status,customer_name,customer_email)SELECT 'SAMA-'||upper(substr(md5(i::text),1,16)),$1,1,'PENDING_PAYNOW','Synthetic owner','owner@example.test'FROM generate_series(1,$2)i",[batch,orders]);
 await db.query("INSERT INTO order_integration_jobs(order_id,kind,event)SELECT o.id,'email',e FROM orders o CROSS JOIN unnest($1::text[])e",[extraEvents]);
 await db.exec("INSERT INTO order_integration_jobs(order_id,kind,event)SELECT o.id,'crm',e FROM orders o CROSS JOIN unnest(ARRAY['deposit_received','balance_requested','balance_paid','ready','fulfilled'])e;INSERT INTO campaign_rate_limits SELECT 'expired-'||i,1,now()-interval '3 days' FROM generate_series(1,20000)i;ANALYZE order_integration_jobs;ANALYZE orders;ANALYZE campaign_rate_limits;");
 const reportLatency=await timed(()=>db.query('SELECT order_runtime_report()'));
 const rateLatency=await timed(()=>db.query("SELECT campaign_rate_limit('synthetic',1000,600)"),20);
 const keysetLatency=await timed(()=>db.query('SELECT id,order_code FROM orders ORDER BY created_at DESC,id DESC LIMIT 51'));
 const plan=(await db.query("EXPLAIN(FORMAT JSON)SELECT id FROM order_integration_jobs WHERE kind='email' AND lane='lifecycle' AND priority=1 AND status='queued' AND available_at<=now()ORDER BY available_at,id LIMIT 150")).rows[0]['QUERY PLAN'][0].Plan;
 await db.exec("UPDATE order_runtime_limits SET enabled=true,hourly_limit=500,reserved_urgent=125,reserved_security=50,minimum_gap_seconds=0 WHERE kind='email'");
 const start=performance.now(),claimed=(await db.query("SELECT * FROM claim_order_jobs_v2('email',10)")).rows;const claimMs=performance.now()-start;
 const contexts=await timed(()=>db.query('SELECT order_job_contexts($1)',[JSON.stringify(claimed.map(j=>({id:j.id,lease:j.lease_token})))]));
 results.push({orders,queue_jobs:(await db.query('SELECT count(*)::int n FROM order_integration_jobs')).rows[0].n,queue_counter_rows:(await db.query('SELECT count(*)::int n FROM order_queue_counts')).rows[0].n,
 reportLatency,rateLatency,keysetLatency,claim_ms:+claimMs.toFixed(2),claimed:claimed.length,contextBatchLatency:contexts,candidatePlanNodes:nodes(plan),
 expired_rate_rows_remaining:(await db.query("SELECT count(*)::int n FROM campaign_rate_limits WHERE key LIKE 'expired-%'")).rows[0].n,
 queue_total_bytes:Number((await db.query("SELECT pg_total_relation_size('order_integration_jobs') bytes")).rows[0].bytes)});
 }finally{await db.close();}
}
console.log(JSON.stringify({scope:'local in-memory PGlite; no network/provider/multi-session load; five samples (rate:20); cold/WASM effects included',results},null,2));
