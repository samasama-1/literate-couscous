import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
const sql=await readFile(new URL('../database/sql/verified_batch_capacity.sql',import.meta.url),'utf8');
async function fixture({capacity=5,coupons=false,install=true}={}){
 const db=new PGlite({extensions:{pg_trgm}});try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,description text,retail_price numeric,image_url text,features jsonb);
 CREATE TABLE batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid REFERENCES products(id),status text DEFAULT 'OPEN',target_capacity integer NOT NULL,deposit_amount numeric,tier_1_price numeric,tier_2_price numeric,tier_3_price numeric,closes_at timestamptz DEFAULT now()+interval '1 day',created_at timestamptz DEFAULT now());
 CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code text,batch_id uuid REFERENCES batches(id),quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());`);
 const files=coupons?['add_campaign_lead_system','harden_campaign_lead_system','campaign_content_editor','order_fulfilment','order_integrations','collection_management','collection_named_authorisation','manual_balance_operations','collection_fee_safety_hold','campaign_discounts','batch_management','supabase_view_fix']:['order_fulfilment','order_integrations','batch_management','supabase_view_fix'];
 for(const file of files)await db.exec(await readFile(new URL(`../database/sql/${file}.sql`,import.meta.url),'utf8'));
 const product=(await db.query("INSERT INTO products(name,description,features)VALUES('Sample','Description','[]')RETURNING id")).rows[0].id;
 const batch=(await db.query('INSERT INTO batches(product_id,target_capacity,deposit_amount,tier_1_price,tier_2_price,tier_3_price)VALUES($1,$2,59.5,119,109,99)RETURNING id',[product,capacity])).rows[0].id;
 if(install){await db.exec(sql);await db.exec(sql);}
 let seq=0;
 const request=(quantity=1,email='buyer@example.test')=>({order_code:'SAMA-'+randomBytes(8).toString('hex').toUpperCase(),batch_id:batch,quantity,customer_name:'Buyer',customer_email:email,customer_phone:'+658'+String(++seq).padStart(7,'0'),address_line1:'12 Test Road',postal_code:'123456',fulfilment_method:'collection'});
 const register=async(quantity=1,email='buyer@example.test',hash=undefined)=>{
  const p=request(quantity,email);
  await db.query(hash===undefined?'SELECT register_batch_order($1)':'SELECT register_batch_order_discount($1,$2)',hash===undefined?[p]:[p,hash]);
  return(await db.query('SELECT * FROM orders WHERE order_code=$1',[p.order_code])).rows[0];
 };
 const verify=(o,amount=o.deposit_due_cents)=>db.query("SELECT order_operation_with_email($1,'deposit','admin@example.test',$2,$3,NULL,NULL)",[o.id,amount,'BANK-'+o.id]);
 const units=async()=>(await db.query('SELECT verified_units FROM batch_verified_capacity WHERE batch_id=$1',[batch])).rows[0].verified_units;
 const jobs=async(id)=>(await db.query("SELECT count(*)::int n FROM order_integration_jobs WHERE order_id=$1 AND kind='email' AND event='deposit_received'",[id])).rows[0].n;
 return{db,batch,product,request,register,verify,units,jobs};
 }catch(e){await db.close();throw e;}
}
test('pending requests reserve nothing; final-slot confirmations cannot exceed the cap or double count',async()=>{
 const{db,batch,register,verify,units,jobs}=await fixture();try{
 const a=await register(4),b=await register(4);assert.equal(await units(),0);
 assert.equal((await db.query('SELECT confirmed_quantity,remaining_capacity FROM batch_progress_view WHERE batch_id=$1',[batch])).rows[0].remaining_capacity,5);
 await assert.rejects(verify(a,1),/PAYMENT_MISMATCH/);assert.equal(await units(),0);
 // PGlite serializes promises; separate PostgreSQL sessions remain a rollout check.
 const results=await Promise.allSettled([verify(a),verify(b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(String(results.find(r=>r.status==='rejected').reason),/BATCH_CAPACITY_EXCEEDED/);assert.equal(await units(),4);
 const winner=(await jobs(a.id))?a:b,loser=winner===a?b:a;
 assert.equal(await jobs(winner.id),1);assert.equal(await jobs(loser.id),0);
 const held=(await db.query('SELECT payment_status,deposit_verified_at,payment_reference FROM orders WHERE id=$1',[loser.id])).rows[0];assert.equal(held.payment_status,'PENDING_PAYNOW');assert.equal(held.deposit_verified_at,null);assert.equal(held.payment_reference,null);
 assert.equal((await db.query('SELECT count(*)::int n FROM order_activity WHERE order_id=$1',[loser.id])).rows[0].n,0);
 await verify(winner);assert.equal(await units(),4);assert.equal(await jobs(winner.id),1);
 await assert.rejects(register(2),/BATCH_CAPACITY_EXCEEDED/);const last=await register(1);await verify(last);assert.equal(await units(),5);
 await assert.rejects(register(1),/BATCH_CAPACITY_EXCEEDED/);
 assert.equal((await db.query('SELECT remaining_capacity FROM batch_progress_view WHERE batch_id=$1',[batch])).rows[0].remaining_capacity,0);
 await db.exec(sql);assert.equal(await units(),5);assert.equal(await jobs(winner.id),1);
 }finally{await db.close();}
});
test('counter guards cover direct writes, capacity edits, refunds and new batches without public access',async()=>{
 const{db,batch,product,register,verify,units}=await fixture({capacity:3});try{
 const a=await register(2);await verify(a);const b=await register(1);
 await assert.rejects(db.query("UPDATE orders SET quantity=3 WHERE id=$1",[a.id]),/VERIFIED_ORDER_DETAILS_LOCKED/);
 await assert.rejects(db.query('UPDATE batches SET target_capacity=1 WHERE id=$1',[batch]),/BATCH_CAPACITY_TOO_LOW/);assert.equal(await units(),2);
 // Direct service-side writes cannot bypass the final capacity guard.
 await db.query('UPDATE orders SET quantity=2,deposit_due_cents=11900 WHERE id=$1',[b.id]);await assert.rejects(db.query("UPDATE orders SET payment_status='VERIFIED'WHERE id=$1",[b.id]),/BATCH_CAPACITY_EXCEEDED/);
 await db.query("UPDATE orders SET payment_status='REFUNDED'WHERE id=$1",[a.id]);assert.equal(await units(),0);await verify({...b,deposit_due_cents:11900});assert.equal(await units(),2);
 const other=(await db.query('INSERT INTO batches(product_id,target_capacity,deposit_amount,tier_1_price)VALUES($1,2,20,80)RETURNING id',[product])).rows[0].id;
 assert.equal((await db.query('SELECT verified_units FROM batch_verified_capacity WHERE batch_id=$1',[other])).rows[0].verified_units,0);
 await assert.rejects(db.query('UPDATE orders SET batch_id=$1 WHERE id=$2',[other,b.id]),/VERIFIED_ORDER_DETAILS_LOCKED/);
 for(const role of ['anon','authenticated','service_role']){
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3)ok',[role,'batch_verified_capacity',privilege])).rows[0].ok,false);
  for(const fn of ['sync_batch_capacity_limit()','guard_available_batch_capacity()','track_verified_batch_capacity()'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE')ok",[role,fn])).rows[0].ok,false);
 }
 await db.exec('SET ROLE anon');assert.equal((await db.query('SELECT confirmed_quantity FROM batch_progress_view WHERE batch_id=$1',[batch])).rows[0].confirmed_quantity,2);await assert.rejects(db.query('SELECT * FROM batch_verified_capacity'),/permission denied/);await db.exec('RESET ROLE');
 const helpers=(await db.query("SELECT pg_get_userbyid(proowner)owner,prosecdef,proconfig FROM pg_proc WHERE proname IN('sync_batch_capacity_limit','guard_available_batch_capacity','track_verified_batch_capacity')")).rows;
 for(const f of helpers){assert.equal(f.owner,'postgres');assert.equal(f.prosecdef,true);assert.ok(f.proconfig.includes('search_path=pg_catalog, pg_temp'));}
 }finally{await db.close();}
});
test('admin capacity edits ignore pending requests and migration refuses pre-existing overbooking',async()=>{
 const{db,batch,register}=await fixture();try{
 await register(4);await register(4);
 const payload={id:batch,revision:1,name:'Sample',description:'Description',features:[],target_capacity:2,deposit_cents:5950,tier_1_cents:11900,tier_2_cents:10900,tier_3_cents:9900,status:'OPEN',closes_at:'2099-01-01T00:00:00Z'};
 await db.query('SELECT admin_save_batch($1)',[payload]);assert.equal((await db.query('SELECT capacity FROM batch_verified_capacity WHERE batch_id=$1',[batch])).rows[0].capacity,2);
 }finally{await db.close();}
 const old=await fixture({capacity:1,install:false});try{
 const over=await old.register(2);await old.verify(over);await assert.rejects(old.db.exec(sql),/EXISTING_BATCH_OVER_CAPACITY/);await old.db.exec('ROLLBACK');
 assert.equal((await old.db.query("SELECT payment_status FROM orders WHERE id=$1",[over.id])).rows[0].payment_status,'VERIFIED');
 assert.equal((await old.db.query("SELECT to_regclass('public.batch_verified_capacity')t")).rows[0].t,null);
 }finally{await old.db.close();}
});
test('failed capacity verification rolls back reward redemption and queued notifications together',async()=>{
 const{db,batch,register,verify,units,jobs}=await fixture({capacity:1,coupons:true});try{
 const campaign=randomUUID(),option=randomUUID();await db.query("INSERT INTO campaigns(id,name,slug,status,is_test)VALUES($1,'Test','capacity-coupon','active',false)",[campaign]);await db.query("INSERT INTO campaign_products(id,campaign_id,public_name,estimated_price_cents)VALUES($1,$2,'Sample',11900)",[option,campaign]);await db.query("SELECT configure_campaign_discount(true,'admin@example.test')");
 const issue=async(email)=>{const hash=randomBytes(32).toString('hex');const candidate={id:randomUUID(),hash,token_hash:'b'.repeat(64),envelope:'a'.repeat(123)};
  await db.query('SELECT register_campaign_intent_discount($1,$2)',[{email,campaign_slug:'capacity-coupon',product_id:option,price_shown_cents:11900,currency:'SGD',purchase_intent:'yes',marketing_consent:false,session_id:randomUUID(),request_id:randomUUID(),attribution:{}},candidate]);return candidate;
 };
 const ca=await issue('a@example.test'),cb=await issue('b@example.test');const a=await register(1,'a@example.test',ca.hash),b=await register(1,'b@example.test',cb.hash);assert.equal(await units(),0);
 await verify(a);await assert.rejects(verify(b),/BATCH_CAPACITY_EXCEEDED/);
 assert.equal((await db.query('SELECT status FROM campaign_discount_codes WHERE id=$1',[cb.id])).rows[0].status,'reserved');assert.equal(await jobs(b.id),0);assert.equal(await units(),1);
 assert.equal((await db.query('SELECT confirmed_quantity FROM batch_progress_view WHERE batch_id=$1',[batch])).rows[0].confirmed_quantity,1);
 }finally{await db.close();}
});
