# Connect hello@samasama.sg to the website

Prepared 20 October 2026. The Mail connection is implemented locally, including campaign-confirmation sending. It is not deployed, authorized or enabled, and no message was sent by implementation/tests. Mailbox send/reply and DNS checks were supplied by Marcus. Zoho Mail hostname: `mail.zoho.sg`.

Use separate Mail credentials. Keep every existing `ZOHO_*` CRM setting unchanged.

## 1. Register a Mail application

1. Open the [Zoho API Console](https://api-console.zoho.com/) using the Zoho account that owns `hello@samasama.sg`; use Zoho's regional redirect/console for that account.
2. Select **Add Client → Server-based Applications**.
3. Enter **Client Name:** `SamaSama Website Mail`.
4. Enter **Homepage URL:** the production origin where you actually sign into SamaSama admin.
5. Register the callback below that matches that exact hostname. You may register both if both are intentionally used, but the configured callback and the host where you begin authorization must be identical.

| Environment | Authorized redirect URI |
| --- | --- |
| Production with www | `https://www.samasama.sg/api/zoho/mail/callback` |
| Production without www, only if that host does not redirect away | `https://samasama.sg/api/zoho/mail/callback` |
| Local preview, port 3100 | `http://localhost:3100/api/zoho/mail/callback` |

6. Create the client. Save its Client ID and Client Secret privately in your password manager. They are new Mail credentials, not the existing CRM credentials. Do not post the secret here.

The callback route must be deployed before production authorization. Registering it in Zoho does not deploy it. The configured client validates the callback path, forbids URL credentials/query/fragment, permits HTTPS or HTTP on localhost only, and checks that authorization begins on the matching origin.

## 2. Add the initial server settings

In your website hosting project's **Environment Variables**, add:

| Name | Value |
| --- | --- |
| `ZOHO_MAIL_CLIENT_ID` | Dedicated Mail Client ID |
| `ZOHO_MAIL_CLIENT_SECRET` | Dedicated Mail Client Secret |
| `ZOHO_MAIL_ACCOUNTS_URL` | `https://accounts.zoho.sg` |
| `ZOHO_MAIL_API_URL` | `https://mail.zoho.sg` |
| `ZOHO_MAIL_FROM` | `hello@samasama.sg` |
| `ZOHO_MAIL_REDIRECT_URI` | The exact registered production callback chosen in step 1 |

Leave `CAMPAIGN_EMAIL_PROVIDER` unchanged for now. Do not enable Zoho sending before the controlled staging test. If Resend is already active, leave it active until the switch is reviewed.

Use production-scoped values only in production. For a local test, privately put the Mail variables in ignored `.env.local`, use the localhost callback, restart the local server and sign in at `http://localhost:3100/admin`. Do not mix `localhost` and `127.0.0.1`, or ports 3000 and 3100, during one authorization session.

Never prefix credentials with `NEXT_PUBLIC_`. No SQL migration, Supabase secret or Google Apps Script change is needed for this implementation.

## 3. Deploy/restart the code and authorize Mail

Deployment remains an owner-approved action. After that deployment/restart:

1. Sign into your SamaSama admin account on the exact configured hostname.
2. Open `/api/zoho/mail/authorize` on that same hostname. For the www production choice: `https://www.samasama.sg/api/zoho/mail/authorize`.
3. In Zoho's consent screen use the account that owns/can send as `hello@samasama.sg`. Approve message creation and account information read access. These are `ZohoMail.messages.CREATE` and `ZohoMail.accounts.READ`; no inbox-content reading/deletion scopes are requested.
4. Zoho returns to the Mail callback. The server discovers the account matching the configured sender. Wrong accounts, multiple matches, missing offline token and mismatched regions fail closed.
5. The admin-only result shows `ZOHO_MAIL_REFRESH_TOKEN` and `ZOHO_MAIL_ACCOUNT_ID`. Copy both directly into private server environment variables with those exact names. Close the response afterward; do not screenshot/share it. It intentionally returns the refresh token once for owner setup, never the access token or client secret.
6. Redeploy/restart to load those two values. Keep the CRM refresh token unchanged.

Authorization alone sends no email. The short-lived OAuth cookie contains random state, never tokens, is separate from CRM, HttpOnly and SameSite=Lax, expires after 10 minutes, and is Secure on HTTPS. The callback clears that cookie on success or failure. Setup responses are no-store, no-referrer and framed off; application code does not log tokens/codes/provider bodies. Provider/infrastructure access logs and browser history still need normal restricted handling for OAuth callback URLs.

[Zoho Mail OAuth](https://www.zoho.com/mail/help/api/using-oauth-2.html), [account discovery](https://www.zoho.com/mail/help/api/get-all-users-accounts.html)

## 4. Enable a controlled staging confirmation

Do this in a separate staging deployment first, using its own matching callback. Confirm your Zoho account permits Mail API usage and the intended volume.

Add:

```dotenv
CAMPAIGN_EMAIL_PROVIDER=zoho
EMAIL_REPLY_TO=hello@samasama.sg
NEXT_PUBLIC_SITE_URL=https://YOUR-ACTUAL-STAGING-OR-PRODUCTION-HOST
```

`ZOHO_MAIL_FROM` controls the Zoho sender. `EMAIL_FROM` remains the existing Resend setting and is not used to choose the Zoho sender. The Mail API transport uses the mailbox's sender identity/display name; set the desired name, SamaSama, in Zoho. Replies naturally return to `hello@samasama.sg`. `EMAIL_REPLY_TO` must be omitted or equal that address for this Zoho implementation; arbitrary Reply-To overrides are not implemented from an undocumented API parameter.

Preserve your existing effective `CAMPAIGN_SIGNING_SECRET`; changing it invalidates existing signed links. Do not replace the signing secret just to enable Mail. Use the real canonical HTTPS public origin for production links.

Restart/redeploy after changes. New live campaign confirmations use Zoho only when provider selection and Mail credentials are present. Missing configuration leaves jobs queued; invalid configured endpoints fail before sending. This implementation is intentionally pinned to the confirmed Singapore Accounts/Mail hosts.

## 5. Test the complete connection

1. Use only an owner-controlled email address and a dedicated staging campaign that exercises live registration. Demo previews and saved test-mode campaigns intentionally do not queue/send emails.
2. Submit one product pick and check its **Email deliveries** entry in the campaign lead detail.
3. Verify one message arrives with the correct product/interest, working unsubscribe link and reply destination. Provider acceptance is not inbox delivery.
4. Replay a registration request in staging; no duplicate confirmation should be sent.
5. Verify unchecked marketing consent stays unchecked and website unsubscribe updates website/CRM. This does not implement Mail-to-website unsubscribe feedback or broadcast marketing.
6. Recheck the existing CRM sync.
7. Test wrong Mail credentials/scope, malformed configuration and provider failures with test fixtures or an isolated staging configuration, never by breaking production credentials.
8. Review before enabling the provider in production. Then send one authorized smoke-test confirmation to an owner-controlled inbox. Do not bulk retry the old queue.

No arbitrary public send endpoint or automatic test-send endpoint was added. Authorization does not send a test email. The first real message requires an explicitly configured provider and the existing campaign workflow.

## Retry behavior and recovery

The existing email outbox and provider column are reused; no SQL migration is required. Original message snapshot fields are retained. Internal `_mail_outcome` metadata tracks preparation/unknown/accepted outcomes.

- A durable compare-and-set claim prevents two workers from taking the same queued job.
- Token refresh and message preparation happen before the external send marker. Known preparation failures are marked `not_sent` and can be retried after fixing the cause.
- Before the external POST, a durable `unknown` marker is saved. A Zoho timeout, malformed response, crash, provider rejection after the marker or acceptance-save failure is conservatively blocked from another send. Zoho Sent/provider records require review first.
- A crash during preparation can also require manual review; do not assume preparing means definitely unsent.
- There is no automatic Zoho resend, including on an HTTP 401/429. A fresh access token is obtained before each new send; the POST itself is attempted once.
- Existing Resend attempts keep their delivery idempotency key and original timestamp, within the existing 23-hour safety window.
- An attempted job never silently switches providers. Unattempted queued jobs may use the explicitly selected provider, even if the original SQL default labelled them Resend.
- All attempts older than 23 hours require review. Do not reset attempt timestamps, change `_mail_outcome`, delete deliveries or clear sent status to force a resend. This release intentionally has no override button. After investigating, arrange a separately approved recovery action.
- This prioritizes avoiding duplicate mail over automatic recovery. It is not an exactly-once email-delivery guarantee. No automatic scheduled email retry worker or bounce/webhook reconciliation was added.

To stop future Zoho sends, unset the provider selection and redeploy/restart. Do not switch attempted jobs to Resend to get around review. Revoking Mail authorization is separate and must not revoke the CRM application.

## Scope and local validation

Implemented: dedicated admin authorization/callback, sender-account discovery, offline refresh-token setup, Singapore-only token refresh/sending transport, provider selection, durable send markers, redacted failures and provider-aware retry policy for campaign confirmations.

Not implemented: payment/balance/collection notification templates, email-ownership verification, marketing broadcasts, provider webhook feedback, scheduled email retries or an admin resend override. No live credentials/settings/DNS/SQL were changed and no provider requests were made by offline tests.

Offline tests cover admin/state/origin checks; callback/endpoint injection; offline token/account discovery; wrong sender; credential/scope failures; malformed responses; single-POST timeout behavior; concurrent claims; safe preparation retries; acceptance-save failure; old/legacy attempts; and Resend retry compatibility. Full inbox/reply/account-plan verification remains an owner staging test.
