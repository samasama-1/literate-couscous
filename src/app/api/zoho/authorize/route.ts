import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { stateCookie, zohoOAuthConfig } from '@/lib/zoho-oauth';

export async function GET() {
  try { await verifyAdminAccess(); } catch {
    return NextResponse.json({ error: 'Sign in as an administrator first.' }, { status: 403 });
  }
  try {
    const config = zohoOAuthConfig();
    const state = randomBytes(32).toString('hex');
    const url = new URL('/oauth/v2/auth', config.accountsUrl);
    url.search = new URLSearchParams({
      client_id: config.clientId, redirect_uri: config.redirectUri,
      response_type: 'code', access_type: 'offline', prompt: 'consent', state,
      scope: 'ZohoCRM.modules.contacts.CREATE,ZohoCRM.modules.contacts.UPDATE,ZohoCRM.modules.deals.CREATE,ZohoCRM.modules.deals.UPDATE',
    }).toString();
    const response = NextResponse.redirect(url);
    response.headers.set('Cache-Control', 'no-store');
    response.cookies.set(stateCookie, state, { httpOnly: true, secure: config.redirectUri.startsWith('https:'), sameSite: 'lax', path: '/api/zoho', maxAge: 600 });
    return response;
  } catch {
    return NextResponse.json({ error: 'Configure ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REDIRECT_URI and the correct ZOHO_ACCOUNTS_URL.' }, { status: 503 });
  }
}
