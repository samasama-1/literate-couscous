import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {readyForHandover,money} from '../src/components/admin/order-presentation.ts';
import {collectorActive} from '../src/lib/collections/access.ts';
import {orderCursor,parseOrderCursor} from '../src/lib/operations/pagination.ts';
const jsx=(type,props)=>({type,props});const runtime={jsx,jsxs:jsx};
const css={default:new Proxy({},{get:(_target,key)=>String(key)})};
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return[];return[tree,...nodes(tree.props?.children)];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');return tree&&typeof tree==='object'?text(tree.props?.children):String(tree??'');}
async function load(relative,imports){const ts=(await import('typescript')).default,vm=(await import('node:vm')).default,mod={exports:{}};const source=await readFile(new URL(relative,import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>{assert.ok(name in imports,`Unexpected import ${name}`);return imports[name];},mod,mod.exports);return mod.exports;}
function restore(before){for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
test('inline collection controls fail closed for unpaid, storage-due and unavailable checks, and pass current collector to guarded handover',async()=>{
 const before={...process.env};Object.assign(process.env,{COLLECTION_AUTH_INSTALLED:'true'});let error=false,due=0;let collector=null;try{
 const Checkoff=()=>null;
 const{default:panel}=await load('../src/components/admin/CollectionHandoverPanel.tsx',{
 'react/jsx-runtime':runtime,'next/link':{default:()=>null},'@/components/CollectionCheckoff':{default:Checkoff},'@/lib/orders/db':{orderDb:()=>({rpc:async()=>error?{error:{message:'private'}}:{data:{eligible:true,due_cents:due,accrual_mode:'off'}},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:collector})};return q;}})},'@/lib/collections/access':{collectorActive},'./order-presentation':{readyForHandover,money},'./workspace.module.css':css
 });
 const order={id:randomUUID(),customer_name:'Owner',quantity:2,payment_status:'VERIFIED',deposit_due_cents:5000,final_total_cents:12000,balance_due_cents:7000,balance_paid_at:null,ready_at:'2026-11-01',fulfilled_at:null};
 assert.ok(!nodes(await panel({order})).some(n=>n.type===Checkoff));order.balance_paid_at='2026-11-01';due=1000;assert.ok(!nodes(await panel({order})).some(n=>n.type===Checkoff));due=0;error=true;const failure=await panel({order});assert.match(text(failure),/Do not release goods/);assert.ok(!nodes(failure).some(n=>n.type===Checkoff));error=false;
 collector={id:randomUUID(),name:'Authorised person',expires_at:'2099-01-01',used_at:null,revoked_at:null};const success=nodes(await panel({order})).find(n=>n.type===Checkoff);assert.ok(success);assert.equal(success.props.requireAuthorisation,true);assert.equal(success.props.collector.id,collector.id);collector.revoked_at='2026-11-01';assert.equal(nodes(await panel({order})).find(n=>n.type===Checkoff).props.collector,null);
 process.env.COLLECTION_AUTH_INSTALLED='false';process.env.FULFILMENT_V2_ENABLED='false';process.env.MANUAL_BALANCE_INSTALLED='true';assert.match(text(await panel({order})),/identity-checked/);order.fulfilled_at='2026-11-01';assert.equal(await panel({order}),null);
 }finally{restore(before);}
});
test('storage safety screen authenticates before data access and gates the operational form to an outstanding collection order',async()=>{
 const before={...process.env};Object.assign(process.env,{COLLECTION_FEE_HOLD_INSTALLED:'true',COLLECTION_AUTH_INSTALLED:'true'});let authorised=false,calls=0,orderReads=0,method='collection';try{
 const HoldForm=()=>null;
 const{default:page}=await load('../src/app/admin/storage-safety/page.tsx',{
 'react/jsx-runtime':runtime,'next/link':{default:()=>null},'@/lib/adminAuth':{verifyAdminAccess:async()=>{if(!authorised)throw Error('Denied');}},'@/lib/orders/db':{orderDb:()=>{calls++;return{rpc:async(name,args)=>{assert.equal(name,'storage_safety_overview');assert.deepEqual(args,{p_after:null,p_after_id:null});return{data:{mode:'off',frozen_at:'2026-11-01',notices:[]}};},from:()=>{orderReads++;const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:randomUUID(),order_code:'SAMA-0123456789ABCDEF',customer_name:'Owner',fulfilment_method:method,fulfilled_at:null,payment_status:'VERIFIED'}})};return q;}}}},'@/lib/operations/pagination':{orderCursor,parseOrderCursor},'@/components/admin/AdminWorkspace':{default:()=>null},'@/components/admin/CollectionNoticeHoldForm':{default:HoldForm},'@/components/admin/order-presentation':{dateTime:()=> 'Sample time'},'@/components/admin/workspace.module.css':css
 });
 const params={searchParams:Promise.resolve({order:'SAMA-0123456789ABCDEF'})};await assert.rejects(page(params),/Denied/);assert.equal(calls,0);authorised=true;process.env.COLLECTION_FEE_HOLD_INSTALLED='false';assert.match(text(await page(params)),/migration/);assert.equal(calls,0);process.env.COLLECTION_FEE_HOLD_INSTALLED='true';assert.ok(nodes(await page(params)).some(n=>n.type===HoldForm));method='delivery';assert.ok(!nodes(await page(params)).some(n=>n.type===HoldForm));const count=orderReads;await page({searchParams:Promise.resolve({order:'malformed'})});assert.equal(orderReads,count);
 }finally{restore(before);}
});
