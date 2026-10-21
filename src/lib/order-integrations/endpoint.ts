import {timingSafeEqual,createHmac} from 'node:crypto';
export function authorizedWorker(header:string|null,secret:string|undefined) {
 if(!secret||!/^[a-f0-9]{64}$/i.test(secret)||!header)return false;
 const expected=Buffer.from(`Bearer ${secret}`),received=Buffer.from(header);
 return expected.length===received.length&&timingSafeEqual(expected,received);
}
export function scheduledInvocation(request:Request,secret:string|undefined,now=Date.now()):{kind:'email'|'crm';id:string;issued:number}|null {
 const kind=new URL(request.url).searchParams.get('kind');
 const id=request.headers.get('x-order-worker-id')||'',issued=request.headers.get('x-order-worker-issued')||'',signature=request.headers.get('x-order-worker-signature')||'';
 if(!secret||!/^[a-f0-9]{64}$/i.test(secret)||(kind!=='email'&&kind!=='crm')||!/^\d{10}$/.test(issued)||!/^[-a-f0-9]{36}$/.test(id)||!/^([a-f0-9]{64})$/.test(signature))return null;
 const age=now/1000-Number(issued);if(age>300||age< -30)return null;
 const expected=createHmac('sha256',secret).update(`${kind}:${id}:${issued}`).digest();
 if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))return null;return {kind,id,issued:Number(issued)};
}
export async function handleWorker(request:Request,secret:string|undefined,run:(kind:'email'|'crm')=>Promise<unknown>,claim?:(input:{kind:'email'|'crm';id:string;issued:number})=>Promise<boolean>) {
 const headers={'Cache-Control':'no-store'};
 if(!authorizedWorker(request.headers.get('authorization'),secret)){
  const signed=scheduledInvocation(request,secret);
  if(!signed||!claim)return Response.json({error:'Unauthorized'},{status:401,headers});
  try{if(!await claim(signed))return Response.json({error:'Invocation already used or expired'},{status:409,headers});}
  catch{return Response.json({error:'Invocation validation unavailable'},{status:503,headers});}
 }
 const kind=new URL(request.url).searchParams.get('kind');
 if(kind!=='email'&&kind!=='crm')return Response.json({error:'Invalid kind'},{status:400,headers});
 try{return Response.json(await run(kind),{headers});}catch{return Response.json({error:'Integration processing failed. Check admin job status and configuration.'},{status:503,headers});}
}
