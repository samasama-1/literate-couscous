import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { syncZohoVote, type ZohoVote } from './zoho-transport';
// Separate client for the new migration until generated database types are refreshed.
export function crmDatabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function syncCampaignContact(contactId:string) {
  if(process.env.ZOHO_CAMPAIGN_SYNC_ENABLED!=='true') return;
  const clientId=process.env.ZOHO_CLIENT_ID,clientSecret=process.env.ZOHO_CLIENT_SECRET,refreshToken=process.env.ZOHO_REFRESH_TOKEN;
  if(!clientId || !clientSecret || !refreshToken) return;
  const db=crmDatabase();
  const {data:job,error}=await db.rpc('claim_campaign_crm',{p_contact_id:contactId});
  if(error || !job) return;
  let zohoId:string|null=null, failure:string|null=null;
  try {
    zohoId=await syncZohoVote({clientId,clientSecret,refreshToken,accountsUrl:process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com',apiDomain:process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com'},job.snapshot as ZohoVote);
  } catch(e) { failure=e instanceof Error && e.message.startsWith('Zoho') ? e.message : 'Zoho request failed or timed out. Retry from the lead detail.'; }
  await db.rpc('finish_campaign_crm',{p_contact_id:contactId,p_claim_id:job.claim_id,p_revision:job.revision,p_zoho_id:zohoId,p_error:failure});
}
