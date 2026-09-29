import 'server-only';

export const stateCookie = 'zoho_oauth_state';
export function zohoOAuthConfig() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
  const allowed = ['https://accounts.zoho.com', 'https://accounts.zoho.eu', 'https://accounts.zoho.in', 'https://accounts.zoho.com.au', 'https://accounts.zoho.jp', 'https://accounts.zoho.ca', 'https://accounts.zoho.com.cn', 'https://accounts.zoho.sa'];
  if (!clientId || !clientSecret || !redirectUri || !allowed.includes(accountsUrl)) throw new Error('Invalid Zoho configuration');
  const callback = new URL(redirectUri);
  if (callback.pathname !== '/api/zoho/callback' || (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && callback.hostname === 'localhost'))) throw new Error('Invalid callback');
  return { clientId, clientSecret, redirectUri, accountsUrl };
}
