import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { formatMoney } from './utils';
import { unsubscribeToken } from './security';
import { purchaseIntentLabels, type PurchaseIntent } from './types';
import type {Json} from '@/types/database';
import {mailSendingConfig} from '@/lib/mail/config';
import {prepareZohoMail} from '@/lib/mail/zoho-transport';
import {deliverOnce, type DeliveryStore} from '@/lib/mail/delivery';
function escapeHtml(value: string) { return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function baseUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://www.samasama.sg';
  return new URL(value.includes('://') ? value : `https://${value}`).origin;
}
// Durable outbox: registration and its immutable content snapshot are saved together.
export async function deliverConfirmation(id: string): Promise<'sent'|'queued'|'failed'> {
  const {data:job,error} = await supabaseAdmin.from('email_deliveries').select('*').eq('id',id).single();
  if (error || !job || job.template_key !== 'intent_confirmation' || !job.contact_id) return 'failed';
  if (job.status === 'sent') return 'sent';
  const provider = process.env.CAMPAIGN_EMAIL_PROVIDER;
  if (provider !== 'resend' && provider !== 'zoho') return 'queued';
  // Do not enable partial setup or change a queued job merely by authorizing a mailbox.
  if (provider === 'resend' && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)) return 'queued';
  if (provider === 'zoho' && (!process.env.ZOHO_MAIL_CLIENT_ID || !process.env.ZOHO_MAIL_CLIENT_SECRET
    || !process.env.ZOHO_MAIL_REFRESH_TOKEN || !process.env.ZOHO_MAIL_ACCOUNT_ID)) return 'queued';
  // Every state update is compare-and-set. Metadata retains the original message fields;
  // only _mail_outcome changes. The existing provider column records the actual sender.
  const store: DeliveryStore = {
    async claim(expected, at, selected, metadata) {
      let query = supabaseAdmin.from('email_deliveries').update({status:'sending',attempted_at:at,provider:selected,metadata:metadata as Json,error_message:null}).eq('id',id).eq('status',expected.status);
      query = expected.attempted_at ? query.eq('attempted_at',expected.attempted_at) : query.is('attempted_at',null);
      const result = await query.select('id').maybeSingle();
      if (result.error) return false;
      return !!result.data;
    },
    async markSending(at, metadata) {
      const result = await supabaseAdmin.from('email_deliveries').update({metadata:metadata as Json}).eq('id',id).eq('status','sending').eq('attempted_at',at).select('id').maybeSingle();
      return !result.error && !!result.data;
    },
    async finish(at, patch) {
      const result = await supabaseAdmin.from('email_deliveries').update({...patch,metadata:patch.metadata as Json}).eq('id',id).eq('status','sending').eq('attempted_at',at).select('id').maybeSingle();
      return !result.error && !!result.data;
    },
    async block(expected, message) {
      let query = supabaseAdmin.from('email_deliveries').update({error_message:message}).eq('id',id).eq('status',expected.status);
      query = expected.attempted_at ? query.eq('attempted_at',expected.attempted_at) : query.is('attempted_at',null);
      await query;
    },
  };
  const outcome = await deliverOnce({job, provider, store,
    buildMessage: () => {
      const snapshot = job.metadata as Record<string, unknown>;
      const name = String(snapshot.product_name || 'Your selection');
      const price = formatMoney(Number(snapshot.price_shown_cents),String(snapshot.currency));
      const intent = purchaseIntentLabels[snapshot.purchase_intent as PurchaseIntent];
      if (!intent || !Number.isSafeInteger(snapshot.price_shown_cents) || /[\r\n]/.test(name)) throw new Error('Invalid email snapshot.');
      if (provider === 'zoho' && process.env.EMAIL_REPLY_TO && process.env.EMAIL_REPLY_TO.toLowerCase() !== (process.env.ZOHO_MAIL_FROM || 'hello@samasama.sg').toLowerCase()) throw new Error('Unsupported reply destination.');
      const url = `${baseUrl()}/unsubscribe?token=${unsubscribeToken(job.contact_id!)}`;
      const lines = ['Hi,','', 'Thanks for helping us decide what SamaSama should bring in next.', '', `You picked: ${name}`, `Estimated launch price: ${price}`, `Your response: ${intent}`, '', "This records your pick, not an order or payment. We're collecting responses before deciding what moves forward.", '', 'If you opted in to updates, we will let you know about the next steps.', '', '— SamaSama', 'Tested first. Bought together.', '', `Manage marketing preferences: ${url}`];
      return {to:job.recipient_email,subject:`We recorded your pick: ${name}`,text:lines.join('\n'),
        html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;line-height:1.6">${lines.map(line=>`<p>${escapeHtml(line)}</p>`).join('')}</div>`,
        replyTo:process.env.EMAIL_REPLY_TO || undefined};
    },
    prepare: async () => {
      if (provider === 'zoho') return prepareZohoMail(mailSendingConfig());
      const key = process.env.RESEND_API_KEY!;
      return async message => {
        const response = await fetch('https://api.resend.com/emails',{
          method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000),
          headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`intent/${job.id}`},
          body:JSON.stringify({from:process.env.EMAIL_FROM,to:message.to,reply_to:message.replyTo,
            subject:message.subject,text:message.text,html:message.html}),
        });
        const result = await response.json().catch(()=>({}));
        if (!response.ok || typeof result.id !== 'string' || !result.id) throw new Error('EMAIL_SEND_UNCONFIRMED');
        return result.id;
      };
    },
  });
  // Status/audit inserts are best-effort after durable delivery state. Never leak provider text.
  if (outcome === 'sent') await supabaseAdmin.from('funnel_events').insert({contact_id:job.contact_id,campaign_lead_id:job.campaign_lead_id,event_type:'confirmation_email_sent',metadata:{delivery_id:id}});
  else if (outcome === 'failed') await supabaseAdmin.from('funnel_events').insert({contact_id:job.contact_id,campaign_lead_id:job.campaign_lead_id,event_type:'confirmation_email_failed',metadata:{delivery_id:id}});
  return outcome;
}
