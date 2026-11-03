import {verifyAdminAccess} from '@/lib/adminAuth';
import {orderDb} from '@/lib/orders/db';
import {percentileBucket} from '@/lib/operations/telemetry';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import Link from 'next/link';
import styles from '@/components/admin/workspace.module.css';
export const dynamic='force-dynamic';
type Report={captured_at:string;queue:{kind:string;lane:string;status:string;jobs:number}[]|null;oldest:{kind:string;lane:string;created_at:string|null;due_at:string|null}[]|null;metrics:{kind:string;runs:number;errors:number;queries:number;query_errors:number;query_ms:number;query_max_ms:number;buckets:number[];sent:number;deferred:number}[]|null;limits:{kind:string;enabled:boolean;hourly_limit:number;reserved_urgent:number;reserved_security:number;minimum_gap_seconds:number}[]};
export default async function OperationsHealth(){
 await verifyAdminAccess();
 if(process.env.ORDER_RUNTIME_V2!=='true')return <AdminWorkspace section="operations"><h1>Operations health</h1><p>The reviewed runtime migration and rollout flag must be enabled before this report is available.</p></AdminWorkspace>;
 const {data,error}=await orderDb().rpc('order_runtime_report');const report=data as Report|null;
 return <AdminWorkspace section="operations"><header className={styles.heading}><div><h1>Operations health</h1><p>Queue and worker metrics. No customer details, credentials or private links.</p></div><Link href="/admin/operations" className={styles.button}>Refresh</Link></header>
 {error||!report?<p role="alert">Metrics unavailable. Check the runtime setup and worker logs; do not interpret missing metrics as a healthy queue.</p>:<>
 <section className={styles.panel}><h2>Queue</h2><table className={styles.table}><thead><tr><th>Channel</th><th>Priority lane</th><th>Status</th><th>Jobs</th></tr></thead><tbody>{report.queue?.map(row=><tr key={`${row.kind}-${row.lane}-${row.status}`}><td>{row.kind}</td><td>{row.lane}</td><td>{row.status}</td><td>{row.jobs}</td></tr>)}</tbody></table><p>Queued counts include scheduled future jobs. An old due time can indicate a blocked order, not just a slow worker.</p>
 <table className={styles.table}><thead><tr><th>Channel / lane</th><th>Oldest queued</th><th>Oldest due</th></tr></thead><tbody>{report.oldest?.map(row=><tr key={row.kind+row.lane}><td>{row.kind} / {row.lane}</td><td>{row.created_at?new Date(row.created_at).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}):'None'}</td><td>{row.due_at?new Date(row.due_at).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}):'None'}</td></tr>)}</tbody></table></section>
 <section className={styles.panel}><h2>Last hour · workers</h2>{!report.metrics?.length&&<p>No worker samples yet. Check scheduler execution before calling this healthy.</p>}{report.metrics?.map(row=><div key={row.kind}><h3>{row.kind}</h3><p>{row.runs} runs · {row.sent} accepted/synced · {row.deferred} deferred · {row.errors} processing errors</p><p>Database HTTP requests: {row.queries} · failed: {row.query_errors} · mean: {row.queries?Math.round(row.query_ms/row.queries):0} ms · p95 bucket: {percentileBucket(row.buckets)} · max: {Math.round(row.query_max_ms)} ms</p></div>)}<p>Query timings include database API/network time; they are not SQL execution timings. Worker failures also have fixed-label logs. Authentication/HTTP failures are reported in operations.worker_request logs. This is not whole-site request monitoring.</p></section>
 <section className={styles.panel}><h2>Configured provider budgets</h2>{report.limits.map(l=><p key={l.kind}>{l.kind}: {l.enabled?'Enabled':'Disabled'} · {l.hourly_limit}/hour · {l.reserved_urgent} protected from routine work ({l.reserved_security} reserved specifically for security) · minimum gap {l.minimum_gap_seconds}s</p>)}<p>Captured {new Date(report.captured_at).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})}. Manual refresh; no automatic polling.</p></section>
 </>}
 </AdminWorkspace>;
}
