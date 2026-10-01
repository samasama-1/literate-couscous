import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { formatMoney } from './utils';
import { unsubscribeToken } from './security';
import { purchaseIntentLabels, type PurchaseIntent } from './types';
function escapeHtml(value: string) { return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function baseUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://www.samasama.sg';
  return new URL(value.includes('://') ? value : `https://${value}`).origin;
}
// Durable outbox: the row and its immutable content snapshot are created in the registration transaction.
export async function deliverConfirmation(id: string): Promise<'sent'|'queued'|'failed'> {
  const {data:job,error} = await supabaseAdmin.from('email_deliveries').select('*').eq('id',id).single();
  if (error || !job || job.template_key !== 'intent_confirmation' || !job.contact_id) return 'failed';
  if (job.status === 'sent') return 'sent';
  // Email stays queued until a sender is deliberately selected. Zoho Mail setup is separate.
  if (process.env.CAMPAIGN_EMAIL_PROVIDER !== 'resend') return 'queued';
  const key = process.env.RESEND_API_KEY;
  if (!key || !process.env.EMAIL_FROM) return 'queued';
  const attempted = job.attempted_at ? Date.parse(job.attempted_at) : 0;
  // Resend deduplicates for 24h. Never automatically resend an ambiguous older attempt.
  if (attempted && Date.now()-attempted>23*60*60*1000) {
    await supabaseAdmin.from('email_deliveries').update({status:'failed',error_message:'Automatic retry stopped after 23 hours. Check the provider log before arranging a manual resend.'}).eq('id',id);
    return 'failed';
  }
  if (job.status==='sending' && attempted && Date.now()-attempted<10*60*1000) return 'queued';
  let claim = supabaseAdmin.from('email_deliveries').update({status:'sending',attempted_at:job.attempted_at || new Date().toISOString()}).eq('id',id).eq('status',job.status);
  claim = job.attempted_at ? claim.eq('attempted_at',job.attempted_at) : claim.is('attempted_at',null);
  const {data:claimed,error:claimError} = await claim.select('id').maybeSingle();
  if (claimError || !claimed) return 'queued';
  try {
    const snapshot = job.metadata as Record<string, unknown>;
    const name = String(snapshot.product_name || 'Your selection');
    const price = formatMoney(Number(snapshot.price_shown_cents),String(snapshot.currency));
    const intent = purchaseIntentLabels[snapshot.purchase_intent as PurchaseIntent];
    if (!intent || !Number.isSafeInteger(snapshot.price_shown_cents)) throw new Error('Invalid email snapshot; requires admin review.');
    const url = `${baseUrl()}/unsubscribe?token=${unsubscribeToken(job.contact_id)}`;
    const lines = ['Hi,','', 'Thanks for helping us decide what SamaSama should bring in next.', '', `You picked: ${name}`, `Estimated launch price: ${price}`, `Your response: ${intent}`, '', "This records your pick, not an order or payment. We're collecting responses before deciding what moves forward.", '', 'If you opted in to updates, we will let you know about the next steps.', '', '— SamaSama', 'Tested first. Bought together.', '', `Manage marketing preferences: ${url}`];
    const response = await fetch('https://api.resend.com/emails',{
      method:'POST',signal:AbortSignal.timeout(12000),
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`intent/${job.id}`},
      body:JSON.stringify({from:process.env.EMAIL_FROM,to:job.recipient_email,reply_to:process.env.EMAIL_REPLY_TO || undefined,
        subject:`We recorded your pick: ${name}`,text:lines.join('\n'),
        html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;line-height:1.6">${lines.map(line=>`<p>${escapeHtml(line)}</p>`).join('')}</div>`}),
    });
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
    const {error:saveError} = await supabaseAdmin.from('email_deliveries').update({status:'sent',sent_at:new Date().toISOString(),provider_message_id:result.id,error_message:null}).eq('id',id);
    if (saveError) throw new Error('Provider accepted email but delivery log update failed. Retry within 23 hours.');
    await supabaseAdmin.from('funnel_events').insert({contact_id:job.contact_id,campaign_lead_id:job.campaign_lead_id,event_type:'confirmation_email_sent',metadata:{delivery_id:id}});
    return 'sent';
  } catch(error) {
    const message = error instanceof Error ? error.message : 'Email delivery failed.';
    await supabaseAdmin.from('email_deliveries').update({status:'failed',failed_at:new Date().toISOString(),error_message:message}).eq('id',id);
    await supabaseAdmin.from('funnel_events').insert({contact_id:job.contact_id,campaign_lead_id:job.campaign_lead_id,event_type:'confirmation_email_failed',metadata:{delivery_id:id}});
    return 'failed';
  }
}
