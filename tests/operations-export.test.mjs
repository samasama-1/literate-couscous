import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {makeHandler} from '../supabase/functions/operations-export/handler.mjs';

test('export endpoint fails closed and exposes only bounded snapshot operations',async()=>{
 const calls=[];const secret='a'.repeat(64);
 const handler=makeHandler({secret,rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true}};}});
 const req=(payload,key=secret)=>new Request('https://example.com',{method:'POST',headers:{'X-Export-Secret':key},body:JSON.stringify(payload)});
 assert.equal((await makeHandler({rpc:()=>{throw Error();}})(req({}))).status,503);
 assert.equal((await handler(req({},'b'.repeat(64)))).status,401);
 assert.equal((await handler(req({},''))).status,401);
 for(const body of ['{','null','[]','42',JSON.stringify({id:[randomUUID()],action:'start'})]) {
  assert.equal((await handler(new Request('https://example.com',{method:'POST',headers:{'X-Export-Secret':secret},body}))).status,400);
 }
 assert.equal((await handler(new Request('https://example.com'))).status,405);
 assert.equal((await handler(req({id:randomUUID(),action:'delete'}))).status,400);
 assert.equal((await handler(req({id:randomUUID(),action:'page',kind:'orders',after:-1}))).status,400);
 assert.equal((await handler(req({padding:'x'.repeat(2100)}))).status,413);
 assert.equal(calls.length,0);
 const id=randomUUID();assert.equal((await handler(req({id,action:'start'}))).status,200);
 await handler(req({id,action:'page',kind:'activity',after:0}));
 assert.deepEqual(calls[1],{name:'page_operations_export',args:{p_id:id,p_kind:'activity',p_after:0,p_limit:250}});
 const failed=makeHandler({secret,rpc:async()=>({error:{secret:'PRIVATE'}})});
 const response=await failed(req({id,action:'start'}));
 assert.equal(response.status,503);assert.ok(!(await response.text()).includes('PRIVATE'));
});

test('database snapshot is immutable, idempotent, paged, expiring and inaccessible to browsers',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE products(id uuid PRIMARY KEY,name text);
   CREATE TABLE batches(id uuid PRIMARY KEY,product_id uuid,deposit_amount numeric,status text,closes_at timestamptz);
   CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_code varchar(12),batch_id uuid,quantity integer,payment_status text,payment_reference text,customer_name text,customer_phone text,customer_email text,created_at timestamptz DEFAULT now());`);
  await db.exec(await readFile(new URL('../database/sql/order_fulfilment.sql',import.meta.url),'utf8'));
  const migration=await readFile(new URL('../database/sql/operations_export.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  const id=randomUUID(),order=randomUUID();
  await db.query("INSERT INTO orders(id,order_code,quantity,customer_name,postal_code,balance_token_hash) VALUES($1,'SAMA-TEST',1,'=IMPORTXML()', '012345',$2)",[order,'a'.repeat(64)]);
  await db.query("INSERT INTO order_activity(order_id,action,actor,metadata) VALUES($1,'deposit','staff',$2)",[order,JSON.stringify({amount_cents:5000,secret:'DO_NOT_EXPORT'})]);
  const start=async()=> (await db.query('SELECT start_operations_export($1) AS s',[id])).rows[0].s;
  const snapshot=await start();assert.equal(snapshot.orders,1);assert.equal(snapshot.activity,1);
  await db.query("UPDATE orders SET customer_name='Changed' WHERE id=$1",[order]);
  await db.query("INSERT INTO orders(order_code) VALUES('LATER')");
  assert.deepEqual(await start(),snapshot);
  assert.deepEqual(await Promise.all([start(),start()]),[snapshot,snapshot]);
  await assert.rejects(db.query('SELECT start_operations_export($1)',[randomUUID()]),/EXPORT_COOLDOWN/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.operations_export_snapshots')).rows[0].n,1);
  const functions=await db.query("SELECT p.proname,p.prosecdef,p.proconfig,r.rolname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.proname IN ('start_operations_export','page_operations_export','cleanup_operations_exports')");
  assert.equal(functions.rows.length,3);
  for(const f of functions.rows){assert.equal(f.rolname,'postgres');assert.equal(f.prosecdef,true);assert.deepEqual(f.proconfig,['search_path=pg_catalog, pg_temp']);}
  const page=async(kind,after=0,limit=250)=>(await db.query('SELECT page_operations_export($1,$2,$3,$4) AS p',[id,kind,after,limit])).rows[0].p;
  const first=await page('orders',0,1);assert.equal(first.next,1);assert.equal(first.rows[0][3],'=IMPORTXML()');
  assert.equal(first.rows[0].length,19);assert.ok(!JSON.stringify(first).includes('a'.repeat(64)));
  assert.equal((await page('orders',1)).rows.length,0);
  const activity=await page('activity');assert.equal(activity.rows[0].length,7);assert.ok(!JSON.stringify(activity).includes('DO_NOT_EXPORT'));
  await assert.rejects(page('orders',0,251),/INVALID_PAGE/);
  for(const role of ['anon','authenticated']){
   for(const table of ['operations_export_rows','operations_export_snapshots']) assert.equal((await db.query(`SELECT has_table_privilege('${role}','${table}','SELECT') AS ok`)).rows[0].ok,false);
   for(const signature of ['start_operations_export(uuid)','page_operations_export(uuid,text,bigint,integer)']) assert.equal((await db.query(`SELECT has_function_privilege('${role}','${signature}','EXECUTE') AS ok`)).rows[0].ok,false);
   await db.exec(`SET ROLE ${role}`);
   await assert.rejects(db.query('SELECT * FROM public.operations_export_rows'),/permission denied/);
   await assert.rejects(db.query('SELECT public.start_operations_export($1)',[randomUUID()]),/permission denied/);
   await assert.rejects(db.query('SELECT public.cleanup_operations_exports()'),/permission denied/);
   await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');
  assert.deepEqual((await db.query('SELECT public.start_operations_export($1) AS s',[id])).rows[0].s,snapshot);
  await assert.rejects(db.query('SELECT public.cleanup_operations_exports()'),/permission denied/);
  await db.exec('RESET ROLE');
  await db.exec("UPDATE public.operations_export_control SET last_started_at=now()-interval '6 minutes'; CREATE TEMP TABLE orders(id uuid); INSERT INTO orders VALUES(gen_random_uuid());");
  const otherId=randomUUID();
  assert.equal((await db.query('SELECT public.start_operations_export($1) AS s',[otherId])).rows[0].s.orders,2);
  await db.exec('DROP TABLE pg_temp.orders');
  await db.query("UPDATE operations_export_snapshots SET expires_at=now()-interval '1 minute' WHERE id=$1",[id]);
  await assert.rejects(page('orders'),/EXPORT_EXPIRED/);
  assert.equal((await db.query('SELECT public.cleanup_operations_exports() AS n')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM operations_export_rows WHERE snapshot_id=$1',[id])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM operations_export_rows WHERE snapshot_id=$1',[otherId])).rows[0].n,2+1);
  await db.exec("UPDATE public.operations_export_control SET last_started_at=now()-interval '6 minutes'");
  await db.exec('INSERT INTO orders(id) SELECT gen_random_uuid() FROM generate_series(1,50000)');
  const oversized=randomUUID();
  await assert.rejects(db.query('SELECT start_operations_export($1)',[oversized]),/EXPORT_TOO_LARGE/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM operations_export_snapshots WHERE id=$1',[oversized])).rows[0].n,0);
  const schedule=await readFile(new URL('../database/sql/operations_export_schedule.sql',import.meta.url),'utf8');
  await assert.rejects(db.exec(schedule),/Enable Supabase Cron/);
  await db.exec('ROLLBACK');
 } finally {await db.close();}
});

test('concurrent Edge calls have bounded in-flight RPCs; token budget refills without database counters',async()=>{
 const secret='a'.repeat(64);let release;const pending=new Promise(resolve=>release=resolve);let calls=0,time=0;
 const handler=makeHandler({secret,now:()=>time,maxInFlight:1,burst:2,refillPerSecond:1,rpc:async()=>{calls++;await pending;return {data:{ok:true}};}});
 const req=()=>new Request('https://example.com',{method:'POST',headers:{'X-Export-Secret':secret},body:JSON.stringify({action:'start',id:randomUUID()})});
 const first=handler(req());
 // Allow authentication/body reading to reach the pending RPC deterministically.
 while(calls===0) await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal((await handler(req())).status,429);assert.equal(calls,1);
 release();assert.equal((await first).status,200);
 assert.equal((await handler(req())).status,200);
 assert.equal((await handler(req())).status,429);assert.equal(calls,2);
 time=1000;assert.equal((await handler(req())).status,200);assert.equal(calls,3);
});
test('RPC failures are redacted, release in-flight slots, and known cooldowns return retry hints',async()=>{
 const secret='a'.repeat(64);let fail=true;
 const req=()=>new Request('https://example.com',{method:'POST',headers:{'X-Export-Secret':secret},body:JSON.stringify({action:'start',id:randomUUID()})});
 const handler=makeHandler({secret,maxInFlight:1,rpc:async()=>{if(fail) throw Error(secret);return {data:{ok:true}};}});
 const failure=await handler(req());assert.equal(failure.status,503);assert.ok(!(await failure.text()).includes(secret));
 fail=false;assert.equal((await handler(req())).status,200);
 for(const message of ['EXPORT_BUSY','EXPORT_COOLDOWN']){
  const limited=makeHandler({secret,rpc:async()=>({error:{message}})});
  const response=await limited(req());assert.equal(response.status,429);assert.ok(response.headers.get('Retry-After'));
 }
});

const script=await readFile(new URL('../integrations/google-sheets/Code.gs',import.meta.url),'utf8');
function scriptHarness({failActivity=false,count=1,permissionType='user',sharingChanges=false,schemaVersion=3,profile='warehouse_v3',workbookProfile='warehouse_v3',legacyHeaders=false,httpStatus=200,failPage=false,invalidJson=false,networkFailure=false}={}) {
 let next=10,released=0,published=0,fetches=0,sharingChecks=0;const writes=[];
 let sheets=[{sheetId:1,title:'Export Status',rows:[['Field','Value'],['Last success','yesterday']]},
  {sheetId:2,title:'Orders',rows:[['old order']]},{sheetId:3,title:'Payment & Collection History',rows:[['old history']]}];
 const id=randomUUID();
 const headerMap={};
 const context={console,Date,JSON,Number,Error,Array,String,
  PropertiesService:{getScriptProperties:()=>({getProperties:()=>({SPREADSHEET_ID:'sheet',EXPORT_URL:'https://abc.supabase.co/functions/v1/operations-export',EXPORT_SECRET:'a'.repeat(64)})})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})},
  Utilities:{getUuid:()=>id,sleep:()=>{}},
  Drive:{Permissions:{list:()=>{
   sharingChecks++;
   return {permissions:[{type:sharingChanges && sharingChecks>1?'anyone':permissionType}]};
  }}},
  UrlFetchApp:{fetch:(_url,opts)=>{
   fetches++;
   assert.equal(opts.followRedirects,false);const p=JSON.parse(opts.payload);
   if(networkFailure) throw Error('PRIVATE_CUSTOMER_SECRET');
   if(httpStatus!==200 && (!failPage || p.action==='page')) return {getResponseCode:()=>httpStatus,getContentText:()=>'{"error":"PRIVATE_CUSTOMER_SECRET"}'};
   const value=p.action==='start'?{id,captured_at:new Date().toISOString(),orders:count,activity:count,schema_version:schemaVersion,profile}:
    {rows:[Array.from({length:p.kind==='orders'?19:7},(_,i)=>i===0?'SAMA-TEST':i===3?(p.kind==='orders'?'=IMPORTXML()':5000):i===5?(p.kind==='orders'?2:null):p.kind==='orders' && i===17?'ops@example.test':p.kind==='orders' && i===18?'+6580000000':null)],next:1};
   return {getResponseCode:()=>200,getContentText:()=>invalidJson?'PRIVATE_CUSTOMER_SECRET':JSON.stringify(value)};
  }},
  Sheets:{Spreadsheets:{
   get:()=>({sheets:sheets.map(s=>({properties:{sheetId:s.sheetId,title:s.title}}))}),
   Values:{get:(_id,range)=> range.endsWith('!B12')?{values:[[workbookProfile]]}:range.endsWith('!A1:AZ1')?{values:[sheets.find(s=>range.startsWith("'"+s.title+"'!")).rows[0]]}:{values:[['Field','Value']]},batchUpdate:(request)=>{
    assert.equal(request.valueInputOption,'RAW');const data=request.data[0];writes.push(data);
    const [,title,row]=data.range.match(/^'(.+)'!A(\d+)$/);
    if(failActivity && title.includes('_activity_') && +row>1) throw Error('provider private response');
    const sheet=sheets.find(s=>s.title===title);
    data.values.forEach((v,i)=>sheet.rows[+row-1+i]=v);
   }},
   batchUpdate:request=>{
    const copy=structuredClone(sheets),replies=[];
    if(request.requests.some(r=>r.updateSheetProperties)) published++;
    for(const r of request.requests){
     if(r.addSheet){const s={...r.addSheet.properties,sheetId:next++,rows:[]};copy.push(s);replies.push({addSheet:{properties:s}});}
     if(r.deleteSheet) copy.splice(copy.findIndex(s=>s.sheetId===r.deleteSheet.sheetId),1);
     if(r.updateSheetProperties){const p=r.updateSheetProperties.properties;Object.assign(copy.find(s=>s.sheetId===p.sheetId),p);}
     if(r.updateCells){const u=r.updateCells,s=copy.find(s=>s.sheetId===u.range.sheetId);
      assert.equal(u.range.endRowIndex,u.range.startRowIndex+u.rows.length);
      u.rows.forEach((row,i)=>{
      const index=u.range.startRowIndex+i;s.rows[index]??=[''];const v=row.values[0].userEnteredValue;s.rows[index][1]=v.stringValue??v.numberValue;
     });}
    }
    sheets=copy;return {replies};
   },
  }},
 };
 vm.createContext(context);vm.runInContext(script,context);
 for(const tab of vm.runInContext('EXPORT_TABS',context)) {
  headerMap[tab.kind]=Array.from(tab.headers);
  sheets.find(s=>s.title===tab.title).rows.unshift(legacyHeaders?['Email','Phone','Address']:headerMap[tab.kind]);
 }
 return {run:()=>context.runDailyExport(),state:()=>({sheets,writes,released,published,fetches})};
}
test('Sheets publishes complete tabs together, keeps prior copy and uses RAW for formula-like text',()=>{
 const h=scriptHarness();h.run();let s=h.state();assert.equal(s.published,1);assert.equal(s.released,1);
 assert.equal(s.sheets.find(x=>x.title==='Orders').rows[1][3],'=IMPORTXML()');
 assert.equal(s.sheets.find(x=>x.title==='Orders').rows[1][5],2);
 assert.equal(s.sheets.find(x=>x.title==='Orders').rows[1][17],'ops@example.test');
 assert.equal(s.sheets.find(x=>x.title==='Orders').rows[1][18],'+6580000000');
 assert.equal(s.sheets.find(x=>x.title==='Orders (previous)').rows[1][0],'old order');
 assert.equal(s.sheets.find(x=>x.title==='Export Status').rows[6][1],'Success');
 h.run();s=h.state();assert.equal(s.sheets.filter(x=>x.title==='Orders').length,1);assert.equal(s.sheets.filter(x=>x.title==='Orders (previous)').length,1);
});
test('failed second tab leaves both live tabs and last success untouched, releases lock and redacts errors',()=>{
 const h=scriptHarness({failActivity:true});assert.throws(h.run,/existing successful snapshot retained/);
 const s=h.state();assert.equal(s.published,0);assert.equal(s.released,1);
 assert.equal(s.sheets.find(x=>x.title==='Orders').rows[1][0],'old order');
 assert.equal(s.sheets.find(x=>x.title==='Payment & Collection History').rows[1][0],'old history');
 assert.equal(s.sheets.find(x=>x.title==='Export Status').rows[1][1],'yesterday');
 assert.match(s.sheets.find(x=>x.title==='Export Status').rows[6][1],/^Failed/);
 assert.ok(!s.sheets.some(x=>x.title.startsWith('_export_v3_staging_')));
});
test('empty snapshots still publish headers, reflecting deletions without stale order rows',()=>{
 const h=scriptHarness({count:0});h.run();assert.equal(h.state().sheets.find(x=>x.title==='Orders').rows.length,1);
});
test('public/domain sharing blocks any customer fetch; sharing changes block publication',()=>{
 for(const permissionType of ['anyone','domain','unknown']) {
  const h=scriptHarness({permissionType});assert.throws(h.run,/Operations export failed/);
  assert.equal(h.state().fetches,0);assert.equal(h.state().published,0);assert.equal(h.state().released,1);
 }
 const h=scriptHarness({sharingChanges:true});assert.throws(h.run,/Operations export failed/);
 assert.equal(h.state().published,0);assert.equal(h.state().sheets.find(x=>x.title==='Orders').rows[1][0],'old order');
 assert.ok(!h.state().sheets.some(x=>x.title.startsWith('_export_v3_staging_')));
});
test('Google manifest requests per-file access without broad Sheets, Drive or mail privileges',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../integrations/google-sheets/appsscript.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.oauthScopes.sort(),[
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/script.scriptapp',
 ].sort());
});
test('Sheets rejects old snapshots, wrong profiles and legacy workbooks before publishing',()=>{
 for(const options of [{schemaVersion:1},{schemaVersion:2},{profile:'dispatch'},{schemaVersion:null,profile:null}]) {
  const h=scriptHarness(options);assert.throws(h.run,/Operations export failed/);
  assert.equal(h.state().published,0);assert.equal(h.state().writes.length,0);
 }
 for(const options of [{workbookProfile:'legacy'},{legacyHeaders:true}]){
  const h=scriptHarness(options);assert.throws(h.run,/Operations export failed/);
  assert.equal(h.state().fetches,0);assert.equal(h.state().published,0);
  assert.ok(h.state().sheets.some(s=>s.title==='Orders'));
 }
});
test('warehouse headers expose only the SQL v3 contract and preserve money/clearance mapping',()=>{
 const context=vm.createContext({});vm.runInContext(script,context);
 const tabs=vm.runInContext('EXPORT_TABS',context);
 const orders=Array.from(tabs[0].headers),activity=Array.from(tabs[1].headers);
 assert.equal(orders.length,19);assert.equal(activity.length,7);
 assert.equal(orders[3],'Customer name');assert.equal(orders[5],'Quantity');assert.equal(orders[6],'Payment status');
 assert.equal(orders[7],'Deposit due (SGD cents)');assert.equal(orders[9],'Final total (SGD cents)');
 assert.equal(orders[10],'Balance due (SGD cents)');assert.equal(orders[12],'Balance paid at (UTC)');
 assert.equal(orders[14],'Fulfilled at (UTC)');assert.equal(orders[16],'Handover clearance');
 assert.equal(activity[3],'Amount (SGD cents)');
 assert.deepEqual(orders.slice(17),['Customer email','Customer phone']);
 assert.ok(![...orders.slice(0,17),...activity].some(h=>/email|phone|address|postal|reference|actor|received by|fulfilled by|token|credential/i.test(h)));
});

test('export failures identify safe stages and HTTP codes without exposing provider data',()=>{
 for(const options of [
  {httpStatus:503,expected:'START_SNAPSHOT / HTTP_503',fetches:3},
  {httpStatus:429,expected:'START_SNAPSHOT / HTTP_429',fetches:3},
  {httpStatus:401,expected:'START_SNAPSHOT / HTTP_401',fetches:1},
  {httpStatus:503,failPage:true,expected:'ORDERS_FETCH / HTTP_503',fetches:4},
  {schemaVersion:2,expected:'SNAPSHOT_VALIDATION / SCHEMA_MISMATCH',fetches:1},
  {invalidJson:true,expected:'START_SNAPSHOT / INVALID_JSON',fetches:1},
  {networkFailure:true,expected:'START_SNAPSHOT / CHECK_REQUIRED',fetches:1},
  {failActivity:true,expected:'HISTORY_WRITE / CHECK_REQUIRED',fetches:3},
 ]) {
  const h=scriptHarness(options);
  assert.throws(h.run,error=>{
   assert.ok(error.message.includes(options.expected));
   assert.ok(!error.message.includes('PRIVATE_CUSTOMER_SECRET'));
   assert.ok(!error.message.includes('provider private response'));
   return true;
  });
  const s=h.state();assert.equal(s.fetches,options.fetches);
  assert.equal(s.published,0);assert.equal(s.released,1);
  assert.equal(s.sheets.find(x=>x.title==='Orders').rows[1][0],'old order');
  const status=s.sheets.find(x=>x.title==='Export Status').rows[6][1];
  assert.ok(status.includes(options.expected));
  assert.ok(!status.includes('PRIVATE_CUSTOMER_SECRET'));
  assert.ok(!status.includes('provider private response'));
 }
});
