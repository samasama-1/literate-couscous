import {handleWorker} from '@/lib/order-integrations/endpoint';
import {processOrderJobs} from '@/lib/order-integrations/worker';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
// GET supports authenticated cron providers; POST supports manual owner-controlled runs.
export async function GET(request:Request){return handleWorker(request,process.env.ORDER_WORKER_SECRET,processOrderJobs);}
export async function POST(request:Request){return handleWorker(request,process.env.ORDER_WORKER_SECRET,processOrderJobs);}
