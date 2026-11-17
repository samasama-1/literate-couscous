import Link from 'next/link';
import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
export const dynamic='force-dynamic';
type Report={run:{ran_at:string;counts:Record<string,number>}|null;next_due_at:string|null;recent:{id:string;campaign_lead_id:string|null;status:string;outcome:string|null;created_at:string;safe_retry_count:number;error_message:string|null}[]};
const date=(value:string|null)=>value&&value!=='infinity'?new Date(value).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}):'—';
export default async function CampaignMailPage(){
 await verifyAdminAccess();
 const enabled=process.env.CAMPAIGN_CONFIRMATION_RETRIES_ENABLED==='true';
 const {data,error}=process.env.CAMPAIGN_REGISTRATION_V2==='true'?await orderDb().rpc('campaign_confirmation_report'):{data:null,error:null};
 const report=data as Report|null;
 return <main className="container-site" style={{padding:'3rem 1.25rem'}}>
  <Link href="/admin/campaigns">← Campaign leads</Link><h1>Campaign acknowledgement emails</h1>
  <p>Automatic retries: {enabled?'enabled':'disabled'}. Only known-unsent confirmations qualify. Uncertain sends require admin reconciliation.</p>
  {error?<p role="alert">Report unavailable. Check the reviewed campaign safety migration and settings.</p>:report?<>
   <p>Last worker run: {date(report.run?.ran_at??null)} · Next candidate due: {date(report.next_due_at)}.</p>
   <p>Last run: processed {report.run?.counts.processed??0}, accepted {report.run?.counts.sent??0}, queued {report.run?.counts.queued??0}, failed {report.run?.counts.failed??0}, worker errors {report.run?.counts.errors??0}.</p>
   <p>Latest {report.recent.length} confirmations, capped at 100. This is a recent-job sample, not a complete backlog count. Provider acceptance does not prove inbox delivery.</p>
   <div style={{overflowX:'auto'}}><table><thead><tr><th>Created · Singapore</th><th>Status</th><th>Send outcome</th><th>Retry claims</th><th>Review</th></tr></thead><tbody>{report.recent.map(j=><tr key={j.id}><td>{date(j.created_at)}</td><td>{j.status}</td><td>{j.outcome??'Not attempted'}</td><td>{j.safe_retry_count}</td><td>{j.campaign_lead_id?<Link href={`/admin/campaigns/leads/${j.campaign_lead_id}`}>Open lead</Link>:'Lead unavailable'}{j.error_message&&<p>{j.error_message}</p>}</td></tr>)}</tbody></table></div>
  </>:<p>The new registration flow is not enabled. Apply reviewed SQL/settings before using this report.</p>}
 </main>;
}
