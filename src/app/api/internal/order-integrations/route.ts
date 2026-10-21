import {orderDb} from '@/lib/orders/db';
import {handleWorker} from '@/lib/order-integrations/endpoint';
import {processOrderJobs} from '@/lib/order-integrations/worker';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
async function claimInvocation(input:{kind:'email'|'crm';id:string;issued:number}) {
 const {data,error}=await orderDb().rpc('claim_order_worker_invocation',{p_kind:input.kind,p_id:input.id,p_issued:input.issued});
 if(error)throw Error('INVOCATION_VALIDATION_FAILED');return data===true;
}
// GET supports authenticated cron providers; POST supports manual owner-controlled runs.
export async function GET(request:Request){return handleWorker(request,process.env.ORDER_WORKER_SECRET,processOrderJobs,claimInvocation);}
export async function POST(request:Request){return handleWorker(request,process.env.ORDER_WORKER_SECRET,processOrderJobs,claimInvocation);}
