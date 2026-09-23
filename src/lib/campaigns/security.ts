import 'server-only';
import { cookies, headers } from 'next/headers';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { uuidPattern } from './validation';
const cookieName = 'samasama_campaign_session';
function secret() {
  const value = process.env.CAMPAIGN_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error('Campaign security is not configured.');
  return value;
}
function sign(purpose: string, value: string) { return createHmac('sha256',secret()).update(`${purpose}:${value}`).digest('hex'); }
export function unsubscribeToken(contactId: string) { return `${contactId}.${sign('unsubscribe',contactId)}`; }
export function verifyUnsubscribeToken(value: unknown) {
  if (typeof value !== 'string') return null;
  const [id,mac,...extra] = value.split('.');
  if (!uuidPattern.test(id || '') || !/^[0-9a-f]{64}$/.test(mac || '') || extra.length) return null;
  return timingSafeEqual(Buffer.from(mac),Buffer.from(sign('unsubscribe',id))) ? id : null;
}
export async function campaignSession(create = false) {
  const jar = await cookies();
  const value = jar.get(cookieName)?.value;
  if (value) {
    const [id,mac] = value.split('.');
    if (uuidPattern.test(id) && mac === sign('session',id)) return id;
  }
  if (!create) throw new Error('Please refresh the page to start your visit.');
  const id = randomUUID();
  jar.set(cookieName,`${id}.${sign('session',id)}`,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*12});
  return id;
}
export async function limitRequest(scope: string, limit: number, seconds = 600, identity?: string) {
  const h = await headers();
  // Vercel overwrites x-vercel-forwarded-for. Self-hosted proxies must strip spoofed forwarding headers.
  const ip = h.get('x-vercel-forwarded-for') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const key = sign('rate',`${scope}:${identity || ip}`);
  const { data,error } = await supabaseAdmin.rpc('campaign_rate_limit',{p_key:key,p_limit:limit,p_seconds:seconds});
  if (error) throw new Error('Registration is temporarily unavailable. Please try again shortly.');
  if (!data) throw new Error('Too many requests. Please wait a few minutes and try again.');
}
