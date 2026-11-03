import 'server-only';
import {measuredFetch} from '@/lib/operations/telemetry';
import {createClient} from '@supabase/supabase-js';
export function orderDb(onQuery?:(ms:number,failed:boolean)=>void){ return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(onQuery?{global:{fetch:measuredFetch(onQuery)}}:{})}); }
