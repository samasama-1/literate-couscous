import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
import {randomBytes} from 'node:crypto';
test('CRM consent preserves existing scopes, adds metadata/custom-module access and remains admin-only/offline/state-bound',async()=>{
 let allowed=false;const config={clientId:'example',redirectUri:'https://www.samasama.sg/api/zoho/callback',accountsUrl:'https://accounts.zoho.com'};
 const imports={'node:crypto':{randomBytes},'@/lib/adminAuth':{verifyAdminAccess:async()=>{if(!allowed)throw Error('unauthorized');}},'@/lib/zoho-oauth':{stateCookie:'crm_state',zohoOAuthConfig:()=>config},'next/server':{NextResponse:{json:(body,opts)=>({body,...opts}),redirect:url=>({url,headers:new Headers(),cookies:{set(...args){this.saved=args;}}})}}};
 const mod={exports:{}};const source=await readFile(new URL('../src/app/api/zoho/authorize/route.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>imports[name],mod,mod.exports);
 assert.equal((await mod.exports.GET()).status,403);allowed=true;const res=await mod.exports.GET();
 const scopes=res.url.searchParams.get('scope').split(',');
 assert.deepEqual(scopes,['ZohoCRM.modules.leads.CREATE','ZohoCRM.modules.leads.UPDATE','ZohoCRM.modules.leads.READ','ZohoSearch.securesearch.READ','ZohoCRM.modules.contacts.CREATE','ZohoCRM.modules.contacts.UPDATE','ZohoCRM.modules.deals.CREATE','ZohoCRM.modules.deals.UPDATE','ZohoCRM.settings.fields.READ','ZohoCRM.modules.custom.CREATE','ZohoCRM.modules.custom.UPDATE']);
 assert.equal(res.url.searchParams.get('access_type'),'offline');assert.equal(res.url.searchParams.get('prompt'),'consent');
 assert.match(res.url.searchParams.get('state'),/^[a-f0-9]{64}$/);assert.equal(res.cookies.saved[1],res.url.searchParams.get('state'));assert.equal(res.cookies.saved[2].httpOnly,true);assert.equal(res.cookies.saved[2].secure,true);assert.equal(res.headers.get('Cache-Control'),'no-store');
});
