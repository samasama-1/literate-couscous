import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),cache=new Map();
function load(file) {
 if(cache.has(file)) return cache.get(file).exports;
 const mod={exports:{}};cache.set(file,mod);
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const get=id=>{
  if(!id.startsWith('.')) return require(id);
  const base=path.resolve(path.dirname(file),id),target=existsSync(base)?base:base+'.ts';return load(target);
 };
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(get,mod,mod.exports);return mod.exports;
}
const root=path.resolve(import.meta.dirname,'../src/lib/mail');
const {prepareZohoMail,exchangeMailAuthorization,validateMailRedirect}=load(root+'/zoho-transport.ts');
const {createMailOAuthHandlers}=load(root+'/oauth-handlers.ts');
const {deliverOnce}=load(root+'/delivery.ts');
const config={clientId:'MAIL_CLIENT',clientSecret:'PRIVATE_SECRET',refreshToken:'PRIVATE_REFRESH',accountId:'123456',from:'hello@samasama.sg',accountsUrl:'https://accounts.zoho.sg',apiUrl:'https://mail.zoho.sg',redirectUri:'https://www.samasama.sg/api/zoho/mail/callback'};
const message={to:'owner@example.com',subject:'Confirmation',text:'Test',html:'<p>Test</p>',replyTo:'hello@samasama.sg'};
const json=(body,status=200)=>Response.json(body,{status});
const account={status:{code:200},data:[{accountId:'123456',mailboxAddress:config.from,enabled:true}]};
const token={access_token:'PRIVATE_ACCESS',refresh_token:'PRIVATE_REFRESH'};
const accepted={status:{code:200},data:{messageId:'MSG123'}};
const queue=(responses)=>{const calls=[];return {calls,request:async(url,init)=>{calls.push({url,init});const next=responses.shift();if(next instanceof Error)throw next;if(!next)throw Error('Unexpected request');return next;}};};

test('Mail transport refreshes on the fixed SG host and sends exactly once with no secrets in URLs',async()=>{
 const q=queue([json(token),json(accepted)]);const send=await prepareZohoMail(config,q.request);assert.equal(await send(message),'MSG123');
 assert.equal(q.calls.length,2);assert.equal(q.calls[0].url,'https://accounts.zoho.sg/oauth/v2/token');
 assert.equal(q.calls[0].init.body.get('grant_type'),'refresh_token');assert.equal(q.calls[0].init.body.get('refresh_token'),'PRIVATE_REFRESH');
 assert.equal(q.calls[1].url,'https://mail.zoho.sg/api/accounts/123456/messages');
 assert.equal(q.calls[1].init.headers.Authorization,'Zoho-oauthtoken PRIVATE_ACCESS');
 assert.equal(JSON.parse(q.calls[1].init.body).fromAddress,'hello@samasama.sg');
 assert.equal(q.calls[1].init.headers['Idempotency-Key'],undefined);
 for(const c of q.calls){assert.equal(c.init.redirect,'error');assert.equal(c.init.cache,'no-store');assert.ok(c.init.signal);assert.ok(!c.url.includes('PRIVATE'));}
 const again=queue([json({access_token:'NEW_ACCESS'}),json(accepted)]);await (await prepareZohoMail(config,again.request))(message);
 assert.equal(again.calls[1].init.headers.Authorization,'Zoho-oauthtoken NEW_ACCESS');
});
test('Mail configuration rejects non-SG, injected and malformed hosts/account IDs before any network access',async()=>{
 for(const change of [{accountsUrl:'https://evil.example'},{accountsUrl:'https://accounts.zoho.sg@evil.example'},{apiUrl:'https://mail.zoho.sg/path'},{apiUrl:'https://mail.zoho.com'},{accountId:'123/456'},{from:'hello@samasama.sg\r\nBcc:x@example.com'}]){
  let calls=0;await assert.rejects(prepareZohoMail({...config,...change},async()=>{calls++;throw Error();}),/MAIL_CONFIGURATION/);assert.equal(calls,0);
 }
 for(const uri of ['https://www.samasama.sg/api/zoho/callback','http://www.samasama.sg/api/zoho/mail/callback','https://x:y@www.samasama.sg/api/zoho/mail/callback','https://www.samasama.sg/api/zoho/mail/callback?x=1'])assert.throws(()=>validateMailRedirect(uri),/MAIL_REDIRECT_CONFIGURATION/);
 assert.equal(validateMailRedirect('http://localhost:3100/api/zoho/mail/callback').hostname,'localhost');
});
test('Mail auth/scope/network failures are redacted and never cause an email POST retry',async()=>{
 for(const response of [json({error:'PRIVATE_PROVIDER_BODY'},401),json({error:'PRIVATE_PROVIDER_BODY'},403),new Error('PRIVATE_PROVIDER_BODY'),json({access_token:'bad\r\nTOKEN'})]) {
  const q=queue([response]);await assert.rejects(prepareZohoMail(config,q.request),/^Error: MAIL_REFRESH_FAILED$/);assert.equal(q.calls.length,1);
 }
 for(const response of [json({error:'PRIVATE_PROVIDER_BODY'},401),json({error:'PRIVATE_PROVIDER_BODY'},429),json({error:'PRIVATE_PROVIDER_BODY'},500),new Error('PRIVATE_PROVIDER_BODY'),json({status:{code:500},data:{messageId:'untrusted'}}),json({status:{code:200}})]) {
  const q=queue([json(token),response]);const send=await prepareZohoMail(config,q.request);await assert.rejects(send(message),/^Error: MAIL_SEND_UNCONFIRMED$/);assert.equal(q.calls.length,2);
 }
});
test('Mail rejects recipient/header injection and unsupported reply routing without posting a message',async()=>{
 for(const change of [{to:'one@example.com,two@example.com'},{subject:'x\r\nBcc: x@example.com'},{replyTo:'other@example.com'}]){
  const q=queue([json(token)]);const send=await prepareZohoMail(config,q.request);await assert.rejects(send({...message,...change}),/MAIL_MESSAGE_INVALID/);assert.equal(q.calls.length,1);
 }
});
test('authorization discovers only the intended mailbox or confirmed sender alias and returns no access token',async()=>{
 for(const selected of [account,{status:{code:200},data:[{accountId:'123456',emailAddress:[{mailId:config.from,isConfirmed:true}]}]}]){
  const q=queue([json(token),json(selected)]);const result=await exchangeMailAuthorization(config,'CODE',config.redirectUri,q.request);
  assert.deepEqual(result,{refreshToken:'PRIVATE_REFRESH',accountId:'123456'});assert.equal(result.accessToken,undefined);
  assert.equal(q.calls[0].init.body.get('redirect_uri'),config.redirectUri);
  assert.equal(q.calls[1].url,'https://mail.zoho.sg/api/accounts');
 }
 for(const data of [[{accountId:'123456',mailboxAddress:'someone@example.com'}],[{accountId:'123456',emailAddress:[{mailId:config.from,isConfirmed:false}]}],[...account.data,...account.data]]){
  const q=queue([json(token),json({status:{code:200},data})]);await assert.rejects(exchangeMailAuthorization(config,'CODE',config.redirectUri,q.request),/MAIL_SENDER_ACCOUNT_MISMATCH/);
 }
 const q=queue([json({access_token:'PRIVATE_ACCESS'})]);await assert.rejects(exchangeMailAuthorization(config,'CODE',config.redirectUri,q.request),/MAIL_OFFLINE_TOKEN_MISSING/);assert.equal(q.calls.length,1);
});
const state='a'.repeat(64);
const callback=(params={},cookie=true)=>new Request(config.redirectUri+'?'+new URLSearchParams({state,code:'CODE',...params}),{headers:cookie?{cookie:'samasama_zoho_mail_state='+state}:{}});
test('Mail OAuth requires approved admin on both routes before credentials or network access',async()=>{
 let reads=0,calls=0;const h=createMailOAuthHandlers({admin:async()=>{throw Error('PRIVATE_SESSION');},config:()=>{reads++;return config;},request:async()=>{calls++;throw Error();}});
 for(const result of [await h.authorize(new Request('https://www.samasama.sg/api/zoho/mail/authorize')),await h.callback(callback())]){
  assert.equal(result.status,403);assert.equal(result.headers.get('Cache-Control'),'no-store');assert.ok(!(await result.text()).includes('PRIVATE'));
 }assert.equal(reads,0);assert.equal(calls,0);
});
test('Mail OAuth uses separate bounded state cookies, minimal Mail scopes and offline consent',async()=>{
 const h=createMailOAuthHandlers({admin:async()=>{},config:()=>config});const r=await h.authorize(new Request('https://www.samasama.sg/api/zoho/mail/authorize'));
 assert.equal(r.status,302);const u=new URL(r.headers.get('Location'));assert.equal(u.origin,config.accountsUrl);assert.equal(u.searchParams.get('scope'),'ZohoMail.messages.CREATE,ZohoMail.accounts.READ');
 assert.equal(u.searchParams.get('access_type'),'offline');assert.equal(u.searchParams.get('prompt'),'consent');assert.match(u.searchParams.get('state'),/^[a-f0-9]{64}$/);
 const c=r.headers.get('set-cookie');for(const flag of ['samasama_zoho_mail_state=','HttpOnly','SameSite=Lax','Secure','Max-Age=600','Path=/api/zoho/mail'])assert.ok(c.includes(flag));assert.ok(!c.includes('PRIVATE'));
 assert.equal((await h.authorize(new Request('https://samasama.sg/api/zoho/mail/authorize'))).status,400);
});
test('Mail callbacks reject missing/wrong state, declined access and callback/server injection before token exchange',async()=>{
 let calls=0;const h=createMailOAuthHandlers({admin:async()=>{},config:()=>config,request:async()=>{calls++;throw Error();}});
 for(const request of [callback({},false),callback({state:'b'.repeat(64)}),callback({error:'PRIVATE_ERROR'}),callback({code:''}),callback({'accounts-server':'https://evil.example'}),new Request('https://other.example/api/zoho/mail/callback?state='+state+'&code=CODE',{headers:{cookie:'samasama_zoho_mail_state='+state}})]){
  const r=await h.callback(request);assert.equal(r.status,400);assert.ok(r.headers.get('set-cookie').includes('Max-Age=0'));assert.ok(!(await r.text()).includes('PRIVATE'));
 }assert.equal(calls,0);
});
test('Mail setup response is admin-only, private, framed off, and returns only the dedicated refresh/account values',async()=>{
 const q=queue([json(token),json(account)]);const h=createMailOAuthHandlers({admin:async()=>{},config:()=>config,request:q.request});const r=await h.callback(callback({'accounts-server':config.accountsUrl}));
 assert.equal(r.status,200);assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');assert.equal(r.headers.get('X-Frame-Options'),'DENY');assert.match(r.headers.get('Content-Security-Policy'),/default-src 'none'/);
 const body=await r.json();assert.equal(body.ZOHO_MAIL_REFRESH_TOKEN,'PRIVATE_REFRESH');assert.equal(body.ZOHO_MAIL_ACCOUNT_ID,'123456');assert.equal(body.ZOHO_REFRESH_TOKEN,undefined);assert.ok(!JSON.stringify(body).includes('PRIVATE_ACCESS'));assert.ok(!JSON.stringify(body).includes('PRIVATE_SECRET'));
});

const now=Date.parse('2026-10-20T09:00:00Z');
function deliveryHarness({provider='zoho',job={},prepareFails=false,sendFails=false,saveFails=false,markerFails=false}={}){
 let current={id:'JOB',status:'queued',attempted_at:null,provider:'resend',metadata:{product_name:'Test'},...job},sends=0,prepares=0;
 const same=x=>current.status===x.status&&current.attempted_at===x.attempted_at;
 const store={claim:async(expected,at,p,m)=>{if(!same(expected))return false;current={...current,status:'sending',attempted_at:at,provider:p,metadata:m};return true;},
  markSending:async(at,m)=>{if(markerFails||current.status!=='sending'||current.attempted_at!==at)return false;current.metadata=m;return true;},
  finish:async(at,patch)=>{if(saveFails||current.status!=='sending'||current.attempted_at!==at)return false;current={...current,...patch};return true;},
  block:async(expected,m)=>{if(same(expected))current.error_message=m;}};
 const run=()=>deliverOnce({job:structuredClone(current),provider,store,now:()=>now,buildMessage:()=>message,prepare:async()=>{prepares++;if(prepareFails)throw Error('PRIVATE_TOKEN');return async()=>{sends++;if(sendFails)throw Error('PRIVATE_BODY');return 'MSG123';};}});
 return {run,current:()=>current,stats:()=>({sends,prepares}),allowPreparation:()=>{prepareFails=false;}};
}
test('durable claims prevent concurrent sends; successful Zoho retries do not send twice',async()=>{
 const h=deliveryHarness();const results=await Promise.all([h.run(),h.run()]);assert.ok(results.includes('sent'));assert.equal(h.stats().sends,1);assert.equal(h.current().provider,'zoho');assert.equal(h.current().metadata.product_name,'Test');
 assert.equal(await h.run(),'sent');assert.equal(h.stats().sends,1);
});
test('uncertain Zoho sends and acceptance-save failures require review and cannot retry',async()=>{
 for(const option of [{sendFails:true},{saveFails:true}]){
  const h=deliveryHarness(option);assert.equal(await h.run(),'failed');assert.equal(h.stats().sends,1);assert.equal(h.current().metadata._mail_outcome,'unknown');
  await h.run();assert.equal(h.stats().sends,1);assert.ok(!JSON.stringify(h.current()).includes('PRIVATE'));
 }
 const crashed=deliveryHarness({job:{status:'sending',provider:'zoho',attempted_at:new Date(now-11*60000).toISOString(),metadata:{_mail_outcome:'preparing'}}});
 assert.equal(await crashed.run(),'failed');assert.equal(crashed.stats().sends,0);
});
test('pre-send OAuth failures can retry safely; losing the durable marker prevents any send',async()=>{
 const h=deliveryHarness({prepareFails:true});assert.equal(await h.run(),'failed');assert.equal(h.stats().sends,0);assert.equal(h.current().metadata._mail_outcome,'not_sent');
 h.allowPreparation();assert.equal(await h.run(),'sent');assert.equal(h.stats().sends,1);
 const lost=deliveryHarness({markerFails:true});assert.equal(await lost.run(),'failed');assert.equal(lost.stats().sends,0);
});
test('legacy attempts never switch providers; old and invalid attempts stop; Resend retries preserve the original timestamp',async()=>{
 const at=new Date(now-11*60000).toISOString();
 for(const job of [{status:'failed',attempted_at:at,provider:'resend'},{status:'failed',attempted_at:at,provider:null},{status:'failed',attempted_at:'invalid',provider:'zoho'},{status:'failed',attempted_at:new Date(now-24*3600000).toISOString(),provider:'zoho'}]){
  const h=deliveryHarness({job});assert.equal(await h.run(),'failed');assert.equal(h.stats().sends,0);
 }
 const h=deliveryHarness({provider:'resend',job:{status:'failed',attempted_at:at,provider:'resend'},sendFails:true});
 assert.equal(await h.run(),'failed');assert.equal(h.current().attempted_at,at);await h.run();assert.equal(h.stats().sends,2);assert.equal(h.current().attempted_at,at);
});

test('campaign adapter keeps sending off until configured and persists Zoho provider/status without changing message snapshot',async()=>{
 const source=readFileSync(path.resolve(root,'../campaigns/email.ts'),'utf8');
 const vars=['CAMPAIGN_EMAIL_PROVIDER','ZOHO_MAIL_CLIENT_ID','ZOHO_MAIL_CLIENT_SECRET','ZOHO_MAIL_REFRESH_TOKEN','ZOHO_MAIL_ACCOUNT_ID','EMAIL_REPLY_TO'];
 const saved=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 try {
  for(const k of vars)delete process.env[k];
  let current={id:'JOB',template_key:'intent_confirmation',contact_id:'CONTACT',campaign_lead_id:'LEAD',status:'queued',provider:'resend',attempted_at:null,metadata:{product_name:'Dryer <test>',price_shown_cents:9900,currency:'SGD',purchase_intent:'yes'},recipient_email:'owner@example.com'},sends=0,prepared=0,lastMessage;
  const events=[];
  const db={from(table){let changes=null;const filters=[];const chain={select:()=>chain,eq:(k,v)=>{filters.push([k,v]);return chain;},is:(k,v)=>{filters.push([k,v]);return chain;},update:patch=>{changes=patch;return chain;},
   insert:event=>{events.push(event);return Promise.resolve({error:null});},
   single:async()=>({data:structuredClone(current),error:null}),
   maybeSingle:async()=>{
    if(!filters.every(([k,v])=>current[k]===v))return {data:null,error:null};
    if(changes)current={...current,...changes};return {data:{id:current.id},error:null};
   },then:cb=>Promise.resolve({error:null}).then(cb)};
   assert.ok(['email_deliveries','funnel_events'].includes(table));return chain;}};
  const adapterModule={exports:{}};
  const imports={
   'server-only':{},'@/lib/supabaseAdmin':{supabaseAdmin:db},'./utils':{formatMoney:n=>'S$'+(n/100).toFixed(2)},'./security':{unsubscribeToken:()=> 'SIGNED_TOKEN'},'./types':{purchaseIntentLabels:{yes:'Yes, I’m interested',no:'No, I’m just voting'}},
   '@/lib/mail/config':{mailSendingConfig:()=>config},'@/lib/mail/zoho-transport':{prepareZohoMail:async()=>{prepared++;return async m=>{sends++;lastMessage=m;return 'MSG123';};}},'@/lib/mail/delivery':{deliverOnce},
  };
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})')(id=>{assert.ok(id in imports,'Unexpected import: '+id);return imports[id];},adapterModule,adapterModule.exports);
  const run=()=>adapterModule.exports.deliverConfirmation('JOB');
  assert.equal(await run(),'queued');assert.equal(prepared,0);assert.equal(current.attempted_at,null);
  process.env.CAMPAIGN_EMAIL_PROVIDER='zoho';assert.equal(await run(),'queued');assert.equal(prepared,0);
  for(const k of vars.filter(k=>k.startsWith('ZOHO_MAIL_')))process.env[k]=k.endsWith('ACCOUNT_ID')?'123456':'FAKE_TEST_VALUE';
  assert.equal(await run(),'sent');assert.equal(current.provider,'zoho');assert.equal(sends,1);assert.equal(current.metadata.product_name,'Dryer <test>');
  assert.equal(current.metadata._mail_outcome,'accepted');assert.ok(lastMessage.html.includes('Dryer &lt;test&gt;'));assert.ok(lastMessage.html.includes('/unsubscribe?token=SIGNED_TOKEN'));assert.ok(lastMessage.text.includes('not an order or payment'));
  assert.equal(events[0].event_type,'confirmation_email_sent');assert.equal(await run(),'sent');assert.equal(sends,1);
 } finally {for(const k of vars){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
});
