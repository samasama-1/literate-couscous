'use server';
import 'server-only';
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
    const {data,error} = await supabaseAdmin.rpc('register_campaign_intent',{p:{...input,session_id:session}});
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
    revalidatePath('/admin/campaigns');
    revalidatePath(`/admin/campaigns/leads/${result.lead_id}`);
    return {success:true as const,productName:result.product_name,purchaseIntent:input.purchase_intent,alreadyRegistered:result.already_registered,emailStatus};
  } catch(e) { return {error:e instanceof Error ? e.message : 'Registration is temporarily unavailable.'}; }
}
