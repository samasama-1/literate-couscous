import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {batchPricing,pricingConfigured,launchBatchPresets} from '../src/lib/batches/pricing.ts';
const sql=await readFile(new URL('../database/sql/batch_pricing_rules.sql',import.meta.url),'utf8');
test('approved product ranges, tier boundaries and minimums use exact verified units',()=>{
 const approved={studio:[119,109,99,59.5,423,424,713,1000],everyday:[109,99,89,54.5,448,449,725,1000],single:[219,209,199,109.5,461,462,783,1103],double:[229,219,209,114.5,490,491,801,1109]};
 for(const [key,p] of Object.entries(launchBatchPresets)){
  const [p1,p2,p3,deposit,min,s2,s3,cap]=approved[key];
  assert.deepEqual([Number(p.tier_1_price),Number(p.tier_2_price),Number(p.tier_3_price),Number(p.deposit_amount),Number(p.minimum_verified_units),Number(p.tier_2_start),Number(p.tier_3_start),Number(p.target_capacity)],approved[key]);
  assert.equal(deposit,p1/2);
  const b={...p,target_capacity:cap,minimum_verified_units:min,tier_2_start:s2,tier_3_start:s3,tier_1_price:p1,tier_2_price:p2,tier_3_price:p3};
  for(const n of [0,1,min-1,min,min+1,s2-1,s2,s2+1,s3-1,s3,s3+1,cap]){
   const result=batchPricing(b,n);assert.ok(result);assert.equal(result.current.price,n>=s3?p3:n>=s2?p2:p1);assert.equal(result.minimumMet,n>=min);assert.equal(result.unitsToMinimum,Math.max(0,min-n));
  }
  assert.deepEqual(batchPricing(b,0).tiers.map(t=>[t.start,t.end]),[[1,s2-1],[s2,s3-1],[s3,cap]]);
  assert.equal(batchPricing(b,s2-1).next.start,s2);assert.equal(batchPricing(b,s2).next.start,s3);assert.equal(batchPricing(b,s3).next,undefined);
 }
 const one={target_capacity:5,minimum_verified_units:3,tier_1_price:80,tier_2_price:null,tier_3_price:null};assert.equal(pricingConfigured(one),true);assert.equal(batchPricing(one,5).tiers[0].end,5);
 for(const change of [{minimum_verified_units:null},{minimum_verified_units:6},{minimum_verified_units:0},{tier_2_price:70,tier_2_start:1},{tier_2_start:3},{tier_2_price:70,tier_2_start:2,tier_3_price:60,tier_3_start:2}])assert.equal(pricingConfigured({...one,...change}),false);
 assert.equal(batchPricing(one,NaN),null);
});
async function fixture(){
 const db=new PGlite({extensions:{pg_trgm}});
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,description text,retail_price numeric,image_url text,features jsonb);
  CREATE TABLE batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid REFERENCES products(id),status text DEFAULT 'OPEN',target_capacity integer NOT NULL,deposit_amount numeric,tier_1_price numeric,tier_2_price numeric,tier_3_price numeric,closes_at timestamptz DEFAULT now()+interval '1 day',created_at timestamptz DEFAULT now());
  CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code text,batch_id uuid REFERENCES batches(id),quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());`);
  for(const f of ['add_campaign_lead_system','harden_campaign_lead_system','campaign_content_editor','order_fulfilment','order_integrations','collection_management','collection_named_authorisation','manual_balance_operations','collection_fee_safety_hold','campaign_discounts','batch_management','supabase_view_fix','verified_batch_capacity'])await db.exec(await readFile(new URL(`../database/sql/${f}.sql`,import.meta.url),'utf8'));
  const legacy=(await db.query("INSERT INTO batches(target_capacity,deposit_amount,tier_1_price,tier_2_price,tier_3_price)VALUES(10,50,100,90,80)RETURNING id")).rows[0].id;
  const legacyOrder=(await db.query("INSERT INTO orders(order_code,batch_id,quantity,payment_status,customer_name,customer_phone,customer_email,deposit_due_cents)VALUES($1,$2,1,'PENDING_PAYNOW','Existing buyer','+6580000000','existing@example.test',5000)RETURNING *",['SAMA-'+randomBytes(8).toString('hex').toUpperCase(),legacy])).rows[0];
  await db.exec(sql);await db.exec(sql);
  const payload={name:'Sample',description:'Sample description',features:[],retail_price_cents:null,target_capacity:10,minimum_verified_units:3,tier_2_start:4,tier_3_start:8,deposit_cents:5000,tier_1_cents:10000,tier_2_cents:9000,tier_3_cents:8000,status:'OPEN',closes_at:'2099-01-01T00:00:00Z'};
  const save=async p=>(await db.query('SELECT admin_save_batch($1)id',[p])).rows[0].id;
  const batch=await save(payload);
  const register=async(qty=1,bid=batch)=>{
   const code='SAMA-'+randomBytes(8).toString('hex').toUpperCase();
   await db.query('SELECT register_batch_order_discount($1,NULL)',[{order_code:code,batch_id:bid,quantity:qty,customer_name:'Buyer',customer_phone:'+658'+randomBytes(4).toString('hex'),customer_email:'buyer@example.test',address_line1:'Sample road',postal_code:'123456',fulfilment_method:'collection'}]);
   return(await db.query('SELECT * FROM orders WHERE order_code=$1',[code])).rows[0];
  };
  const verify=o=>db.query("SELECT order_operation_with_email($1,'deposit','admin@example.test',$2,$3,NULL,NULL)",[o.id,o.deposit_due_cents,'BANK-'+o.id]);
  const approve=(revision=1,actor='admin@example.test')=>db.query('SELECT admin_approve_batch($1,$2,$3)result',[batch,revision,actor]);
  return{db,batch,legacy,legacyOrder,payload,save,register,verify,approve};
 }catch(e){await db.close();throw e;}
}
test('SQL rejects invalid configurations and protects historical terms, limits and registration paths',async()=>{
 const{db,batch,legacy,legacyOrder,payload,save,register,verify}=await fixture();try{
  for(const changes of [{minimum_verified_units:null},{minimum_verified_units:0},{minimum_verified_units:11},{minimum_verified_units:'1.5'},{tier_2_start:1},{tier_2_start:null},{tier_3_start:4},{tier_3_start:11},{tier_2_cents:null}])await assert.rejects(save({...payload,...changes}),/INVALID_BATCH_PRICING|INVALID_PRICES/);
  await assert.rejects(register(1,legacy),/BATCH_PRICING_UNCONFIGURED/);
  // No new legacy requests, but existing recorded payments/quotes still work.
  await verify(legacyOrder);
  const historical=(await db.query('SELECT balance_revision FROM orders WHERE id=$1',[legacyOrder.id])).rows[0];
  await db.query('SELECT quote_order_discount($1,$2,10000,0,$3)',[legacyOrder.id,historical.balance_revision,'admin@example.test']);
  assert.equal((await db.query('SELECT final_total_cents FROM orders WHERE id=$1',[legacyOrder.id])).rows[0].final_total_cents,10000);
  await register(10);await register(10);
  assert.equal((await db.query('SELECT confirmed_quantity FROM batch_progress_view WHERE batch_id=$1',[batch])).rows[0].confirmed_quantity,0);
  await assert.rejects(save({...payload,id:batch,revision:1,tier_2_start:5}),/BATCH_PRICING_LOCKED/);
  await assert.rejects(save({...payload,id:batch,revision:1,minimum_verified_units:2}),/BATCH_PRICING_LOCKED/);
  await assert.rejects(save({...payload,id:batch,revision:1,target_capacity:7}),/INVALID_BATCH_PRICING/);
  await save({...payload,id:batch,revision:1,name:'Content still editable'});
  assert.equal((await db.query('SELECT admin_revision FROM batches WHERE id=$1',[batch])).rows[0].admin_revision,2);
  await assert.rejects(db.query('UPDATE batches SET proceed_approved_at=now(),proceed_verified_units=1 WHERE id=$1',[batch]),/USE_BATCH_APPROVAL/);
 }finally{await db.close();}
});
test('proceed approval requires current verified minimum, is idempotent and gates both quote paths without sending mail',async()=>{
 const{db,batch,payload,register,verify,approve}=await fixture();try{
  const a=await register(2),b=await register(1);await verify(a);
  await assert.rejects(approve(),/BATCH_MINIMUM_NOT_MET/);
  const quote=()=>db.query('SELECT quote_order_discount($1,$2,10000,0,$3)',[a.id,a.balance_revision+1,'admin@example.test']);
  await assert.rejects(quote(),/BATCH_PROCEED_REQUIRED/);
  await verify(b);
  await assert.rejects(approve(99),/BATCH_CHANGED/);await assert.rejects(approve(1,''),/INVALID_ACTOR/);
  const before=(await db.query('SELECT count(*)::int n FROM order_integration_jobs')).rows[0].n;
  const results=await Promise.all([approve(),approve()]);assert.deepEqual(results.map(r=>r.rows[0].result).sort(),['already_approved','approved']);
  assert.equal((await db.query('SELECT count(*)::int n FROM batch_proceed_approvals')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM order_integration_jobs')).rows[0].n,before);
  const current=(await db.query('SELECT * FROM orders WHERE id=$1',[a.id])).rows[0];
  await db.query('SELECT quote_order_discount($1,$2,10000,0,$3)',[a.id,current.balance_revision,'admin@example.test']);
  assert.equal((await db.query('SELECT final_total_cents FROM orders WHERE id=$1',[a.id])).rows[0].final_total_cents,20000);
  // Falling below the minimum retains the audit, but new/revised quotes stop.
  await db.query("UPDATE orders SET payment_status='REFUNDED' WHERE id=$1",[b.id]);
  const revised=(await db.query('SELECT balance_revision FROM orders WHERE id=$1',[a.id])).rows[0].balance_revision;
  await assert.rejects(db.query('SELECT admin_balance_operation($1,$2,$3,$4,$5,NULL,false)',[a.id,'set_total',revised,'admin@example.test',19000]),/BATCH_PROCEED_REQUIRED/);
  await assert.rejects(db.query('UPDATE orders SET final_total_cents=19000 WHERE id=$1',[a.id]),/BATCH_PROCEED_REQUIRED/);
  assert.equal((await db.query('SELECT final_total_cents FROM orders WHERE id=$1',[a.id])).rows[0].final_total_cents,20000);
  const state=(await db.query('SELECT * FROM batches WHERE id=$1',[batch])).rows[0];assert.ok(state.proceed_approved_at);assert.equal(state.proceed_verified_units,3);assert.equal(state.status,'OPEN');assert.equal(Number(state.tier_1_price),payload.tier_1_cents/100);
  await db.exec(sql);assert.equal((await db.query('SELECT count(*)::int n FROM batch_proceed_approvals')).rows[0].n,1);
 }finally{await db.close();}
});
test('pricing and approval helpers keep safe ownership/privileges and the public view excludes the admin identity',async()=>{
 const{db,batch}=await fixture();try{
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await db.query("SELECT has_table_privilege($1,'public.batch_proceed_approvals','SELECT')ok",[role])).rows[0].ok,false);
   for(const fn of ['guard_batch_pricing_rules()','guard_order_batch_pricing()'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE')ok",[role,fn])).rows[0].ok,false);
   assert.equal((await db.query("SELECT has_function_privilege($1,'public.admin_approve_batch(uuid,integer,text)','EXECUTE')ok",[role])).rows[0].ok,role==='service_role');
  }
  const helpers=(await db.query("SELECT pg_get_userbyid(proowner)owner,proconfig,prosecdef FROM pg_proc WHERE proname IN('guard_batch_pricing_rules','guard_order_batch_pricing','admin_approve_batch','admin_save_batch')")).rows;
  for(const f of helpers){assert.equal(f.owner,'postgres');assert.equal(f.prosecdef,true);assert.ok(f.proconfig.includes('search_path=pg_catalog, pg_temp'));}
  await db.exec('SET ROLE anon');const view=(await db.query('SELECT * FROM batch_progress_view WHERE batch_id=$1',[batch])).rows[0];assert.equal(view.tier_2_start,4);assert.equal(view.minimum_verified_units,3);assert.ok(!('actor'in view));await assert.rejects(db.query('SELECT * FROM batch_proceed_approvals'),/permission denied/);await db.exec('RESET ROLE');
 }finally{await db.close();}
});
