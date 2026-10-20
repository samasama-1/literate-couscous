# Zoho Mail implementation review — 20 October 2026

## Scope

Dedicated Mail OAuth routes at `/api/zoho/mail/authorize` and `/api/zoho/mail/callback`, Singapore-only sending transport and provider-aware campaign confirmation delivery. The existing CRM client/routes/scopes/refresh token are not changed. Existing customer email-ownership verification and order-notification gaps remain separate.

No deployment, production configuration change, DNS modification, SQL migration, provider request or actual email send was performed by this implementation. Offline tests inject all OAuth/send responses. The owner supplied mailbox/DNS and send/reply verification; actual API entitlement, scopes, account discovery and inbox behavior remain staging gates.

## Protections and trade-offs

- Both routes require the existing approved-admin check before reading configuration or contacting Zoho. No public send/test endpoint exists.
- Independent random 256-bit state cookie: HttpOnly, SameSite=Lax, 10-minute browser lifetime, Secure on HTTPS, narrow Mail path. Callback clears it and requires matching state and configured callback origin/path.
- The authorization request includes offline access and consent, only message-create and account-info-read scopes. No inbox message content read/delete scopes.
- Account URLs are configuration-pinned to `accounts.zoho.sg` / `mail.zoho.sg`; requests cannot follow redirects or trust callback-supplied servers. Callback regional-server mismatch is rejected. Configured numeric account IDs cannot introduce URL paths.
- Tokens are sent in POST form bodies or Authorization headers, not endpoint query strings. Requests have a 15-second timeout. Raw provider bodies and thrown errors are never saved as error text or logged by this code.
- Setup deliberately returns the refresh token and matched account ID once in an authenticated, no-store/no-referrer/framed-off JSON response for owner installation in private server settings. It does not return the client secret/access token or put tokens in cookies. This is a manual setup trade-off: anyone with that admin browser session can view/copy the refresh token. Do not share screenshots or broadly share admin sessions. Infrastructure callback URL logs/browser history have their own retention/access controls; application no-logging does not prove those stores contain no authorization codes.
- Sender discovery requires one matching mailbox/confirmed alias. Sender address, account and credential values are server-side settings. The transport sends no recipients in Cc/Bcc, and blocks recipient/header injection. Sender display name/reply handling comes from the Zoho mailbox; arbitrary Reply-To override is not implemented.
- Existing queue provider/default metadata are preserved until a deliberate attempt. The claim updates provider plus attempt time and internal outcome atomically with status. Every subsequent state update requires that sending status/attempt timestamp still belong to the worker.
- The external send POST requires a durable unknown-outcome marker first. Zoho sends are never automatically repeated after that marker, including HTTP errors and timeouts. This may require manual reconciliation even if the provider actually rejected a message. A crash during preparation can also block a retry. This prioritizes avoiding duplicates and is not an exactly-once guarantee.
- Failures known to happen before sending can retry; an accepted send whose database save fails remains conservative/blocked. Provider switches after attempted sends and attempts older than 23 hours require manual review. No API/UI override that resets the marker has been added.
- Resend retains the same immutable delivery key, original attempt timestamp and 23-hour retry safety window. Existing queued SQL defaults labelled Resend can switch to Zoho only when never attempted.
- Message rendering escapes HTML and preserves the product/interest snapshot and signed unsubscribe links. Added outcome metadata does not change the snapshot content fields. Claims/status updates use existing server-only access; RLS/grants are unchanged.
- Token refresh is performed before each new Zoho send, with no token cache or automatic send retry. Review Mail account limits before higher-volume use. There is no background retry worker, delivery/bounce webhook, inbox tracking or marketing broadcast addition.

## Validation and rollout

Local checks: full automated suite, ESLint, TypeScript and production webpack build. Mail tests include an adapter-level fake Supabase store plus pure transport/OAuth/claim tests. In-memory concurrency checks exercise exclusive claims; they do not establish real multi-instance provider delivery behavior. Existing PostgreSQL tests continue to verify registration/consent/RLS and transaction/duplicate-order protections.

Before production: register the dedicated application, configure matching staging callback/environment, authorize the intended mailbox, send only to controlled test addresses, verify reply/unsubscribe and failure behavior, test token refresh and one existing CRM sync, and review the actual plan/sending limits. Keep production sending disabled until that acceptance check passes. Do not bulk replay old queued jobs.

No SQL migration is required. Stop future sending by unsetting `CAMPAIGN_EMAIL_PROVIDER` and redeploying/restarting. Keep the provider/attempt history intact; do not force retries by clearing status/metadata/timestamps. CRM authorization is not part of Mail rollback.

References: [Zoho OAuth](https://www.zoho.com/mail/help/api/using-oauth-2.html), [send API](https://www.zoho.com/mail/help/api/post-send-an-email.html), [account discovery](https://www.zoho.com/mail/help/api/get-all-users-accounts.html).
