import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { stateCookie, zohoOAuthConfig } from '@/lib/zoho-oauth';

function reply(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
  response.cookies.set(stateCookie, '', { path: '/api/zoho', maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  try { await verifyAdminAccess(); } catch { return reply({ error: 'Sign in as an administrator first.' }, 403); }
  const state = request.nextUrl.searchParams.get('state') || '';
  const expected = request.cookies.get(stateCookie)?.value || '';
  if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
    return reply({ error: 'Authorization expired or invalid. Start again at /api/zoho/authorize.' }, 400);
  }
  if (request.nextUrl.searchParams.has('error')) return reply({ error: 'Zoho authorization was declined. You can start again.' }, 400);
  const code = request.nextUrl.searchParams.get('code');
  if (!code || code.length > 2048) return reply({ error: 'Missing or invalid authorization code.' }, 400);
  try {
    const config = zohoOAuthConfig();
    // Never send credentials to an accounts-server URL supplied by the callback.
    const server = request.nextUrl.searchParams.get('accounts-server');
    if (server && server.replace(/\/$/, '') !== config.accountsUrl) return reply({ error: 'Zoho data center differs from ZOHO_ACCOUNTS_URL. Correct the setting and authorize again.' }, 400);
    const result = await fetch(`${config.accountsUrl}/oauth/v2/token`, {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri }),
    });
    const data = await result.json();
    if (!result.ok || typeof data.refresh_token !== 'string' || !data.refresh_token) return reply({ error: 'Zoho did not issue a refresh token. Check client settings and reauthorize with offline consent.' }, 502);
    // One-time admin setup response, never logged or stored in browser cookies.
    return reply({ message: 'Save this refresh token as ZOHO_REFRESH_TOKEN in your server environment, then restart/redeploy. Keep it private; do not share this response.', ZOHO_REFRESH_TOKEN: data.refresh_token, ZOHO_API_DOMAIN: data.api_domain, ZOHO_ACCOUNTS_URL: config.accountsUrl });
  } catch { return reply({ error: 'Zoho token exchange failed. Check server configuration and start authorization again.' }, 502); }
}
