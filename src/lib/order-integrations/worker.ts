import 'server-only';
import {orderDb} from '@/lib/orders/db';
import {mailSendingConfig} from '@/lib/mail/config';
import {prepareZohoMail} from '@/lib/mail/zoho-transport';
import {emailStillRelevant,publicOrigin} from './policy';
import {orderMessage} from './messages';
import {crmRecord,prepareCrm,validateCrm} from './crm';
type Job={id:string;order_id:string;event:string;payload:Record<string,unknown>;lease_token:string;attempts:number;kind:'email'|'crm'};
export async function processOrderJobs(kind:'email'|'crm') {
 if(process.env[kind==='email'?'ORDER_EMAIL_ENABLED':'ORDER_CRM_ENABLED']!=='true')return {enabled:false,processed:0};
 // Validate deployment settings before claiming any jobs.
 const origin=publicOrigin(process.env.NEXT_PUBLIC_SITE_URL||'https://www.samasama.sg');
 const crm={clientId:process.env.ZOHO_CLIENT_ID||'',clientSecret:process.env.ZOHO_CLIENT_SECRET||'',refreshToken:process.env.ZOHO_REFRESH_TOKEN||'',accountsUrl:process.env.ZOHO_ACCOUNTS_URL||'',apiUrl:process.env.ZOHO_API_DOMAIN||'',module:process.env.ORDER_CRM_MODULE||''};
 if(kind==='email'){mailSendingConfig();if(!/^[a-f0-9]{64}$/i.test(process.env.ORDER_EMAIL_LINK_KEY||''))throw Error('ORDER_EMAIL_LINK_KEY');}else validateCrm(crm);
 const db=orderDb();const {data,error}=await db.rpc('claim_order_jobs',{p_kind:kind,p_limit:3});if(error)throw Error('QUEUE_UNAVAILABLE');
 const jobs=(data||[]) as Job[];
 let crmSender:Awaited<ReturnType<typeof prepareCrm>>|undefined;
 for(const job of jobs){
  let started=false;
  const finish=async(status:string,errorCode:string|null=null,providerId?:string)=>{
   const {data:saved,error}=await db.from('order_integration_jobs').update({status,error_code:errorCode,completed_at:new Date().toISOString(),...(providerId?{provider_id:providerId}:{}),...(status==='sent'||status==='skipped'?{payload:{}}:{})}).eq('id',job.id).eq('status','processing').eq('lease_token',job.lease_token).select('id').maybeSingle();
   if(error||!saved)throw Error('QUEUE_WRITE_FAILED');
  };
  try {
   // Fetch only operational fields; addresses and bank references never enter this worker.
   const {data:o,error:readError}=await db.from('orders').select('id,order_code,batch_id,customer_name,customer_email,customer_phone,quantity,payment_status,deposit_due_cents,deposit_verified_at,final_total_cents,balance_due_cents,balance_token_hash,balance_token_expires_at,balance_requested_at,balance_paid_at,ready_at,fulfilled_at,fulfilment_method,created_at,fulfilment_status_changed_at').eq('id',job.order_id).single();
   if(readError||!o)throw Error('ORDER_READ_FAILED');
   let productName='';
   if(kind==='email'){
    const {data:batch,error:batchError}=await db.from('batches').select('product_id').eq('id',o.batch_id).single();if(batchError||!batch)throw Error('BATCH_READ_FAILED');
    const {data:product,error:productError}=await db.from('products').select('name').eq('id',batch.product_id).single();if(productError||!product)throw Error('PRODUCT_READ_FAILED');
    productName=product.name;
   }
   if(kind==='email'&&!emailStillRelevant(job.event,job.payload,o)){await finish('skipped','NO_LONGER_RELEVANT');continue;}
   const message=kind==='email'?orderMessage(job.event,{...job.payload,product:productName,batch_id:o.batch_id},job.order_id,origin,process.env.ORDER_EMAIL_LINK_KEY||''):null;
   const sendMail=kind==='email'?await prepareZohoMail(mailSendingConfig()):null;
   const sendCrm=kind==='crm'?(crmSender??=await prepareCrm(crm)):null;
   const crmPayload=kind==='crm'?crmRecord(o):null;
   // Recheck state after network preparation; fail closed on a changed order.
   const {data:latest,error:latestError}=await db.from('orders').select('customer_email,payment_status,deposit_verified_at,balance_token_hash,balance_token_expires_at,balance_paid_at,ready_at,fulfilled_at,final_total_cents,deposit_due_cents,balance_due_cents').eq('id',job.order_id).single();
   if(latestError||!latest)throw Error('ORDER_READ_FAILED');
   if(kind==='email'&&!emailStillRelevant(job.event,job.payload,latest)){await finish('skipped','NO_LONGER_RELEVANT');continue;}
   const {data:marker,error:markerError}=await db.from('order_integration_jobs').update({send_started_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('lease_token',job.lease_token).is('send_started_at',null).select('id').maybeSingle();
   if(markerError||!marker)continue;
   started=true;
   const providerId=kind==='email'?await sendMail!(message!):await sendCrm!(crmPayload!);
   await finish('sent',null,providerId);
  }catch{
   // Never replay a POST with an uncertain outcome, including CRM workflows in future.
   if(started){try{await finish('review','PROVIDER_OUTCOME_UNCERTAIN');}catch{/* Expired lease will become review. */}}
   else {
    const terminal=job.attempts>=5;
    await db.from('order_integration_jobs').update({status:terminal?'failed':'queued',error_code:'PREPARATION_FAILED',available_at:new Date(Date.now()+Math.min(3600,60*2**job.attempts)*1000).toISOString()}).eq('id',job.id).eq('status','processing').eq('lease_token',job.lease_token);
   }
  }
 }
 return {enabled:true,processed:jobs.length};
}
