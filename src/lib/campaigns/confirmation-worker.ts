import 'server-only';
import {orderDb} from '@/lib/orders/db';
import {mailSendingConfig} from '@/lib/mail/config';
import {prepareZohoMail} from '@/lib/mail/zoho-transport';
import {deliverConfirmation} from './email';
export async function processCampaignConfirmations(){
 if(process.env.CAMPAIGN_CONFIRMATION_RETRIES_ENABLED!=='true')return {enabled:false};
 // This consumer shares the reviewed V2 mailbox budget. Never silently fall back to unpaced sends.
 if(process.env.ORDER_RUNTIME_V2!=='true'||process.env.CAMPAIGN_EMAIL_PROVIDER!=='zoho')throw Error('CAMPAIGN_WORKER_SETUP_REQUIRED');
 const config=mailSendingConfig(),db=orderDb(),started=performance.now();
 const counts={processed:0,sent:0,queued:0,failed:0,errors:0};
 const {data,error}=await db.rpc('claim_campaign_confirmations',{p_limit:5});
 if(error||!Array.isArray(data))throw Error('CAMPAIGN_QUEUE_UNAVAILABLE');
 let sender:ReturnType<typeof prepareZohoMail>|undefined;
 const prepare=()=>sender??=prepareZohoMail(config);
 for(const job of data as {id:string;claim:string}[]){
  try {
   // Transport calls are bounded to 15 seconds each; do not start another after 25 seconds.
   if(performance.now()-started<25000){const outcome=await deliverConfirmation(job.id,prepare);counts[outcome]++;counts.processed++;}
  }catch{counts.errors++;}
  finally{const {error}=await db.rpc('finish_campaign_confirmation_claim',{p_id:job.id,p_claim:job.claim});if(error)counts.errors++;}
 }
 const cleanup=await db.rpc('cleanup_campaign_registration',{p_limit:100});if(cleanup.error)counts.errors++;
 const metrics=await db.rpc('record_campaign_confirmation_run',{p_counts:counts});if(metrics.error)counts.errors++;
 return {enabled:true,...counts};
}
