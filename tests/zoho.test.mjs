import test from 'node:test';
import assert from 'node:assert/strict';
import {syncZohoVote} from '../src/lib/campaigns/zoho-transport.ts';
const config={clientId:'test',clientSecret:'secret',refreshToken:'refresh',accountsUrl:'https://accounts.zoho.com',apiDomain:'https://www.zohoapis.com'};
const vote={email:'voter@example.com',phone:null,telegram:null,consent:true,unsubscribed:false,product:'Dryer',campaign:'First drop',interest:'yes'};
function fake(responses) { const calls=[]; const fn=async(url,init)=>{calls.push({url,...init});const next=responses.shift();assert.ok(next,'Unexpected HTTP request');return new Response(next.status===204?null:JSON.stringify(next.body),{status:next.status||200});};return {calls,fn}; }
test('new lead maps exact custom fields and suppresses automations',async()=>{
 const m=fake([{body:{access_token:'access'}},{status:204},{body:{data:[{status:'success',details:{id:'123'}}]}}]);
 assert.equal(await syncZohoVote(config,vote,m.fn),'123');
 const body=JSON.parse(m.calls[2].body);
 assert.equal(body.data[0].SamaSama_Interest,'Yes');assert.equal(body.data[0].Marketing_Consent,true);
 assert.equal(body.data[0].Last_Name,'SamaSama voter');assert.deepEqual(body.trigger,[]);assert.equal(body.skip_feature_execution.length,2);
 assert.deepEqual(body.duplicate_check_fields,['Email']);assert.ok(!('Email_Opt_Out' in body.data[0]));
});
test('existing lead retains name and CRM opt-out; remote changes use conditional update',async()=>{
 const m=fake([{body:{access_token:'access'}},{body:{data:[{id:'123',Email:vote.email,Last_Name:'Real name',Email_Opt_Out:true,Modified_Time:'2026-09-30T00:00:00Z',Description:'Manual note'}]}},{body:{data:[{status:'success',details:{id:'123'}}]}}]);
 await syncZohoVote(config,vote,m.fn);const body=JSON.parse(m.calls[2].body);
 assert.equal(m.calls[2].method,'PUT');assert.ok(!('Last_Name' in body.data[0]));assert.equal(body.data[0].Marketing_Consent,false);assert.ok(!('Email_Opt_Out' in body.data[0]));assert.ok(m.calls[2].headers['If-Unmodified-Since']);assert.ok(body.data[0].Description.startsWith('Manual note\n'));
});
test('website unsubscribe propagates opt-out and failures never count as success',async()=>{
 const m=fake([{body:{access_token:'access'}},{status:204},{status:207,body:{data:[{status:'error',code:'MANDATORY_NOT_FOUND'}]}}]);
 await assert.rejects(syncZohoVote(config,{...vote,unsubscribed:true,interest:'no'},m.fn),/MANDATORY_NOT_FOUND/);
 const row=JSON.parse(m.calls[2].body).data[0];assert.equal(row.Email_Opt_Out,true);assert.equal(row.Marketing_Consent,false);assert.equal(row.SamaSama_Interest,'No');
});
test('lookup errors and untrusted domains prevent writes',async()=>{
 const m=fake([{body:{access_token:'access'}},{status:401,body:{code:'OAUTH_SCOPE_MISMATCH'}}]);
 await assert.rejects(syncZohoVote(config,vote,m.fn),/lookup failed/);assert.equal(m.calls.length,2);
 await assert.rejects(syncZohoVote({...config,accountsUrl:'https://example.com'},vote,m.fn),/Invalid Zoho/);assert.equal(m.calls.length,2);
});
test('malformed CRM lookup cannot fall through to creation',async()=>{
 const m=fake([{body:{access_token:'access'}},{body:{unexpected:true}}]);
 await assert.rejects(syncZohoVote(config,vote,m.fn),/unexpected response/);assert.equal(m.calls.length,2);
});
test('concurrent CRM edit is a failed sync, not overwritten with an unconditional retry',async()=>{
 const m=fake([{body:{access_token:'access'}},{body:{data:[{id:'123',Email:vote.email,Modified_Time:'2026-09-30T00:00:00Z'}]}},{status:412,body:{code:'ALREADY_MODIFIED'}}]);
 await assert.rejects(syncZohoVote(config,vote,m.fn),/ALREADY_MODIFIED/);assert.equal(m.calls.length,3);
});
