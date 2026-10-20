import {verifyAdminAccess} from '@/lib/adminAuth';
import {mailOAuthConfig} from '@/lib/mail/config';
import {createMailOAuthHandlers} from '@/lib/mail/oauth-handlers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createMailOAuthHandlers({admin: verifyAdminAccess, config: mailOAuthConfig}).authorize;
