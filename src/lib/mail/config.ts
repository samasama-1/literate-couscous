import 'server-only';
import {validateMailOAuth, validateMailRedirect, type MailOAuthConfig, type ZohoMailConfig} from './zoho-transport';

export function mailOAuthConfig(): MailOAuthConfig & {redirectUri: string} {
  const config = {
    clientId: process.env.ZOHO_MAIL_CLIENT_ID || '', clientSecret: process.env.ZOHO_MAIL_CLIENT_SECRET || '',
    accountsUrl: process.env.ZOHO_MAIL_ACCOUNTS_URL || 'https://accounts.zoho.sg',
    apiUrl: process.env.ZOHO_MAIL_API_URL || 'https://mail.zoho.sg',
    from: process.env.ZOHO_MAIL_FROM || 'hello@samasama.sg', redirectUri: process.env.ZOHO_MAIL_REDIRECT_URI || '',
  };
  validateMailOAuth(config); validateMailRedirect(config.redirectUri);
  return config;
}
export function mailSendingConfig(): ZohoMailConfig {
  // Sending does not depend on keeping a local OAuth callback configured.
  const config = {
    clientId: process.env.ZOHO_MAIL_CLIENT_ID || '', clientSecret: process.env.ZOHO_MAIL_CLIENT_SECRET || '',
    accountsUrl: process.env.ZOHO_MAIL_ACCOUNTS_URL || 'https://accounts.zoho.sg',
    apiUrl: process.env.ZOHO_MAIL_API_URL || 'https://mail.zoho.sg', from: process.env.ZOHO_MAIL_FROM || 'hello@samasama.sg',
    refreshToken: process.env.ZOHO_MAIL_REFRESH_TOKEN || '', accountId: process.env.ZOHO_MAIL_ACCOUNT_ID || '',
  };
  validateMailOAuth(config);
  if (!config.refreshToken || !/^[0-9]{1,30}$/.test(config.accountId)) throw new Error('MAIL_CONFIGURATION');
  return config;
}
