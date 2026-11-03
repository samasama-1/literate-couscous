// Fixed labels/numbers only. Never retain URLs, query text, headers, bodies or customer identifiers.
export type WorkerMetrics={errors:number;queries:number;query_errors:number;query_ms:number;query_max_ms:number;buckets:number[];sent:number;deferred:number};
export function workerMetrics():WorkerMetrics{return {errors:0,queries:0,query_errors:0,query_ms:0,query_max_ms:0,buckets:[0,0,0,0,0,0],sent:0,deferred:0};}
export function observeQuery(m:WorkerMetrics,ms:number,failed:boolean){
 const value=Math.max(0,Math.min(180000,Number.isFinite(ms)?ms:180000));m.queries++;m.query_errors+=Number(failed);m.query_ms+=value;m.query_max_ms=Math.max(m.query_max_ms,value);
 const bucket=[25,100,250,1000,5000].findIndex(bound=>value<=bound);m.buckets[bucket<0?5:bucket]++;
}
export function measuredFetch(onQuery:(ms:number,failed:boolean)=>void,request:typeof fetch=fetch):typeof fetch{
 return async(input,init)=>{const started=performance.now();try{const timeout=AbortSignal.timeout(10000);
 const response=await request(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,timeout]):timeout});onQuery(performance.now()-started,!response.ok);return response;}catch(e){onQuery(performance.now()-started,true);throw e;}};
}
export async function observeWorkerRequest(run:()=>Promise<Response>,emit:(line:string)=>void=line=>console.info(line)){
 const start=performance.now();let status=500;
 try{const response=await run();status=response.status;return response;}
 finally{emit(JSON.stringify({event:'operations.worker_request',status,failed:status>=400,latency_ms:Math.round(performance.now()-start)}));}
}
export function percentileBucket(buckets:number[],percentile=.95){
 const count=buckets.reduce((a,b)=>a+b,0);if(!count)return 'No samples';let total=0;
 for(let i=0;i<buckets.length;i++){total+=buckets[i];if(total>=count*percentile)return ['≤25 ms','≤100 ms','≤250 ms','≤1 s','≤5 s','>5 s'][i]||'Unknown';}return 'Unknown';
}

export async function observeOperation<T extends {error?:string}>(operation:'registration'|'collection_authorisation'|'collection_admin'|'order_operation',run:()=>Promise<T>,emit:(line:string)=>void=line=>console.info(line)):Promise<T>{
 const start=performance.now();let failed=true;
 try{const result=await run();failed=!!result.error;return result;}
 finally{emit(JSON.stringify({event:'operations.action_result',operation,failed,latency_ms:Math.round(performance.now()-start)}));}
}
