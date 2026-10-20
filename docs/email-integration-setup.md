# SamaSama email integration — owner setup guide

Prepared 19 October 2026; Mail implementation update 20 October 2026. Intended setup: Zoho Mail for the SamaSama mailbox, Cloudflare for DNS, and the website for automated customer messages.

**Update:** Marcus confirmed `hello@samasama.sg` sends/receives mail and uses `mail.zoho.sg`. The separate Mail connection is now implemented locally. Use [Connect hello@samasama.sg](zoho-mail-setup.md) for exact callback URLs, environment settings and activation steps. The planning sections below describe the original sequence; the new setup guide is authoritative for implemented Mail behavior. Nothing has been deployed or enabled by this documentation update.

**Start with Part 1 if your mailbox is not already working.** Creating a working mailbox does not automatically connect the website or enable CRM email workflows. This guide makes no changes to DNS, accounts, credentials, production settings or sending.

## What is ready, and what is not

| Component | Current implementation |
| --- | --- |
| Zoho CRM | Separate existing connection; Mail permissions are not included in the current website authorization route. |
| Campaign confirmation records | Built: live registrations save a queued email job alongside the registration. |
| Campaign confirmation sending | Built for Resend and, locally, Zoho Mail; both require deliberate configuration. Current production configuration/inbox delivery has not been verified by this guide. |
| Admin delivery status / retry | Built in campaign lead details. Sent means provider acceptance, not confirmed inbox delivery. |
| Website unsubscribe | Built with signed links and CRM opt-out propagation. Mail-provider-to-website unsubscribe synchronization is not built. |
| Automated Zoho Mail sending | Implemented locally for campaign confirmations; requires separate Mail authorization, provider selection, staging tests and deployment. |
| Automatic balance and collection-ready messages | **Not implemented.** Balance links can currently be created and shared manually. |
| Customer email-ownership verification | **Not implemented.** Keep separate from confirming receipt of a vote. |

## Part 1 — Set up your SamaSama mailbox

You handle these steps in your own Zoho and Cloudflare accounts. Skip anything already completed and verified.

### 1. Choose the address

Suggested starting address: `hello@samasama.sg`, display name **SamaSama**. Use a monitored inbox so customers can reply. `support@samasama.sg` can be an alias if your plan supports it; a second paid mailbox is not inherently required.

Sign in to [Zoho Mail Admin Console](https://mailadmin.zoho.com/). If you do not have business email hosting yet, start its domain setup for `samasama.sg`. Confirm the chosen plan's domain-hosting, API access and sending limits in your account before buying or enabling website sending.

**Checkpoint:** You can access the domain's setup screen in the correct Zoho organization. Record the account's actual data center; do not assume one from Singapore location.

### 2. Verify domain ownership through Cloudflare

1. In Zoho, select **Domains → samasama.sg → domain ownership verification**.
2. Choose TXT verification and copy the host/name and value shown there.
3. Open Cloudflare → **samasama.sg → DNS → Records → Add record**.
4. Choose **TXT** and enter the exact name/value supplied by Zoho. Use `@` only if Zoho specifies the root domain.
5. Save, return to Zoho and select **Verify**. If pending, allow DNS propagation and retry.

Use your account-generated value, not a value copied from a screenshot or generic example. [Zoho domain verification](https://www.zoho.com/mail/help/adminconsole/domain-verification.html)

**Checkpoint:** Zoho marks domain ownership verified.

### 3. Create the mailbox and route incoming mail

1. Create the `hello@samasama.sg` user/mailbox in Zoho.
2. In its domain setup, find **MX / mail delivery** settings.
3. Before replacing anything, save a private copy of existing mail-related Cloudflare records and note any existing inboxes or forwarding rules.
4. If Cloudflare Email Routing currently handles `samasama.sg`, plan the switch to Zoho: recreate any forwarding/alias behavior you still need. Cloudflare DNS hosting can remain in place.
5. Replace the old provider's MX set with the exact Zoho MX hostnames and priorities shown in your account. Do not mix old Cloudflare Email Routing MX records with Zoho MX records for this domain.
6. Ask Zoho to verify the MX configuration.

Changing MX changes where incoming domain email is delivered. It does not require changing the website's A/AAAA/CNAME records or nameservers. Use account-specific mail settings. [Zoho hosting setup](https://www.zoho.com/mail/help/adminconsole/email-hosting-setup.html), [Cloudflare domain/email routing configuration](https://developers.cloudflare.com/email-service/configuration/domains/)

**Checkpoint:** An email from your personal address arrives in the Zoho mailbox.

### 4. Authenticate outgoing mail

In Zoho's domain email configuration, follow its **SPF** and **DKIM** instructions:

- SPF: publish the account/data-center-specific authorization Zoho supplies. If a root SPF record already exists, merge authorized senders into one valid SPF policy rather than adding a second SPF record.
- DKIM: generate the selector/key in Zoho, add the exact DNS record in Cloudflare, then verify/enable it in Zoho.
- If Zoho supplies a CNAME for a mail-related host, use DNS-only where required by its setup instructions.
- Review DMARC after SPF/DKIM work. Do not replace an existing enforcement policy or publish a stricter policy without checking every legitimate sender.

[Zoho SPF setup](https://www.zoho.com/mail/help/adminconsole/spf-configuration.html), [Zoho DKIM setup](https://www.zoho.com/mail/help/adminconsole/dkim-configuration.html)

**Checkpoint:** Send a message from Zoho to your own Gmail/Outlook inbox, inspect its authentication results, then reply. Confirm SPF/DKIM pass and both directions work. Check spam as well.

## Part 2 — Connect automated website sending

**The Zoho Mail implementation is prepared locally.** Use [the current Mail connection instructions](zoho-mail-setup.md) to register the dedicated client and configure it. Deployment, authorization and live sending are still separate owner actions.

### 5. Authorize the website to send as hello@samasama.sg

Mailbox/domain setup is complete according to Marcus on 20 October 2026. The remaining authorization grants the website permission to send through that mailbox. DNS verification proves domain control; it does not grant API access.

The website's current `/api/zoho/authorize` requests CRM scopes only. Running it again unchanged will not grant Mail access. Do not replace the working `ZOHO_REFRESH_TOKEN` or change CRM permissions for these steps.

#### 5A. You: confirm the mailbox and its regional host

1. Sign in to Zoho Mail and select the `hello@samasama.sg` mailbox.
2. Send a short message to your own external inbox and reply to it. Verified DNS alone does not establish successful delivery/replies.
3. Note the browser hostname after login, such as `mail.zoho.com` or `mail.zoho.eu`. This identifies the Mail data center. Share only the hostname, not a full URL containing login codes/tokens.
4. Confirm that `hello@samasama.sg` is the mailbox's primary address or a permitted sending alias. If it is an alias, authorization must belong to the mailbox that owns it; an arbitrary organization administrator is not necessarily the correct sender.
5. Check your Zoho plan/account permits Mail API access and the intended sending volume. We have not verified your plan.

[Zoho regional endpoints and API prerequisites](https://www.zoho.com/mail/help/api/getting-started-with-api.html)

#### 5B. Developer: prepare a separate Mail authorization flow

Recommended implementation: a dedicated **SamaSama Website Mail** Server-based Application in the [Zoho API Console](https://api-console.zoho.com/), with its own server-side Mail configuration. Use the appropriate regional console/account.

The admin-only Mail authorization route is now `/api/zoho/mail/authorize`, with callback `/api/zoho/mail/callback`. Choose your exact canonical website origin and use the matching complete URI from [the callback table](zoho-mail-setup.md#1-register-a-mail-application). A callback is where Zoho returns the authorization code after you consent. It must exist and match the API Console entry exactly, including hostname, path and scheme.

This Mail flow is implemented locally and must be deployed before production authorization. Do not reuse the current CRM authorization link expecting it to request Mail permissions. Local authorization also needs the exact matching local hostname/port; the current preview port is not automatically a registered OAuth callback.

The new flow checks admin access, validates a short-lived OAuth state cookie, uses HTTPS in production, avoids caching setup responses, and exchanges authorization codes only on the server. Separate Mail configuration must preserve the existing CRM client/token and scope set.

#### 5C. You: register the client and approve the sender once the route is ready

1. Once supplied with the implemented callback URI, open your regional Zoho API Console.
2. Add a **Server-based Application**, named **SamaSama Website Mail**.
3. Enter the actual production website homepage and the exact supplied authorized redirect URI. Add a local callback only if local authorization is needed.
4. Store its client ID and secret privately in the selected server environment, using the Mail variable names supplied with the implementation. Do not send the secret in chat or commit it.
5. Sign in to the website as an approved admin, then open the new Mail authorization link supplied by the developer.
6. On Zoho's consent screen, use the account that owns/can send as `hello@samasama.sg` and approve only the expected Mail permissions.

The code should request:

| Permission | Why it is needed |
| --- | --- |
| `ZohoMail.messages.CREATE` | Send messages through the mailbox. |
| `ZohoMail.accounts.READ` | Discover the authorized user's mailbox account ID, if needed. This is account information, not inbox-message content access. |

The account lookup is `GET /api/accounts` on the correct regional Mail host. Select the account matching the intended mailbox and retain its **accountId**, not a CRM organization ID or Zoho user ID. Request read access only where discovery needs it; do not request broad message-reading/deletion scopes for this sending task. [Account discovery](https://www.zoho.com/mail/help/api/get-all-users-accounts.html), [send permission](https://www.zoho.com/mail/help/api/post-send-an-email.html)

#### 5D. Developer / owner: save the persistent connection privately

The authorization request must request offline access so a refresh token can be obtained. The refresh token lets the server renew short-lived access tokens without making you log in for every customer email.

Save the following in the website host's server environment, and separately in ignored `.env.local` only for local testing:

- The dedicated Mail application's client ID and client secret.
- Its Mail refresh token and correct Accounts endpoint.
- The regional Mail API base URL and the selected mailbox account ID.
- Sender address `hello@samasama.sg` and display name `SamaSama`.

The Mail variables are now documented in [the current setup guide](zoho-mail-setup.md#2-add-the-initial-server-settings). Use those exact names; credentials alone do not select the sending provider. Keep the working CRM settings intact. Never use `NEXT_PUBLIC_` for these credentials or store them in Google Sheets. Do not paste authorization codes, passwords or tokens into chat.

#### 5E. Developer / owner: verify authorization and then sending

1. Confirm the new token can access only the intended Mail account information/sending functions.
2. Confirm token refresh works and the selected account can send as `hello@samasama.sg`.
3. After configuring and deliberately enabling the transport in staging, authorize one test message to an owner-controlled destination; verify provider acceptance, inbox receipt and reply routing.
4. Check one existing CRM sync to ensure its authorization was unaffected.

Zoho sends through `POST /api/accounts/{accountId}/messages` on the correct regional host. A successful mailbox login, consent screen or token exchange alone does not prove that the website's automated messages work. [Zoho sending API](https://www.zoho.com/mail/help/api/post-send-an-email.html)

**What you can do now:** register the dedicated Mail client using the exact callback in the [current setup guide](zoho-mail-setup.md). Your mailbox and regional hostname checks are complete. No refresh token needs to be shared in chat.

### 6. Website Mail adapter — implementation status

The sending code is [src/lib/campaigns/email.ts](../src/lib/campaigns/email.ts). The following work is now prepared locally and covered by offline tests:

- Added a server-only Zoho Mail integration with a pure, testable transport and token refresh handling.
- Reuse the existing campaign outbox, immutable message content and exclusive delivery claim.
- Added `CAMPAIGN_EMAIL_PROVIDER=zoho`. Once deployed and fully configured, this explicitly enables Zoho campaign confirmations. Keep it unset until staging authorization/testing is ready.
- Review duplicate protection for Zoho specifically. The existing Resend idempotency header/window cannot be assumed to work with Zoho. Treat timeout/unknown-send outcomes as requiring reconciliation before another send.
- Record only safe delivery status/errors; never log tokens or customer message bodies.
- Preserve signed unsubscribe links and consent rules. Choose one owner for each automatic email so CRM workflows and the website do not both send it.
- Add tests for token refresh, wrong scope, expired credentials, provider rejection, timeouts, concurrent delivery claims and ambiguous retries.

Use `EMAIL_FROM`, `EMAIL_REPLY_TO`, `NEXT_PUBLIC_SITE_URL` and a stable server-only `CAMPAIGN_SIGNING_SECRET` as appropriate to the final implementation. Mail-specific credential names are listed in [Zoho Mail setup](zoho-mail-setup.md). `ZOHO_MAIL_FROM` controls the Zoho sender; `EMAIL_FROM` remains the Resend sender setting.

If a signing secret is already in use, preserve it: changing the effective signing key invalidates existing signed unsubscribe/session links. Never use a `NEXT_PUBLIC_` prefix for secret keys.

**Checkpoint:** The implementation is reviewed and tested in staging before production activation. No bulk retry of historical queued messages.

## Part 3 — Test one campaign email end to end

1. Use a separate staging campaign that exercises the live-registration path and only your own controlled email addresses. Visual previews and saved test-mode campaigns intentionally do not send confirmation emails.
2. Submit a product-interest response once.
3. Open **Admin → Campaign leads → that lead → Email deliveries**.
4. Confirm the job moves to Sent, the intended message arrives, the product/response are correct, and replies reach your mailbox.
5. Repeat the same submission request in a controlled test and verify it does not create a duplicate confirmation.
6. Use an unchecked marketing-consent submission. Its confirmation must not add promotional consent.
7. Open the unsubscribe link and confirm website and CRM opt-out behavior; avoid exposing the private signed link in screenshots/shared logs.
8. Simulate a sending failure in staging. The vote must remain saved, the failure must be visible, and retry must not send twice.
9. Recheck one CRM sync after Mail authorization changes.

Sent/accepted does not establish inbox delivery. Confirm receipt in your controlled inbox separately. There is currently no scheduled email retry worker: campaign admin offers manual retry. Review older ambiguous attempts in provider logs first.

**Checkpoint:** All checks pass before enabling production sending. Send one controlled production smoke test after deployment, then review queued historical messages individually before deciding whether to send them.

## Part 4 — Add the remaining customer messages

After campaign confirmations work, implement in this order:

| Event | Message | Existing state |
| --- | --- | --- |
| Preorder registered | Order code, deposit amount and payment instructions | Order flow exists; automatic email needs implementation. |
| Deposit verified | Payment received and next steps | Admin verification exists; automatic email needs implementation. |
| Balance requested | Amount due and private balance-payment link | Link generation exists; automatic email needs implementation. |
| Ready for collection/delivery | Logistics and order reference | Readiness record exists; automatic email needs implementation. |
| Collected/delivered | Handover confirmation | Audit record exists; automatic email needs implementation. |

Create durable email jobs from successful authoritative order transitions, not browser clicks. Repeated payment/collection requests must not generate duplicate messages. Keep bank references, staff identities and unnecessary personal details out of email content. Email-verification links need a separate expiring, single-use verification flow; they are not the existing unsubscribe or balance tokens.

Bulk promotional campaigns are a separate project. Require marketing consent and no unsubscribe, and design provider opt-out/bounce feedback before enabling them. A CRM connection is not permission to email every lead.

## Optional alternative — use the existing Resend transport

If you decide to use Zoho for the inbox but Resend for website confirmations, the current app already supports that combination. Resend domain verification and its account limits must be checked first; do not guess its DNS values.

Set the following on the selected server environment only after sender verification:

```dotenv
CAMPAIGN_EMAIL_PROVIDER=resend
RESEND_API_KEY=<private key from Resend>
EMAIL_FROM=SamaSama <hello@samasama.sg>
EMAIL_REPLY_TO=hello@samasama.sg
NEXT_PUBLIC_SITE_URL=https://www.samasama.sg
```

Use the site's actual canonical production origin. Keep an existing signing key stable; configure `CAMPAIGN_SIGNING_SECRET` deliberately if not already present. Redeploy/restart after environment changes and follow Part 3. This alternative still does not implement order/balance/collection emails. Never commit real values to this document.

See [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction) and the existing [campaign owner manual](campaign-owner-manual.md).

## Your immediate next step

Your mailbox test passed and the hostname is `mail.zoho.sg`. Follow [Connect hello@samasama.sg](zoho-mail-setup.md), starting with the dedicated Server-based Application and exact callback URL. No passwords, tokens or private keys are needed in chat.
