import { makeHandler } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// No external dependencies; the service role key stays inside Supabase.
Deno.serve(makeHandler({
  secret: Deno.env.get('OPERATIONS_EXPORT_SECRET'),
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (!url || !key) return {data:null,error:true};
    try {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(45000),
        headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify(args),
      });
      if (!response.ok) {
        // Forward only known control signals, never raw SQL/provider diagnostics.
        const failure=await response.json().catch(()=>null);
        const message=failure?.message;
        return {data:null,error:['EXPORT_BUSY','EXPORT_COOLDOWN'].includes(message)?{message}:true};
      }
      return {data:await response.json(),error:false};
    } catch { return {data:null,error:true}; }
  },
}));
