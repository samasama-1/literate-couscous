// Framework-independent handlers so admin/state/redirect/error behavior is tested offline.
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {exchangeMailAuthorization, MAIL_CALLBACK_PATH, MAIL_SCOPES, MAIL_STATE_COOKIE, validateMailOAuth, validateMailRedirect, MailError, type MailOAuthConfig} from './zoho-transport';
export type OAuthConfig = MailOAuthConfig & {redirectUri: string};
type Dependencies = {admin: () => Promise<unknown>; config: () => OAuthConfig; request?: typeof fetch};
const headers = {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"};
function cookie(value: string, secure: boolean, age: number) {
  return `${MAIL_STATE_COOKIE}=${value}; Path=/api/zoho/mail; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
}
function reply(body: Record<string, unknown>, status: number, secure: boolean) {
  return Response.json(body, {status, headers: {...headers, 'Set-Cookie': cookie('', secure, 0)}});
}
export function createMailOAuthHandlers(deps: Dependencies) {
  return {
    async authorize(request: Request) {
      try { await deps.admin(); } catch { return Response.json({error: 'Sign in as an approved administrator first.'}, {status: 403, headers}); }
      try {
        const c = deps.config(); validateMailOAuth(c);
        const redirect = validateMailRedirect(c.redirectUri);
        if (new URL(request.url).origin !== redirect.origin) return reply({error: 'Use the same website hostname and port as ZOHO_MAIL_REDIRECT_URI.'}, 400, redirect.protocol === 'https:');
        const state = randomBytes(32).toString('hex');
        const url = new URL('/oauth/v2/auth', c.accountsUrl);
        url.search = new URLSearchParams({client_id: c.clientId, redirect_uri: c.redirectUri, response_type: 'code',
          access_type: 'offline', prompt: 'consent', scope: MAIL_SCOPES, state}).toString();
        return new Response(null, {status: 302, headers: {...headers, Location: url.toString(), 'Set-Cookie': cookie(state, redirect.protocol === 'https:', 600)}});
      } catch { return reply({error: 'Configure the separate ZOHO_MAIL client, callback and Singapore endpoints first.'}, 503, new URL(request.url).protocol === 'https:'); }
    },
    async callback(request: Request) {
      const url = new URL(request.url), secure = url.protocol === 'https:';
      try { await deps.admin(); } catch { return reply({error: 'Sign in as an approved administrator first.'}, 403, secure); }
      const state = url.searchParams.get('state') || '';
      const cookies = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(`${MAIL_STATE_COOKIE}=`));
      const expected = cookies.length === 1 ? cookies[0].slice(MAIL_STATE_COOKIE.length + 1) : '';
      if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(state), Buffer.from(expected)))
        return reply({error: 'Authorization expired or invalid. Start again at /api/zoho/mail/authorize.'}, 400, secure);
      if (url.searchParams.has('error')) return reply({error: 'Mail authorization was declined. You can start again.'}, 400, secure);
      const code = url.searchParams.get('code') || '';
      if (!code || code.length > 2048) return reply({error: 'Missing or invalid authorization code.'}, 400, secure);
      try {
        const c = deps.config(); validateMailOAuth(c);
        const redirect = validateMailRedirect(c.redirectUri);
        const server = url.searchParams.get('accounts-server');
        if (url.pathname !== MAIL_CALLBACK_PATH || url.origin !== redirect.origin || (server && server.replace(/\/$/, '') !== c.accountsUrl))
          return reply({error: 'Mail callback hostname or Zoho data center does not match server configuration.'}, 400, secure);
        const result = await exchangeMailAuthorization(c, code, c.redirectUri, deps.request);
        // Intentional one-time, admin-only setup response. Never logged or put into cookies.
        return reply({message: 'Save these two values privately in the server environment, then close this page. Do not share or screenshot the response. Mail sending remains off until deliberately enabled.',
          ZOHO_MAIL_REFRESH_TOKEN: result.refreshToken, ZOHO_MAIL_ACCOUNT_ID: result.accountId}, 200, secure);
      } catch (error) {
        const allowed = ['MAIL_OFFLINE_TOKEN_MISSING', 'MAIL_ACCOUNT_LOOKUP_FAILED', 'MAIL_SENDER_ACCOUNT_MISMATCH'];
        const reason = error instanceof MailError && allowed.includes(error.code) ? error.code : 'MAIL_AUTHORIZATION_FAILED';
        return reply({error: `${reason}: check the sender account, Mail scopes and client settings, then authorize again.`}, 502, secure);
      }
    },
  };
}
