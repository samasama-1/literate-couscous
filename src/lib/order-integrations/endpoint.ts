import {timingSafeEqual} from 'node:crypto';
export function authorizedWorker(header:string|null,secret:string|undefined) {
 if(!secret||!/^[a-f0-9]{64}$/i.test(secret)||!header)return false;
 const expected=Buffer.from(`Bearer ${secret}`),received=Buffer.from(header);
 return expected.length===received.length&&timingSafeEqual(expected,received);
}
export async function handleWorker(request:Request,secret:string|undefined,run:(kind:'email'|'crm')=>Promise<unknown>) {
 const headers={'Cache-Control':'no-store'};
 if(!authorizedWorker(request.headers.get('authorization'),secret))return Response.json({error:'Unauthorized'},{status:401,headers});
 const kind=new URL(request.url).searchParams.get('kind');
 if(kind!=='email'&&kind!=='crm')return Response.json({error:'Invalid kind'},{status:400,headers});
 try{return Response.json(await run(kind),{headers});}catch{return Response.json({error:'Integration processing failed. Check admin job status and configuration.'},{status:503,headers});}
}
