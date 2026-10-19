import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('warehouse SQL includes approved contact fields and excludes address/reference data for ALL orders and preserves handover safeguards',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE products(id uuid PRIMARY KEY,name text);
   CREATE TABLE batches(id uuid PRIMARY KEY,product_id uuid,deposit_amount numeric,status text,closes_at timestamptz);
   CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code varchar(12),batch_id uuid,quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());`);
  await db.exec(await readFile(new URL('../database/sql/order_fulfilment.sql',import.meta.url),'utf8'));
  const migration=await readFile(new URL('../database/sql/operations_export.sql',import.meta.url),'utf8');
  await db.exec(migration);
  const batch=randomUUID(),product=randomUUID();
  await db.query("INSERT INTO products VALUES($1,'Product example')",[product]);
  await db.query('INSERT INTO batches(id,product_id) VALUES($1,$2)',[batch,product]);
  const time='2026-10-15T00:00:00.000Z';
  const variants=[
   ['ready',{},'ready_for_handover'],
   ['pending',{payment_status:'PENDING_PAYNOW'},'not_cleared'],
   ['balance_unpaid',{balance_paid_at:null},'not_cleared'],
   ['already_collected',{fulfilled_at:time},'fulfilled'],
   ['delivery',{fulfilment_method:'delivery'},'ready_for_handover'],
   ['refunded',{payment_status:'REFUNDED',fulfilled_at:time},'refunded'],
   ['legacy',{deposit_due_cents:null},'not_cleared'],
   ['inconsistent',{final_total_cents:15001},'not_cleared'],
   ['zero_balance',{final_total_cents:5000,balance_due_cents:0,balance_paid_at:null},'ready_for_handover'],
   ['not_ready',{ready_at:null},'not_cleared'],
   ['large_inconsistent',{deposit_due_cents:2147483647,balance_due_cents:2147483647,final_total_cents:1},'not_cleared'],
   ['missing_code',{order_code:null},'not_cleared'],
   ['missing_quantity',{quantity:null},'not_cleared'],
  ];
  for(const [code,overrides] of variants) {
   const order={id:randomUUID(),order_code:code,batch_id:batch,quantity:2,
    customer_name:'Warehouse Customer',customer_email:'operations@example.test',customer_phone:'+6580000000',
    address_line1:'EXCLUDED_ADDRESS',address_line2:'EXCLUDED_UNIT',postal_code:'012345',
    payment_reference:'EXCLUDED_DEPOSIT_REF',balance_reference:'EXCLUDED_BALANCE_REF',balance_token_hash:'EXCLUDED_TOKEN_'+code,
    received_by:'EXCLUDED_RECIPIENT',fulfilled_by:'EXCLUDED_STAFF',deposit_verified_by:'EXCLUDED_VERIFIER',
    fulfilment_method:'collection',payment_status:'VERIFIED',deposit_due_cents:5000,deposit_verified_at:time,
    final_total_cents:15000,balance_due_cents:10000,balance_requested_at:time,balance_paid_at:time,ready_at:time,
    ...overrides};
   const columns=Object.keys(order);
   await db.query(`INSERT INTO public.orders(${columns.join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(order));
   await db.query("INSERT INTO public.order_activity(order_id,action,actor,metadata) VALUES($1,'deposit','EXCLUDED_ACTOR',$2)",[
    order.id,JSON.stringify({amount_cents:5000,final_total_cents:15000,balance_due_cents:10000,
     reference:'EXCLUDED_ACTIVITY_REF',received_by:'EXCLUDED_RECIPIENT',method:'EXCLUDED_METADATA_METHOD',other:'EXCLUDED_ARBITRARY'})]);
   await db.query("INSERT INTO public.order_activity(order_id,action,actor,metadata) VALUES($1,'fulfil','EXCLUDED_ACTOR',$2)",[
    order.id,JSON.stringify({amount_cents:'EXCLUDED_IN_AMOUNT',final_total_cents:'EXCLUDED_IN_TOTAL',balance_due_cents:'EXCLUDED_IN_BALANCE'})]);
   await db.query("INSERT INTO public.order_activity(order_id,action,actor) VALUES($1,'EXCLUDED_UNKNOWN_ACTION','EXCLUDED_ACTOR')",[order.id]);
  }
  const before=(await db.query('SELECT to_jsonb(o) AS row FROM public.orders o ORDER BY order_code')).rows;
  const id=randomUUID();
  const manifest=(await db.query('SELECT public.start_operations_export($1) AS s',[id])).rows[0].s;
  assert.equal(manifest.schema_version,3);assert.equal(manifest.profile,'warehouse_v3');
  assert.equal(manifest.orders,variants.length);assert.equal(manifest.activity,variants.length*2);
  const page=async kind=>(await db.query('SELECT public.page_operations_export($1,$2) AS p',[id,kind])).rows[0].p;
  const orders=(await page('orders')).rows,activity=(await page('activity')).rows;
  const serialized=JSON.stringify({orders,activity});
  assert.ok(!JSON.stringify(activity).includes('operations@example.test'));
  assert.ok(!JSON.stringify(activity).includes('+6580000000'));
  for(const forbidden of ['EXCLUDED_','012345','b'.repeat(64)]) assert.ok(!serialized.includes(forbidden),forbidden);
  for(const [code,overrides,clearance] of variants){
   const row=orders.find(r=>r[0]===(Object.hasOwn(overrides,'order_code')?overrides.order_code:code));
   assert.equal(row.length,19);assert.equal(row[1],batch);assert.equal(row[2],'Product example');
   assert.equal(row[3],'Warehouse Customer');assert.equal(row[17],'operations@example.test');assert.equal(row[18],'+6580000000');assert.equal(row[5],Object.hasOwn(overrides,'quantity')?overrides.quantity:2);assert.equal(row[16],clearance);
  }
  const ready=orders.find(r=>r[0]==='ready');
  assert.equal(ready[6],'VERIFIED');assert.equal(ready[7],5000);assert.ok(ready[8]);
  assert.equal(ready[9],15000);assert.equal(ready[10],10000);assert.ok(ready[12]);assert.ok(ready[13]);
  assert.ok(orders.find(r=>r[0]==='already_collected')[14]);
  for(const row of activity){assert.equal(row.length,7);assert.ok(['deposit','fulfil'].includes(row[1]));
   if(row[1]==='deposit') assert.deepEqual(row.slice(3,6),[5000,15000,10000]);
   else assert.deepEqual(row.slice(3,6),[null,null,null]);
  }
  assert.deepEqual((await db.query('SELECT to_jsonb(o) AS row FROM public.orders o ORDER BY order_code')).rows,before);

  // Simulate pre-policy stored data: no relabeling, replay or automatic deletion.
  const legacy=randomUUID();
  await db.query('INSERT INTO public.operations_export_snapshots(id) VALUES($1)',[legacy]);
  await db.query("INSERT INTO public.operations_export_rows VALUES($1,'orders',1,$2)",[legacy,JSON.stringify(['EXCLUDED_LEGACY_EMAIL'])]);
  await db.exec(migration); // rerunning must not bless old snapshots as version 3
  await assert.rejects(db.query('SELECT public.start_operations_export($1)',[legacy]),/EXPORT_SCHEMA_CHANGED/);
  await assert.rejects(db.query("SELECT public.page_operations_export($1,'orders')",[legacy]),/EXPORT_SCHEMA_CHANGED/);
  assert.equal((await db.query('SELECT schema_version FROM public.operations_export_snapshots WHERE id=$1',[legacy])).rows[0].schema_version,1);
  assert.deepEqual((await db.query('SELECT data FROM public.operations_export_rows WHERE snapshot_id=$1',[legacy])).rows[0].data,['EXCLUDED_LEGACY_EMAIL']);
  await db.query('UPDATE public.operations_export_snapshots SET schema_version=2 WHERE id=$1',[legacy]);
  await assert.rejects(db.query('SELECT public.start_operations_export($1)',[legacy]),/EXPORT_SCHEMA_CHANGED/);
  await assert.rejects(db.query("SELECT public.page_operations_export($1,'orders')",[legacy]),/EXPORT_SCHEMA_CHANGED/);
  assert.deepEqual((await db.query('SELECT public.start_operations_export($1) AS s',[id])).rows[0].s,manifest);
 } finally {await db.close();}
});
