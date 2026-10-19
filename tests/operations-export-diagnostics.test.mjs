import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {makeHandler} from '../supabase/functions/operations-export/handler.mjs';
const source=await readFile(new URL('../integrations/google-sheets/Diagnostics.gs',import.meta.url),'utf8');
function run({http=400,body={error:'Invalid request'},failAt='',drive=true}={}) {
 const logs=[],calls=[];
 const fail=stage=>{if(failAt===stage) throw Error('PRIVATE_PROVIDER_PAYLOAD');};
 const context={
  EXPORT_PROFILE:'warehouse_v3',console:{log:value=>logs.push(value)},
  config_:()=>{fail('properties');return {SPREADSHEET_ID:'PRIVATE_SHEET_ID',EXPORT_URL:'https://example.supabase.co/functions/v1/operations-export',EXPORT_SECRET:'a'.repeat(64)};},
  Sheets:{Spreadsheets:{}},Drive:drive?{Permissions:{}}:undefined,
  sheets_:()=>fail('read'),assertRestricted_:()=>fail('sharing'),assertWarehouseWorkbook_:()=>fail('profile'),
  Utilities:{getUuid:()=> 'c68081af-f9dd-47b4-9b6d-a46be5d29f24'},
  UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});return {getResponseCode:()=>http,getContentText:()=>typeof body==='string'?body:JSON.stringify(body)};}},
 };
 vm.createContext(context);vm.runInContext(source,context);context.checkExportSetup();return {logs,calls};
}
test('diagnostic probe rejects before SQL and logs no property values or customer data',async()=>{
 const result=run();assert.equal(result.calls.length,1);
 const {url,options}=result.calls[0];assert.equal(options.followRedirects,false);
 const p=JSON.parse(options.payload);assert.equal(p.action,'setup_check');
 let rpcCalls=0;
 const handler=makeHandler({secret:'a'.repeat(64),rpc:async()=>{rpcCalls++;throw Error();}});
 const response=await handler(new Request(url,{method:'POST',headers:options.headers,body:options.payload}));
 assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'Invalid request'});assert.equal(rpcCalls,0);
 assert.match(result.logs.join('\n'),/PREFLIGHT ONLY/);
 for(const secret of ['a'.repeat(64),'PRIVATE_SHEET_ID','PRIVATE_PROVIDER_PAYLOAD']) assert.ok(!result.logs.join('\n').includes(secret));
});
test('diagnostics stop at failed setup checks without reaching the network',()=>{
 for(const failAt of ['properties','read','sharing','profile']){
  const result=run({failAt});assert.equal(result.calls.length,0);assert.match(result.logs.at(-1),/^FAIL:/);
  assert.ok(!result.logs.join('\n').includes('PRIVATE_PROVIDER_PAYLOAD'));
 }
 assert.match(run({drive:false}).logs.at(-1),/^FAIL: Google Drive API/);
});
test('diagnostics redact arbitrary HTTP bodies and distinguish auth, URL and configuration failures',()=>{
 for(const http of [401,403,404,302,503,500]){
  const result=run({http,body:{error:'PRIVATE_CUSTOMER_PAYLOAD'}});
  assert.match(result.logs.at(-1),/^FAIL:/);assert.ok(!result.logs.join('\n').includes('PRIVATE_CUSTOMER_PAYLOAD'));
 }
 assert.match(run({http:400,body:'not json PRIVATE_CUSTOMER_PAYLOAD'}).logs.at(-1),/^FAIL:/);
});
