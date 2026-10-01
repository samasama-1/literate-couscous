'use server';
import 'server-only';
import { after } from 'next/server';
import { syncCampaignContact } from '@/lib/campaigns/zoho-sync';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUnsubscribeToken, limitRequest } from '@/lib/campaigns/security';
export async function unsubscribeContact(formData: FormData) {
  try {
    const id = verifyUnsubscribeToken(formData.get('token'));
    if (!id) return {error:'Please use the unsubscribe link in your latest SamaSama email.'};
    await limitRequest('unsubscribe',20);
    const {error} = await supabaseAdmin.rpc('unsubscribe_campaign_contact',{p_contact_id:id});
    if (error) return {error:'We could not update your preference. Please try again.'};
    after(async()=>{try {await syncCampaignContact(id);} catch { /* Retry from admin. */ }});
    return {success:true};
  } catch { return {error:'We could not update your preference. Please try again shortly.'}; }
}
