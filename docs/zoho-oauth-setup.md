# Zoho CRM authorization

1. Use a Zoho **Server-based Application** with the supplied callback URIs registered exactly.
2. Local `.env.local` now contains the supplied client ID/secret and `ZOHO_REDIRECT_URI=http://localhost:3000/api/zoho/callback`. This file is ignored by Git. Run on port 3000 and use localhost (not 127.0.0.1) throughout login/authorization so the session and state cookies match.
3. Set `ZOHO_ACCOUNTS_URL` to your Zoho account's actual data center. The existing setting is preserved; your geographic location alone does not determine the data center.
4. Sign in at `/admin/login` with an allowed administrator, then open `/api/zoho/authorize`. Approve Leads and search permissions for voting sync, plus Contacts/Deals permissions used by the existing order integration.
5. The callback shows an admin-only, non-cacheable JSON setup response containing a refresh token. Copy it privately into `ZOHO_REFRESH_TOKEN`; use the returned `ZOHO_API_DOMAIN` and `ZOHO_ACCOUNTS_URL`. No tokens are logged, and the access token is not displayed. Restart the app. The callback does not automatically change your environment or connect campaign lead syncing.
6. In hosting settings add the same server-only credentials, refresh token and domains. Set `ZOHO_REDIRECT_URI=https://samasama.sg/api/zoho/callback`. For production authorization, sign in and start from that exact host. If your host redirects to www, register and configure the matching www callback instead before starting. Never prefix these secrets with NEXT_PUBLIC_. Redeploy after changes.

No real authorization or CRM write is performed by build verification. See `zoho-voting-sync.md` for enabling the voting-to-Leads connection. Books and Mail integrations remain separate.

Reference: https://www.zoho.com/developer/oauth/web-server-apps/get-access-token.html
