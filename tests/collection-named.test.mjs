import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
async function fixture(){
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TABLE batches(id uuid PRIMARY KEY,deposit_amount numeric);CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code text,batch_id uuid,quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());`);
 for(const f of ['order_fulfilment','order_integrations','collection_management','collection_named_authorisation'])await db.exec(await readFile(new URL(`../database/sql/${f}.sql`,import.meta.url),'utf8'));
 await db.exec('UPDATE collection_controls SET delegated_enabled=true');
 const batch=randomUUID();await db.query('INSERT INTO batches VALUES($1,50)',[batch]);
 const order=async()=>{const id=randomUUID();await db.query("INSERT INTO orders(id,order_code,batch_id,quantity,customer_name,customer_email,payment_status,deposit_due_cents,deposit_verified_at,final_total_cents,balance_due_cents,ready_at)VALUES($1,$2,$3,1,'Owner','owner@example.test','VERIFIED',5000,now(),5000,0,now())",[id,'SAMA-0123456789ABCDEF',batch]);return id;};
 const nominate=async(id,version=1)=>{const o=(await db.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];return (await db.query('SELECT set_named_collector($1,$2,$3,$4,$5,true,$6,false)id',[id,version,o.customer_email,o.ready_at,Math.floor(Date.now()/1000)+3600,'Collector'])).rows[0].id;};
 const fulfil=(id,aid)=>db.query("SELECT fulfil_order_named($1,'admin@example.test','Collector',$2,true)",[id,aid]);return{db,order,nominate,fulfil};
 }catch(e){await db.close();throw e;}
}
test('named authorisation rejects stale state, expired grants, unpaid orders and legacy handover bypasses',async()=>{
 const {db,order,nominate,fulfil}=await fixture();try{
 for(const mutation of ["customer_email='changed@example.test'","fulfilment_method='delivery'","payment_status='REFUNDED'","ready_at=ready_at+interval '1 second'"]){const id=await order(),aid=await nominate(id);await db.query(`UPDATE orders SET ${mutation} WHERE id=$1`,[id]);
 // A delivery order must not accept a collector authorisation through a collection handover.
 await assert.rejects(fulfil(id,aid),/COLLECTOR_NOT_AUTHORISED|ORDER_REFUNDED|NOT_READY/);
 }
 const id=await order(),aid=await nominate(id);
 await db.query("UPDATE order_collectors SET expires_at=now()-interval '1 second' WHERE order_id=$1",[id]);await assert.rejects(fulfil(id,aid),/COLLECTOR_NOT_AUTHORISED/);
 await db.query("UPDATE order_collectors SET expires_at=now()+interval '1 day' WHERE order_id=$1",[id]);
 await db.query('UPDATE orders SET balance_due_cents=5000,final_total_cents=10000,balance_paid_at=NULL WHERE id=$1',[id]);await assert.rejects(fulfil(id,aid),/NOT_READY/);
 assert.equal((await db.query('SELECT count(*)::int n FROM order_handover_checks WHERE order_id=$1',[id])).rows[0].n,0); // failed payment rolls back proof
 await assert.rejects(db.query("SELECT order_operation_with_email($1,'fulfil','admin@example.test',NULL,'Collector',NULL,NULL)",[id]),/NOT_READY|USE_VERIFIED_HANDOVER/);
 const roles=['anon','authenticated'];for(const role of roles)for(const f of ['set_named_collector(uuid,integer,text,timestamptz,bigint,boolean,text,boolean)','fulfil_order_named(uuid,text,text,uuid,boolean)','queue_collection_access(uuid,text)'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE')ok",[role,f])).rows[0].ok,false);
 for(const role of [...roles,'service_role'])assert.equal((await db.query("SELECT has_table_privilege($1,'order_handover_checks','INSERT')ok",[role])).rows[0].ok,false);
 const delivery=await order();await db.query("UPDATE orders SET fulfilment_method='delivery' WHERE id=$1",[delivery]);assert.equal((await db.query("SELECT fulfil_order_named($1,'admin@example.test','Delivery proof',NULL,false)s",[delivery])).rows[0].s,'collected');
 const cols=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='order_collectors'")).rows.map(r=>r.column_name);for(const absent of ['phone','code_hash','id_number','id_copy'])assert.ok(!cols.includes(absent));
 }finally{await db.close();}
});
test('owner mutation and notification are atomic, reissue is bounded and cleanup preserves active/held records',async()=>{
 const {db,order,nominate,fulfil}=await fixture();try{
 const id=await order();await db.exec("CREATE FUNCTION reject_notice()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.event='collector_changed'THEN RAISE EXCEPTION 'mock queue failure';END IF;RETURN NEW;END$$;CREATE TRIGGER reject_notice BEFORE INSERT ON order_integration_jobs FOR EACH ROW EXECUTE FUNCTION reject_notice()");
 await assert.rejects(nominate(id),/mock queue failure/);assert.equal((await db.query('SELECT collection_access_version v FROM orders WHERE id=$1',[id])).rows[0].v,1);assert.equal((await db.query('SELECT count(*)::int n FROM order_collectors')).rows[0].n,0);await db.exec('DROP TRIGGER reject_notice ON order_integration_jobs');
 const aid=await nominate(id);assert.equal((await db.query("SELECT count(*)::int n FROM order_integration_jobs WHERE order_id=$1 AND event='collector_changed'",[id])).rows[0].n,1);
 await db.query("SELECT queue_collection_access($1,'admin@example.test')",[id]);await assert.rejects(db.query("SELECT queue_collection_access($1,'admin@example.test')",[id]),/LINK_RECENTLY_QUEUED/);
 await fulfil(id,aid);const terminal=(await db.query('SELECT cleanup_after FROM order_collectors WHERE order_id=$1',[id])).rows[0].cleanup_after;assert.ok(Date.parse(terminal)>Date.now()+13*86400000);
 const active=await order();await nominate(active);await db.query("UPDATE order_collectors SET expires_at=now()-interval '1 day' WHERE order_id=$1",[active]);
 const held=await order(),heldAid=await nominate(held);await fulfil(held,heldAid);
 // Synthetic clock advancement through the indexed eligibility column; never production data.
 await db.query("UPDATE order_collectors SET cleanup_after=now()-interval '1 second',retention_hold=(order_id=$1) WHERE order_id=ANY($2::uuid[])",[held,[id,held]]);
 assert.equal((await db.query('SELECT cleanup_named_collectors(1)n')).rows[0].n,1);assert.equal((await db.query('SELECT cleanup_named_collectors(1)n')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM order_collectors')).rows[0].n,2);assert.equal((await db.query('SELECT count(*)::int n FROM order_handover_checks')).rows[0].n,2);
 assert.equal((await db.query("SELECT has_function_privilege('service_role','cleanup_named_collectors(integer)','EXECUTE')ok")).rows[0].ok,false);
 await assert.rejects(db.query('SELECT cleanup_named_collectors(1001)'),/INVALID_CLEANUP/);
 }finally{await db.close();}
});
