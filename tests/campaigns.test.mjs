import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { parseIntent } from '../src/lib/campaigns/validation.ts';
import { csvEscape } from '../src/lib/campaigns/utils.ts';
import { demoCampaign,demoProducts } from '../src/lib/campaigns/demo.ts';

test('runtime validation rejects malformed input and false consent strings',()=>{
  const valid={email:' Test@Example.com ',campaignSlug:'home',campaignProductId:randomUUID(),requestId:randomUUID(),purchaseIntent:'yes',marketingConsent:false,priceShownCents:9900,currency:'SGD'};
  assert.equal(parseIntent(valid).email,'test@example.com');
  assert.equal(parseIntent(valid).marketing_consent,false);
  assert.equal(parseIntent({...valid,purchaseIntent:'no'}).purchase_intent,'no');
  for (const change of [{email:17},{email:'bad'},{purchaseIntent:'buyer'},{purchaseIntent:'maybe'},{marketingConsent:'false'},{priceShownCents:9.1},{campaignProductId:'bad'},{company:'bot'}]) assert.throws(()=>parseIntent({...valid,...change}));
  const parsed=parseIntent({...valid,attribution:{utm_source:'tiktok',referrer:'https://example.com/page?email=private@example.com#secret'}});
  assert.equal(parsed.attribution.referrer,'https://example.com/page');
});
test('CSV quotes delimiters and neutralizes spreadsheet formulas',()=>{
  assert.equal(csvEscape('=1+2'),"'=1+2");
  assert.equal(csvEscape('+6581234567'),"'+6581234567");
  assert.equal(csvEscape('  @SUM(1)'),"'  @SUM(1)");
  assert.equal(csvEscape('a,"b"'),'"a,""b"""');
});

test('real PostgreSQL migrations and campaign workflows',async t=>{
  const db=new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE products(id uuid PRIMARY KEY);');
  for (const name of ['add_campaign_lead_system.sql','harden_campaign_lead_system.sql','campaign_content_editor.sql','campaign_zoho_sync.sql']) await db.exec(await readFile(new URL(`../database/sql/${name}`,import.meta.url),'utf8'));
  const call=async(name,p)=>(await db.query(`SELECT ${name}($1::jsonb) AS result`,[JSON.stringify(p)])).rows[0].result;
  const content={...demoCampaign,id:null,slug:'test-fixture',is_test:false,products:demoProducts.map(p=>({...p,id:null}))};
  const cid=await call('save_campaign_content',content);
  const opts=(await db.query('SELECT * FROM campaign_products WHERE campaign_id=$1 ORDER BY display_order',[cid])).rows;
  const base={email:' Buyer@Example.com ',campaign_slug:content.slug,product_id:opts[1].id,price_shown_cents:10900,currency:'SGD',purchase_intent:'yes',marketing_consent:false,session_id:randomUUID(),attribution:{utm_source:'tiktok',utm_campaign:'launch',utm_content:'creative-a',first_touch_source:'tiktok',latest_touch_source:'tiktok'}};
  const submit=(overrides={})=>call('register_campaign_intent',{...base,request_id:randomUUID(),...overrides});
  let first;
  await t.test('anonymous views and selections link to the registered lead',async()=>{
    for (const event of ['campaign_view','product_selected']) await call('record_campaign_event',{campaign_id:cid,product_id:opts[1].id,session_id:base.session_id,event_type:event,metadata:base.attribution});
    first=await submit();
    const events=(await db.query('SELECT * FROM funnel_events WHERE campaign_lead_id=$1',[first.lead_id])).rows;
    assert.ok(events.some(e=>e.event_type==='campaign_view'));
    assert.ok(events.some(e=>e.event_type==='product_selected'));
    assert.ok(events.some(e=>e.event_type==='confirmation_email_queued'));
    const contacts=(await db.query('SELECT * FROM contacts')).rows;
    assert.equal(contacts.length,1); assert.equal(contacts[0].email_normalized,'buyer@example.com'); assert.equal(contacts[0].marketing_consent,false);
  });
  await t.test('CRM queue claims exclusively and retains updates made during a sync',async()=>{
    const cid=(await db.query('SELECT contact_id FROM campaign_leads WHERE id=$1',[first.lead_id])).rows[0].contact_id;
    const claim=(await db.query('SELECT claim_campaign_crm($1) AS job',[cid])).rows[0].job;
    assert.ok(claim.claim_id);assert.equal(claim.snapshot.email,'buyer@example.com');
    assert.equal((await db.query('SELECT claim_campaign_crm($1) AS job',[cid])).rows[0].job,null);
    await db.query('SELECT queue_campaign_crm($1)',[cid]);
    await db.query('SELECT finish_campaign_crm($1,$2,$3,$4,$5)',[cid,claim.claim_id,claim.revision,'zoho-123',null]);
    assert.equal((await db.query('SELECT status FROM campaign_crm_sync WHERE contact_id=$1',[cid])).rows[0].status,'queued');
    const newer=(await db.query('SELECT claim_campaign_crm($1) AS job',[cid])).rows[0].job;
    await db.query('SELECT finish_campaign_crm($1,$2,$3,$4,$5)',[cid,newer.claim_id,newer.revision,null,'Provider failure']);
    assert.equal((await db.query('SELECT status FROM campaign_crm_sync WHERE contact_id=$1',[cid])).rows[0].status,'failed');
  });
  await t.test('changed vote preserves first touch and records old/new values',async()=>{
    const result=await submit({product_id:opts[2].id,price_shown_cents:21900,purchase_intent:'maybe',attribution:{utm_source:'instagram',latest_touch_source:'instagram'}});
    assert.equal(result.lead_id,first.lead_id); assert.equal(result.already_registered,true);
    const lead=(await db.query('SELECT * FROM campaign_leads')).rows[0];
    assert.equal(lead.utm_source,'tiktok');assert.equal(lead.latest_touch_source,'instagram');assert.equal(lead.selected_campaign_product_id,opts[2].id);
    const event=(await db.query("SELECT metadata FROM funnel_events WHERE event_type='intent_updated' ORDER BY created_at DESC LIMIT 1")).rows[0].metadata;
    assert.equal(event.previous_product_id,opts[1].id);assert.equal(event.previous_price_cents,10900);assert.equal(event.price_shown_cents,21900);
  });
  await t.test('request retries do not duplicate emails or events',async()=>{
    const key=randomUUID();const a=await submit({request_id:key});
    const before=await db.query('SELECT count(*)::int AS count FROM email_deliveries');
    const b=await submit({request_id:key}); assert.deepEqual(a,b);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM email_deliveries')).rows[0].count,before.rows[0].count);
  });
  await t.test('concurrent registrations produce one contact and one lead',async()=>{
    const results=await Promise.all([submit({email:'concurrent@example.com'}),submit({email:'CONCURRENT@example.com'})]);
    assert.equal(results[0].lead_id,results[1].lead_id);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM contacts WHERE email_normalized='concurrent@example.com'")).rows[0].n,1);
  });
  await t.test('inactive campaign and foreign products cannot register; failed writes roll back',async()=>{
    const other=await call('save_campaign_content',{...content,slug:'other',products:[{...opts[0],id:null}]});
    const op=(await db.query('SELECT id FROM campaign_products WHERE campaign_id=$1',[other])).rows[0];
    await assert.rejects(submit({email:'foreign@example.com',product_id:op.id}),/INVALID_PRODUCT/);
    await db.query("UPDATE campaigns SET status='paused' WHERE id=$1",[cid]);
    await assert.rejects(submit(),/CAMPAIGN_INACTIVE/);
    await db.query("UPDATE campaigns SET status='active' WHERE id=$1",[cid]);
    await assert.rejects(submit({price_shown_cents:100}),/PRICE_CHANGED/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM contacts WHERE email_normalized='foreign@example.com'")).rows[0].n,0);
  });
  await t.test('paid and invited lifecycle states never regress',async()=>{
    await db.query("UPDATE campaign_leads SET funnel_status='reservation_invited' WHERE id=$1",[first.lead_id]);
    await submit();
    assert.equal((await db.query('SELECT funnel_status FROM campaign_leads WHERE id=$1',[first.lead_id])).rows[0].funnel_status,'reservation_invited');
    await db.query("UPDATE campaign_leads SET funnel_status='reserved' WHERE id=$1",[first.lead_id]);
    await assert.rejects(submit({product_id:opts[0].id,price_shown_cents:9900}),/PAID_RESPONSE_LOCKED/);
    await submit();
    assert.equal((await db.query('SELECT funnel_status FROM campaign_leads WHERE id=$1',[first.lead_id])).rows[0].funnel_status,'reserved');
  });
  await t.test('consent and central unsubscribe survive ordinary registrations',async()=>{
    await submit({marketing_consent:true});
    const contact=(await db.query("SELECT * FROM contacts WHERE email_normalized='buyer@example.com'")).rows[0];
    assert.ok(contact.marketing_consent_at);
    await db.query('SELECT unsubscribe_campaign_contact($1)',[contact.id]);
    await submit({marketing_consent:false});
    const after=(await db.query('SELECT * FROM contacts WHERE id=$1',[contact.id])).rows[0];
    assert.equal(after.marketing_consent,false);assert.ok(after.unsubscribed_at);
  });
  await t.test('delivery failure does not remove registration',async()=>{
    await db.query("UPDATE email_deliveries SET status='failed' WHERE campaign_lead_id=$1",[first.lead_id]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM campaign_leads WHERE id=$1',[first.lead_id])).rows[0].n,1);
  });
  await t.test('test campaign creates four options, retains mode and queues no emails',async()=>{
    const testId=await call('save_campaign_content',{...content,slug:'test-only',is_test:true});
    const testOptions=(await db.query('SELECT * FROM campaign_products WHERE campaign_id=$1 ORDER BY display_order',[testId])).rows;
    assert.equal(testOptions.length,4);
    const result=await submit({campaign_slug:'test-only',product_id:testOptions[0].id,price_shown_cents:9900});
    assert.equal(result.is_test,true);assert.equal(result.delivery_id,null);
    await call('save_campaign_content',{...content,id:testId,slug:'test-only',is_test:false,products:[]});
    assert.equal((await db.query('SELECT is_test FROM campaigns WHERE id=$1',[testId])).rows[0].is_test,true);
  });
  await t.test('test-only votes never enter the CRM queue',async()=>{
    const result=await db.query("SELECT count(*)::int AS n FROM campaign_crm_sync q WHERE NOT EXISTS(SELECT 1 FROM campaign_leads l JOIN campaigns c ON c.id=l.campaign_id WHERE l.contact_id=q.contact_id AND NOT c.is_test)");
    assert.equal(result.rows[0].n,0);
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM campaign_crm_sync'),/permission denied/);
    await assert.rejects(db.query("SELECT queue_campaign_crm('00000000-0000-4000-8000-000000000001')"),/permission denied/);
    await db.exec('RESET ROLE');
  });
  await t.test('unsubscribe queues current consent and CRM migration is repeatable',async()=>{
    await db.exec(await readFile(new URL('../database/sql/campaign_zoho_sync.sql',import.meta.url),'utf8'));
    const cid=(await db.query('SELECT contact_id FROM campaign_leads WHERE id=$1',[first.lead_id])).rows[0].contact_id;
    await db.query('SELECT unsubscribe_campaign_contact($1)',[cid]);
    await db.query("UPDATE campaign_crm_sync SET claimed_at=now()-interval '6 minutes' WHERE contact_id=$1",[cid]);
    const claim=(await db.query('SELECT claim_campaign_crm($1) AS job',[cid])).rows[0].job;
    assert.equal(claim.snapshot.unsubscribed,true);assert.equal(claim.snapshot.consent,false);
    await db.query('SELECT finish_campaign_crm($1,$2,$3,$4,$5)',[cid,randomUUID(),claim.revision,'wrong-worker',null]);
    assert.equal((await db.query('SELECT status FROM campaign_crm_sync WHERE contact_id=$1',[cid])).rows[0].status,'sending');
    await db.query('SELECT finish_campaign_crm($1,$2,$3,$4,$5)',[cid,claim.claim_id,claim.revision,'zoho-123',null]);
  });
  await t.test('test votes cannot opt an existing contact back into marketing',async()=>{
    const opt=(await db.query("SELECT cp.* FROM campaign_products cp JOIN campaigns c ON c.id=cp.campaign_id WHERE c.slug='test-only' ORDER BY cp.display_order LIMIT 1")).rows[0];
    await submit({campaign_slug:'test-only',product_id:opt.id,price_shown_cents:opt.estimated_price_cents,marketing_consent:true,phone:'fake phone'});
    const contact=(await db.query("SELECT * FROM contacts WHERE email_normalized='buyer@example.com'")).rows[0];
    assert.equal(contact.marketing_consent,false);assert.ok(contact.unsubscribed_at);assert.equal(contact.phone,null);
  });
  await t.test('a required event failure rolls back the entire registration',async()=>{
    await db.exec("ALTER TABLE funnel_events ADD CONSTRAINT test_event_failure CHECK (event_type <> 'intent_submitted') NOT VALID");
    await assert.rejects(submit({email:'rollback@example.com'}),/test_event_failure/);
    await db.exec('ALTER TABLE funnel_events DROP CONSTRAINT test_event_failure');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM contacts WHERE email_normalized='rollback@example.com'")).rows[0].n,0);
  });
  await t.test('editor updates keep option IDs and transactionally reject foreign option edits',async()=>{
    const update={...content,id:cid,products:opts.map(p=>({...p,public_name:p.public_name+' revised'}))};
    await call('save_campaign_content',update);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM campaign_products WHERE campaign_id=$1',[cid])).rows[0].n,4);
    await assert.rejects(call('save_campaign_content',{...update,id:null,slug:'forbidden-editor-copy'}),/INVALID_PRODUCT/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM campaigns WHERE slug='forbidden-editor-copy'")).rows[0].n,0);
  });
  await t.test('hardening migration is repeatable and backfills unambiguous legacy history',async()=>{
    await db.query("UPDATE funnel_events SET campaign_lead_id=NULL,contact_id=NULL WHERE event_type='campaign_view'");
    await db.exec(await readFile(new URL('../database/sql/harden_campaign_lead_system.sql',import.meta.url),'utf8'));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM funnel_events WHERE event_type='campaign_view' AND campaign_lead_id IS NULL")).rows[0].n,0);
  });
  await t.test('shared database rate limit enforces its bound',async()=>{
    const hit=async()=> (await db.query("SELECT campaign_rate_limit('unit-test',2,600) AS ok")).rows[0].ok;
    assert.equal(await hit(),true);assert.equal(await hit(),true);assert.equal(await hit(),false);
  });
  await t.test('anonymous and logged-in browser roles cannot read contacts or invoke trusted RPCs',async()=>{
    await db.exec('GRANT USAGE ON SCHEMA public TO anon,authenticated; GRANT SELECT ON contacts,campaign_leads TO anon,authenticated;');
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      try {
        assert.equal((await db.query('SELECT * FROM contacts')).rows.length,0);
        assert.equal((await db.query('SELECT * FROM campaign_leads')).rows.length,0);
        await assert.rejects(db.query("SELECT register_campaign_intent('{}'::jsonb)"),/permission denied/);
        await assert.rejects(db.query("SELECT save_campaign_content('{}'::jsonb)"),/permission denied/);
      } finally { await db.exec('RESET ROLE'); }
    }
  });
  await db.close();
});
