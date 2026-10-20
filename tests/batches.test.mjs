import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {parseBatch,publicBatchUrl} from '../src/lib/batches/validation.ts';
const fields={name:'Sample dryer',description:'A sample product',image_url:'/campaign-products/hairdryer-a.webp',features:'Fast drying\nCompact',retail_price:'149',target_capacity:'50',deposit_amount:'20',tier_1_price:'109',tier_2_price:'99',tier_3_price:'89',closes_at:'2099-10-20T18:00',status:'OPEN'};
const form=(change={})=>{const f=new FormData();for(const [k,v] of Object.entries({...fields,...change}))f.set(k,String(v));return f;};
test('batch validation handles exact cents, optional zero prices and Singapore closing times',()=>{
 const p=parseBatch(form());assert.equal(p.deposit_cents,2000);assert.equal(p.tier_1_cents,10900);assert.equal(p.closes_at,'2099-10-20T10:00:00.000Z');assert.deepEqual(p.features,['Fast drying','Compact']);
 assert.equal(parseBatch(form({retail_price:'0',tier_2_price:'',tier_3_price:''})).retail_price_cents,0);
 for(const changes of [{tier_2_price:'120'},{tier_3_price:'0'},{deposit_amount:'90'},{tier_1_price:'1.001'},{target_capacity:'1.5'},{image_url:'javascript:alert(1)'},{image_url:'//evil.example/image.png'},{image_url:'https://user:pass@example.com/image.png'},{closes_at:'2099-02-31T12:00'},{status:'DRAFT'}])assert.throws(()=>parseBatch(form(changes)));
 assert.equal(publicBatchUrl('00000000-0000-4000-8000-000000000001','https://www.samasama.sg/admin'),'https://www.samasama.sg/group-buys/00000000-0000-4000-8000-000000000001');
 assert.throws(()=>publicBatchUrl('bad','https://www.samasama.sg'));
 assert.throws(()=>publicBatchUrl('00000000-0000-4000-8000-000000000001','javascript:alert(1)'));
});
test('batch RPCs are atomic, revision-checked, service-only and preserve customer orders',async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,description text NOT NULL,retail_price numeric,image_url text,features jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid REFERENCES products(id),status text CHECK(status IN ('OPEN','CLOSED','DELIVERED')),target_capacity integer,current_deposits integer DEFAULT 0,deposit_amount numeric,tier_1_price numeric,tier_2_price numeric,tier_3_price numeric,closes_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid REFERENCES batches(id),quantity integer,payment_status text,fulfilled_at timestamptz);`);
 const sql=await readFile(new URL('../database/sql/batch_management.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const payload=parseBatch(form());
 const save=async p=>(await db.query('SELECT public.admin_save_batch($1::jsonb) AS id',[JSON.stringify(p)])).rows[0].id;
 const del=(id,revision,confirm='DELETE')=>db.query('SELECT public.admin_delete_empty_batch($1,$2,$3)',[id,revision,confirm]);
 const id=await save(payload);assert.ok(id);let b=(await db.query('SELECT * FROM batches WHERE id=$1',[id])).rows[0];
 assert.equal(Number(b.deposit_amount),20);assert.equal(b.admin_revision,1);
 const updated={...payload,id,revision:1,name:'Updated product',status:'CLOSED'};await save(updated);
 assert.equal((await db.query('SELECT admin_revision FROM batches WHERE id=$1',[id])).rows[0].admin_revision,2);
 await assert.rejects(save(updated),/BATCH_CHANGED/);
 await assert.rejects(del(id,1),/BATCH_CHANGED/);await assert.rejects(del(id,2,'wrong'),/DELETE_CONFIRMATION_REQUIRED/);
 // Share the product across two batches; edits must not change the other batch's product.
 b=(await db.query('SELECT * FROM batches WHERE id=$1',[id])).rows[0];
 const sibling=(await db.query("INSERT INTO batches(product_id,status,target_capacity,deposit_amount,tier_1_price,closes_at) VALUES($1,'CLOSED',50,20,109,now()) RETURNING id",[b.product_id])).rows[0].id;
 await save({...updated,revision:2,name:'Isolated edit'});
 assert.equal((await db.query('SELECT name FROM products WHERE id=(SELECT product_id FROM batches WHERE id=$1)',[sibling])).rows[0].name,'Updated product');
 assert.equal((await db.query('SELECT name FROM products WHERE id=(SELECT product_id FROM batches WHERE id=$1)',[id])).rows[0].name,'Isolated edit');
 await db.query("INSERT INTO orders(batch_id,quantity,payment_status) VALUES($1,3,'PENDING_PAYNOW')",[id]);
 const booked={...payload,id,revision:3,status:'CLOSED'};
 await assert.rejects(save({...booked,deposit_cents:2100}),/BATCH_PRICES_LOCKED/);
 await assert.rejects(save({...booked,tier_1_cents:11000}),/BATCH_PRICES_LOCKED/);
 await assert.rejects(save({...booked,target_capacity:2}),/BATCH_CAPACITY_TOO_LOW/);
 await assert.rejects(save({...booked,status:'DELIVERED'}),/BATCH_OUTSTANDING_ORDERS/);
 await assert.rejects(del(id,3),/BATCH_HAS_ORDERS/);
 await save({...booked,name:'Content update allowed'});
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM orders WHERE batch_id=$1',[id])).rows[0].n,1);
 await db.query("UPDATE orders SET payment_status='REFUNDED' WHERE batch_id=$1",[id]);await assert.rejects(del(id,4),/BATCH_HAS_ORDERS/);
 await del(sibling,1);assert.equal((await db.query('SELECT count(*)::integer AS n FROM products')).rows[0].n,2);
 // Force a failure after the product INSERT to verify atomic create rollback.
 await db.exec("CREATE FUNCTION reject_batch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_BATCH_FAILURE'; END $$; CREATE TRIGGER fail_insert BEFORE INSERT ON batches FOR EACH ROW EXECUTE FUNCTION reject_batch();");
 const before=(await db.query('SELECT count(*)::integer AS n FROM products')).rows[0].n;
 await assert.rejects(save(payload),/TEST_BATCH_FAILURE/);assert.equal((await db.query('SELECT count(*)::integer AS n FROM products')).rows[0].n,before);
 for(const role of ['anon','authenticated'])for(const fn of ['admin_save_batch(jsonb)','admin_delete_empty_batch(uuid,integer,text)'])assert.equal((await db.query(`SELECT has_function_privilege('${role}','public.${fn}','EXECUTE') AS ok`)).rows[0].ok,false);
 assert.equal((await db.query("SELECT has_function_privilege('service_role','public.admin_save_batch(jsonb)','EXECUTE') AS ok")).rows[0].ok,true);
 const definitions=(await db.query("SELECT proconfig,pg_get_userbyid(proowner) AS owner,prosecdef FROM pg_proc WHERE proname IN ('admin_save_batch','admin_delete_empty_batch')")).rows;
 for(const fn of definitions){assert.equal(fn.owner,'postgres');assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=pg_catalog, pg_temp']);}
 // A temporary relation must not shadow the public batch table.
 await db.exec('CREATE TEMP TABLE batches(id uuid);');await assert.rejects(save({...booked,revision:1}),/BATCH_CHANGED/);
 await db.close();
});

test('batch server actions authorize before RPC and reject forged forms and unsafe deletion',async()=>{
 const ts=(await import('typescript')).default;
 const vm=(await import('node:vm')).default;
 const validation={parseBatch,uuid:/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i};
 let allowed=false;const calls=[],invalidations=[];let rpcError=null;
 const id='00000000-0000-4000-8000-000000000001';
 const imports={'@/lib/adminAuth':{verifyAdminAccess:async()=>{if(!allowed)throw Error('PRIVATE_ADMIN');}},'@/lib/supabaseAdmin':{supabaseAdmin:{rpc:async(name,args)=>{calls.push({name,args});return {data:id,error:rpcError};}}},'next/cache':{revalidatePath:p=>invalidations.push(p)},'next/navigation':{redirect:()=>{throw Error('TEST_REDIRECT');}},'@/lib/batches/validation':validation};
 const source=await readFile(new URL('../src/app/actions/batches.ts',import.meta.url),'utf8');const mod={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>{assert.ok(name in imports);return imports[name];},mod,mod.exports);
 assert.match((await mod.exports.saveBatch({},form())).error,/approved administrator/);
 const remove=new FormData();remove.set('id',id);remove.set('revision','1');remove.set('confirmation','DELETE');
 assert.match((await mod.exports.deleteEmptyBatch({},remove)).error,/approved administrator/);assert.equal(calls.length,0);
 allowed=true;assert.ok((await mod.exports.saveBatch({},form({deposit_amount:'1e3'}))).error);assert.equal(calls.length,0);
 remove.set('confirmation','wrong');assert.ok((await mod.exports.deleteEmptyBatch({},remove)).error);assert.equal(calls.length,0);
 assert.equal((await mod.exports.saveBatch({},form())).id,id);assert.equal(calls[0].name,'admin_save_batch');assert.equal(calls[0].args.p.deposit_cents,2000);assert.ok(invalidations.includes('/group-buys/'+id+'/join'));
 rpcError={message:'PRIVATE_DATABASE_DETAIL'};assert.ok(!(await mod.exports.saveBatch({},form())).error.includes('PRIVATE'));
 remove.set('confirmation','DELETE');rpcError={message:'BATCH_HAS_ORDERS'};assert.match((await mod.exports.deleteEmptyBatch({},remove)).error,/cannot be deleted/);
});
