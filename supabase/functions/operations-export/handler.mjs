const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (status, body, headers={}) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type':'application/json', 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers},
});
async function sameSecret(a, b) {
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [x,y] = await Promise.all([digest(a),digest(b)]);
  const left = new Uint8Array(x), right = new Uint8Array(y);
  let different = 0;
  for (let i=0;i<left.length;i++) different |= left[i]^right[i];
  return different === 0;
}
export function makeHandler({secret, rpc, now=()=>Date.now(), maxInFlight=4, burst=20, refillPerSecond=5}) {
  // Cheap per-isolate backpressure, not a global/IP rate-limit guarantee.
  let inFlight=0, tokens=burst, lastRefill=now();
  return async request => {
    if (request.method !== 'POST') return reply(405,{error:'POST required'});
    if (!/^[a-f0-9]{64}$/.test(secret || '')) return reply(503,{error:'Export not configured'});
    const supplied = request.headers.get('X-Export-Secret') || '';
    if (supplied.length !== 64 || !await sameSecret(secret,supplied)) return reply(401,{error:'Unauthorized'});
    try {
      // Bound bodies even when Content-Length is absent or dishonest.
      const reader = request.body?.getReader();
      let size=0, body='';
      const decoder = new TextDecoder();
      if (reader) for (;;) {
        const {value,done}=await reader.read(); if(done) break;
        size+=value.byteLength;
        if(size>2048) { await reader.cancel(); return reply(413,{error:'Request too large'}); }
        body+=decoder.decode(value,{stream:true});
      }
      const p=JSON.parse(body);
      if (!p || Array.isArray(p) || typeof p.id!=='string' || !uuid.test(p.id)) return reply(400,{error:'Invalid request'});
      let name, args;
      if(p.action==='start') { name='start_operations_export'; args={p_id:p.id}; }
      else if(p.action==='page' && ['orders','activity'].includes(p.kind) && Number.isSafeInteger(p.after) && p.after>=0) {
        name='page_operations_export'; args={p_id:p.id,p_kind:p.kind,p_after:p.after,p_limit:250};
      } else return reply(400,{error:'Invalid request'});
      const time=now();tokens=Math.min(burst,tokens+Math.max(0,time-lastRefill)*refillPerSecond/1000);lastRefill=time;
      if(inFlight>=maxInFlight || tokens<1) return reply(429,{error:'Export busy; retry later'},{'Retry-After':'5'});
      tokens--;inFlight++;
      try {
        const {data,error}=await rpc(name,args);
        if(error?.message==='EXPORT_BUSY' || error?.message==='EXPORT_COOLDOWN') return reply(429,{error:'Export busy; retry later'},{'Retry-After':error.message==='EXPORT_COOLDOWN'?'300':'5'});
        if(error) return reply(503,{error:'Export unavailable; retry later'});
        return reply(200,data);
      } catch { return reply(503,{error:'Export unavailable; retry later'}); }
      finally { inFlight--; }
    } catch { return reply(400,{error:'Export request failed'}); }
  };
}
