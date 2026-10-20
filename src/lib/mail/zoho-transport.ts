// Pure, dependency-injected transport. All errors are fixed labels, never provider bodies.
export type MailOAuthConfig = {clientId: string; clientSecret: string; accountsUrl: string; apiUrl: string; from: string};
export type ZohoMailConfig = MailOAuthConfig & {refreshToken: string; accountId: string};
export type MailMessage = {to: string; subject: string; text: string; html: string; replyTo?: string};
export const MAIL_SCOPES = 'ZohoMail.messages.CREATE,ZohoMail.accounts.READ';
export const MAIL_CALLBACK_PATH = '/api/zoho/mail/callback';
export const MAIL_STATE_COOKIE = 'samasama_zoho_mail_state';
export class MailError extends Error {
  constructor(public readonly code: string) { super(code); }
}
const mailbox = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
export function validateMailOAuth(config: MailOAuthConfig) {
  // This integration is deliberately pinned to Marcus's confirmed Singapore account.
  if (config.accountsUrl !== 'https://accounts.zoho.sg' || config.apiUrl !== 'https://mail.zoho.sg'
    || !config.clientId || !config.clientSecret || config.clientId.length > 2048 || config.clientSecret.length > 8192
    || !mailbox.test(config.from) || config.from.length > 254) throw new MailError('MAIL_CONFIGURATION');
}
export function validateMailRedirect(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new MailError('MAIL_REDIRECT_CONFIGURATION'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== MAIL_CALLBACK_PATH
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')))
    throw new MailError('MAIL_REDIRECT_CONFIGURATION');
  return url;
}
function validToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/[\r\n]/.test(value);
}
async function jsonCall(request: typeof fetch, url: string, init: RequestInit, code: string) {
  try {
    const response = await request(url, {...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000)});
    const data = await response.json();
    if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data)) throw new MailError(code);
    return data;
  } catch { throw new MailError(code); }
}
export async function exchangeMailAuthorization(config: MailOAuthConfig, code: string, redirectUri: string, request: typeof fetch = fetch) {
  validateMailOAuth(config); validateMailRedirect(redirectUri);
  if (!code || code.length > 2048) throw new MailError('MAIL_AUTHORIZATION_CODE');
  const data = await jsonCall(request, `${config.accountsUrl}/oauth/v2/token`, {method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'authorization_code', code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri}),
  }, 'MAIL_AUTHORIZATION_FAILED');
  if (!validToken(data.access_token) || !validToken(data.refresh_token)) throw new MailError('MAIL_OFFLINE_TOKEN_MISSING');
  const accounts = await jsonCall(request, `${config.apiUrl}/api/accounts`, {headers: {Authorization: `Zoho-oauthtoken ${data.access_token}`}}, 'MAIL_ACCOUNT_LOOKUP_FAILED');
  if (accounts.status?.code !== 200 || !Array.isArray(accounts.data)) throw new MailError('MAIL_ACCOUNT_LOOKUP_FAILED');
  const matches = accounts.data.filter((account: {accountId?: unknown; enabled?: boolean; mailboxAddress?: string; primaryEmailAddress?: string; emailAddress?: {mailId?: string; isConfirmed?: boolean}[]}) =>
    account.enabled !== false && /^[0-9]{1,30}$/.test(String(account.accountId || '')) && (
      account.mailboxAddress?.toLowerCase() === config.from.toLowerCase() || account.primaryEmailAddress?.toLowerCase() === config.from.toLowerCase()
      || (Array.isArray(account.emailAddress) && account.emailAddress.some(a => a.isConfirmed !== false && a.mailId?.toLowerCase() === config.from.toLowerCase()))));
  if (matches.length !== 1) throw new MailError('MAIL_SENDER_ACCOUNT_MISMATCH');
  return {refreshToken: data.refresh_token as string, accountId: String(matches[0].accountId)};
}
export async function prepareZohoMail(config: ZohoMailConfig, request: typeof fetch = fetch) {
  validateMailOAuth(config);
  if (!validToken(config.refreshToken) || !/^[0-9]{1,30}$/.test(config.accountId)) throw new MailError('MAIL_CONFIGURATION');
  const token = await jsonCall(request, `${config.accountsUrl}/oauth/v2/token`, {method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'refresh_token', client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken}),
  }, 'MAIL_REFRESH_FAILED');
  if (!validToken(token.access_token)) throw new MailError('MAIL_REFRESH_FAILED');
  return async (message: MailMessage) => {
    if (!mailbox.test(message.to) || /[\r\n]/.test(message.subject) || message.subject.length > 998
      || (message.replyTo && message.replyTo.toLowerCase() !== config.from.toLowerCase())) throw new MailError('MAIL_MESSAGE_INVALID');
    // Exactly one POST. Never assume Zoho supports Resend's idempotency header.
    const result = await jsonCall(request, `${config.apiUrl}/api/accounts/${config.accountId}/messages`, {method: 'POST',
      headers: {Authorization: `Zoho-oauthtoken ${token.access_token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({fromAddress: config.from, toAddress: message.to, subject: message.subject, content: message.html,
        mailFormat: 'html'}),
    }, 'MAIL_SEND_UNCONFIRMED');
    if (result.status?.code !== 200 || !validToken(result.data?.messageId)) throw new MailError('MAIL_SEND_UNCONFIRMED');
    return result.data.messageId as string;
  };
}
