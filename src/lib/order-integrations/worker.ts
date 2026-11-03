import 'server-only';
import {workerMetrics,observeQuery} from '@/lib/operations/telemetry';
import {collectionToken} from '@/lib/collections/access';
import {orderDb} from '@/lib/orders/db';
import {mailSendingConfig} from '@/lib/mail/config';
import {prepareZohoMail} from '@/lib/mail/zoho-transport';
import {emailStillRelevant,publicOrigin} from './policy';
import {orderMessage} from './messages';
import {crmRecord,prepareCrm,validateCrm} from './crm';
type WorkerOrder=import('./policy').OrderState&{id:string;batch_id:string;customer_name:string;quantity:number;ready_at:string;customer_email:string;fulfilment_method:string;collection_access_version:number;integration_revision:number};
type Job={id:string;order_id:string;event:string;payload:Record<string,unknown>;lease_token:string;attempts:number;kind:'email'|'crm';priority?:number;preparation_failures?:number};
export async function processOrderJobs(kind:'email'|'crm') {
 if(process.env[kind==='email'?'ORDER_EMAIL_ENABLED':'ORDER_CRM_ENABLED']!=='true')return {enabled:false,processed:0};
 // Validate deployment settings before claiming any jobs.
 const origin=publicOrigin(process.env.NEXT_PUBLIC_SITE_URL||'https://www.samasama.sg');
 const crm={clientId:process.env.ZOHO_CLIENT_ID||'',clientSecret:process.env.ZOHO_CLIENT_SECRET||'',refreshToken:process.env.ZOHO_REFRESH_TOKEN||'',accountsUrl:process.env.ZOHO_ACCOUNTS_URL||'',apiUrl:process.env.ZOHO_API_DOMAIN||'',module:process.env.ORDER_CRM_MODULE||''};
 if(kind==='email'){mailSendingConfig();if(!/^[a-f0-9]{64}$/i.test(process.env.ORDER_EMAIL_LINK_KEY||''))throw Error('ORDER_EMAIL_LINK_KEY');}else validateCrm(crm);
 const manualBalances=process.env.MANUAL_BALANCE_INSTALLED==='true';
 const authInstalled=process.env.COLLECTION_AUTH_INSTALLED==='true';
 const collectionEnabled=authInstalled&&process.env.DELEGATED_COLLECTION_ENABLED==='true';
 const storageEnabled=process.env.FULFILMENT_V2_ENABLED==='true'&&process.env.COLLECTION_FEE_HOLD_INSTALLED!=='true';
 const runtimeV2=process.env.ORDER_RUNTIME_V2==='true',metrics=workerMetrics(),runStarted=performance.now();
 const db=orderDb((ms,failed)=>observeQuery(metrics,ms,failed));
 try{
 const {data,error}=await db.rpc(runtimeV2?'claim_order_jobs_v2':'claim_order_jobs',{p_kind:kind,p_limit:runtimeV2?10:3});if(error)throw Error('QUEUE_UNAVAILABLE');
 const jobs=((data||[]) as Job[]).sort((a,b)=>(a.priority??1)-(b.priority??1));
 const contextResult=runtimeV2&&jobs.length?await db.rpc('order_job_contexts',{p_claims:jobs.map(j=>({id:j.id,lease:j.lease_token}))}):null;
 const contexts=(contextResult?.data||[]) as {job_id:string;order:WorkerOrder;product:string|null;image_url:string|null;policy_version:string|null}[];
 let mailSender:Awaited<ReturnType<typeof prepareZohoMail>>|undefined;
 let crmSender:Awaited<ReturnType<typeof prepareCrm>>|undefined;
 for(const [index,job] of jobs.entries()){
  if(runtimeV2&&performance.now()-runStarted>60000){
   const {error:releaseError}=await db.rpc('release_order_job_claims',{p_claims:jobs.slice(index).map(j=>({id:j.id,lease:j.lease_token}))});if(releaseError)metrics.errors++;break;
  }
  let started=false;
  const finish=async(status:string,errorCode:string|null=null,providerId?:string)=>{
   const {data:saved,error}=await db.from('order_integration_jobs').update({status,error_code:errorCode,completed_at:new Date().toISOString(),...(providerId?{provider_id:providerId}:{}),...(status==='sent'||status==='skipped'?{payload:{}}:{})}).eq('id',job.id).eq('status','processing').eq('lease_token',job.lease_token).select('id').maybeSingle();
   if(error||!saved)throw Error('QUEUE_WRITE_FAILED');
  };
  try {
   if(runtimeV2&&kind==='email'&&!['order_received','deposit_received','balance_requested','balance_paid','ready','collection_access','collector_changed'].includes(job.event)){await finish('failed','UNSUPPORTED_EVENT');metrics.errors++;continue;}
   if(kind==='email'&&job.event==='collection_access'&&!collectionEnabled){await finish('skipped','DELEGATION_PAUSED');continue;}
   // Fetch only operational fields; addresses and bank references never enter this worker.
   const context=contexts.find(c=>c.job_id===job.id);
   const {data:o,error:readError}=runtimeV2?{data:context?.order,error:contextResult?.error}:await db.from('orders').select('id,order_code,batch_id,customer_name,customer_email,customer_phone,quantity,payment_status,deposit_due_cents,deposit_verified_at,final_total_cents,balance_due_cents,balance_token_hash,balance_token_expires_at,balance_requested_at,balance_paid_at,ready_at,fulfilled_at,fulfilment_method,created_at,fulfilment_status_changed_at'+(authInstalled?',collection_access_version':'')).eq('id',job.order_id).single<WorkerOrder>();
   if(readError||!o)throw Error('ORDER_READ_FAILED');
   if(kind==='email'&&!emailStillRelevant(job.event,job.payload,o,Date.now(),manualBalances)){await finish('skipped','NO_LONGER_RELEVANT');continue;}
   let productName='',imageUrl:unknown=null,collectionUrl:string|undefined,collectionPolicy=false;
   if(kind==='email'){
    if(runtimeV2){productName=context?.product||'';imageUrl=context?.image_url;if(!productName)throw Error('PRODUCT_READ_FAILED');}
    else{
    const {data:batch,error:batchError}=await db.from('batches').select('product_id').eq('id',o.batch_id).single();if(batchError||!batch)throw Error('BATCH_READ_FAILED');
    const {data:product,error:productError}=await db.from('products').select('name,image_url').eq('id',batch.product_id).single();if(productError||!product)throw Error('PRODUCT_READ_FAILED');
    productName=product.name;imageUrl=product.image_url;
    }
    if((collectionEnabled&&(job.event==='ready'||job.event==='collection_access'))&&o.fulfilment_method==='collection'&&o.ready_at){
     const {data:account,error:accountError}=runtimeV2?{data:context?.policy_version?{policy_version:context.policy_version}:null,error:null}:await db.from('order_collection_accounts').select('policy_version').eq('order_id',o.id).maybeSingle();
     if(accountError)throw Error('COLLECTION_POLICY_READ_FAILED');
     collectionPolicy=storageEnabled&&!!account;
     const {data:version,error:versionError}=runtimeV2?{data:{collection_access_version:context?.order.collection_access_version},error:null}:await db.from('orders').select('collection_access_version').eq('id',o.id).single();if(versionError||!version)throw Error('COLLECTION_ACCESS_READ_FAILED');
     collectionUrl=`${origin}/collection/${collectionToken({...o,...version},process.env.ORDER_EMAIL_LINK_KEY||'')}`;
    }
   }
   const sendMail=kind==='email'?(mailSender??=await prepareZohoMail(mailSendingConfig())):null;
   const sendCrm=kind==='crm'?(crmSender??=await prepareCrm(crm)):null;
   const crmPayload=kind==='crm'?crmRecord(o):null;
   // Recheck state after network preparation; fail closed on a changed order.
   const {data:latest,error:latestError}=await db.from('orders').select('customer_email,payment_status,deposit_verified_at,balance_token_hash,balance_token_expires_at,balance_paid_at,ready_at,fulfilled_at,final_total_cents,deposit_due_cents,balance_due_cents,fulfilment_method'+(authInstalled?',collection_access_version':'')).eq('id',job.order_id).single<WorkerOrder>();
   if(latestError||!latest)throw Error('ORDER_READ_FAILED');
   if(kind==='email'&&!emailStillRelevant(job.event,job.payload,latest,Date.now(),manualBalances)){await finish('skipped','NO_LONGER_RELEVANT');continue;}
   if(kind==='email'&&collectionUrl){const boundVersion=runtimeV2?context?.order.collection_access_version:(parseInt(String(o.collection_access_version),10)||1);if(latest.collection_access_version!==boundVersion||latest.fulfilment_method!=='collection'){await finish('skipped','COLLECTION_ACCESS_CHANGED');continue;}}
   const message=kind==='email'?orderMessage(job.event,{...job.payload,...(job.event==='ready'?{balance_cents:latest.balance_paid_at?0:latest.balance_due_cents}:{}),product:productName,image_url:imageUrl,batch_id:o.batch_id,collection_url:collectionUrl,collection_policy:collectionPolicy},job.order_id,origin,process.env.ORDER_EMAIL_LINK_KEY||''):null;
   const {data:marker,error:markerError}=runtimeV2?await db.rpc('begin_order_job_send',{p_id:job.id,p_lease:job.lease_token,p_revision:context?.order.integration_revision}):await db.from('order_integration_jobs').update({send_started_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('lease_token',job.lease_token).is('send_started_at',null).select('id').maybeSingle();
   if(markerError)throw Error('SEND_MARKER_FAILED');
   if(runtimeV2&&marker!=='allowed'){if(marker==='deferred'||marker==='changed')metrics.deferred++;continue;}
   if(!marker)continue;
   started=true;
   const providerId=kind==='email'?await sendMail!(message!):await sendCrm!(crmPayload!);
   await finish('sent',null,providerId);metrics.sent++;
  }catch{
   metrics.errors++;
   // Never replay a POST with an uncertain outcome, including CRM workflows in future.
   if(started){try{await finish('review','PROVIDER_OUTCOME_UNCERTAIN');}catch{/* Expired lease will become review. */}}
   else {
    const failures=(job.preparation_failures||0)+1,terminal=runtimeV2?failures>=5:job.attempts>=5;
    await db.from('order_integration_jobs').update({status:terminal?'failed':'queued',error_code:'PREPARATION_FAILED',...(runtimeV2?{preparation_failures:failures}:{}),available_at:new Date(Date.now()+Math.min(3600,60*2**job.attempts)*1000).toISOString()}).eq('id',job.id).eq('status','processing').eq('lease_token',job.lease_token);
   }
  }
 }
 return {enabled:true,processed:jobs.length};
 }catch(e){metrics.errors++;throw e;}finally{
  if(runtimeV2){
   try{const {error:metricsError}=await orderDb(()=>{}).rpc('record_order_worker_metrics',{p_kind:kind,p_data:metrics});if(metricsError)console.warn(JSON.stringify({event:'operations.metrics_write_failed',kind}));}
   catch{console.warn(JSON.stringify({event:'operations.metrics_write_failed',kind}));}
  }
  console.info(JSON.stringify({event:'operations.worker',kind,...metrics}));
 }
}
