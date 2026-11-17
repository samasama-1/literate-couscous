'use server';
import 'server-only';
import {orderDb} from '@/lib/orders/db';
import {prepareDiscountCode} from '@/lib/discounts/codes';
import { after } from 'next/server';
import { syncCampaignContact } from '@/lib/campaigns/zoho-sync';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { deliverConfirmation } from '@/lib/campaigns/email';
import { campaignSession, limitRequest } from '@/lib/campaigns/security';
import { parseIntent } from '@/lib/campaigns/validation';

export async function startCampaignSession() { return campaignSession(true); }
export async function submitCampaignIntent(value: unknown) {
  let input;
  try { input = parseIntent(value); } catch(e) { return {error:e instanceof Error ? e.message : 'Invalid submission.'}; }
  try {
    const session = await campaignSession(true);
    await limitRequest('registration',30);
    await limitRequest('registration-email',6,600,input.email);
    const discounts=process.env.CAMPAIGN_DISCOUNTS_INSTALLED==='true';
    const candidate=discounts?prepareDiscountCode(process.env.ORDER_EMAIL_LINK_KEY||''):null;
    const safeRegistration=process.env.CAMPAIGN_REGISTRATION_V2==='true';
    if(safeRegistration&&(process.env.ORDER_RUNTIME_V2!=='true'||process.env.CAMPAIGN_EMAIL_PROVIDER!=='zoho'))return {error:'Registration is temporarily unavailable. Please contact hello@samasama.sg.'};
    const {data,error} = safeRegistration?await orderDb().rpc('register_campaign_intent_v2',{p:{...input,session_id:session},p_coupon:candidate}):discounts?await orderDb().rpc('register_campaign_intent_discount',{p:{...input,session_id:session},p_coupon:candidate}):await supabaseAdmin.rpc('register_campaign_intent',{p:{...input,session_id:session}});
    if (error) {
      const messages: Record<string,string> = {
        PRICE_CHANGED:'The estimated price changed. Refresh the page and confirm your pick at the new price.',
        PAID_RESPONSE_LOCKED:'This pick is linked to a payment. Please contact SamaSama to change it.',
        CAMPAIGN_INACTIVE:'This campaign is not accepting registrations right now.',
        INVALID_PRODUCT:'This option is no longer available. Please refresh the page.',
      };
      const known = Object.keys(messages).find(key=>error.message.includes(key));
      if (known) return {error:messages[known]};
      console.error('Campaign registration failed',error.code);
      return {error:'We could not save your pick. Please try again shortly.'};
    }
    const result = data as {lead_id:string;product_name:string;already_registered:boolean;delivery_id:string|null;is_test:boolean};
    let emailStatus: 'sent'|'queued'|'failed'|'test' = result.is_test ? 'test' : 'queued';
    // A saved registration remains successful even if email infrastructure throws.
    if (result.delivery_id) {
      try { emailStatus=await deliverConfirmation(result.delivery_id); } catch { emailStatus='queued'; }
    }
    if (!result.is_test) after(async () => {
      try {
        const {data:lead}=await supabaseAdmin.from('campaign_leads').select('contact_id').eq('id',result.lead_id).single();
        if(lead) await syncCampaignContact(lead.contact_id);
      } catch { /* Durable queue remains available for admin retry. */ }
    });
    revalidatePath('/admin/campaigns');
    revalidatePath(`/admin/campaigns/leads/${result.lead_id}`);
    // Keep public acknowledgements uniform: do not reveal existing-contact or delivery state.
    return {success:true as const,productName:result.product_name,purchaseIntent:input.purchase_intent,alreadyRegistered:false,emailStatus:!result.is_test?'queued':emailStatus};
  } catch(e) { return {error:e instanceof Error && e.message.startsWith('Too many requests.') ? e.message : 'Registration is temporarily unavailable. Please try again shortly.'}; }
}
