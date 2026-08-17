# Mailgun setup runbook

Mailgun carries two things this platform cannot work without:

1. **Magic-link login.** It is the only way anyone signs in, so no Mailgun means
   no new sessions.
2. **OpenSign signature requests.** Contracts go to counterparties outside the
   organisation, so inbox placement is a business requirement, not a nicety.

Everything in the codebase is wired and waiting. The only missing inputs are the
account credentials and four DNS records.

## What to create in Mailgun

1. Create the account, then add a **sending domain**. Use a dedicated subdomain,
   not the corporate domain:

   ```
   sign.leaguesports.co
   ```

   Why a subdomain: sending reputation is tracked per domain. If application mail
   ever gets marked as spam, a subdomain keeps that damage away from the domain
   the team sends real business mail from. It also means Mailgun's SPF and DKIM
   records do not collide with Google Workspace's on the root domain.

2. Note the region. Mailgun runs separate US and EU stacks on different API
   hosts, and an EU key against the US host fails as `401`, which looks exactly
   like a wrong key. If the account is EU, set `MAILGUN_REGION=eu`.

3. Under Sending, create an **API key** (this is `MAILGUN_API_KEY`).

4. Under the domain's settings, copy the **HTTP webhook signing key** (this is
   `MAILGUN_WEBHOOK_SIGNING_KEY`). It is a different secret from the API key.

5. Add a webhook for the events `delivered`, `permanent_fail`,
   `temporary_fail` and `complained`, pointing at:

   ```
   https://<app-host>/api/webhooks/mailgun
   ```

## DNS records, at GoDaddy

The compliance tracker lists GoDaddy as holding `leaguesports.co`. Mailgun shows
the exact values; the shape is:

| Type | Name | Purpose | Required |
| --- | --- | --- | --- |
| TXT | `sign` | SPF, `v=spf1 include:mailgun.org ~all` | Yes |
| TXT | `<selector>._domainkey.sign` | DKIM public key | Yes |
| CNAME | `email.sign` | Click and open tracking | Optional |
| MX | `sign` | Inbound routing, `mxa/mxb.mailgun.org` | Only if replies are handled |
| TXT | `_dmarc.leaguesports.co` | `v=DMARC1; p=none; rua=mailto:dmarc@leaguesports.co` | Strongly recommended |

Notes that decide whether contracts reach the inbox:

- **SPF and DKIM are not optional.** Since the 2024 Gmail and Yahoo sender rules,
  unauthenticated mail to consumer inboxes is junked or refused outright.
- **Start DMARC at `p=none`** and read the reports for a couple of weeks before
  tightening to `quarantine`. Going straight to `p=reject` while Workspace,
  Mailgun and anything else that sends as the domain are not all aligned will
  bounce legitimate mail, including your own login links.
- **Do not request a dedicated IP.** Contract volume is a handful per day, and a
  dedicated IP needs steady volume to stay warm. At this volume the shared pool
  delivers better.
- **`MAILGUN_SENDER` must be on the sending domain.** A From address on a
  different domain fails alignment and lands in spam. Use something a
  counterparty recognises, for example `League Sports Legal <legal@sign.leaguesports.co>`,
  with `MAILGUN_REPLY_TO` pointing at a mailbox a human actually reads.

## Where each secret goes

Three places need credentials, because three things send mail.

**Vercel and Cloud Run** (the dashboard, for magic-link login):

```bash
MAILGUN_DOMAIN=sign.leaguesports.co
MAILGUN_API_KEY=<private API key>
MAILGUN_SENDER=League Sports Legal <legal@sign.leaguesports.co>
MAILGUN_REPLY_TO=legal@leaguesports.co
MAILGUN_REGION=us
MAILGUN_WEBHOOK_SIGNING_KEY=<webhook signing key>
AUTH_APP_URL=https://<app-host>
MAGIC_LINK_LOGIN_ENABLED=1
```

Cloud Run:

```bash
gcloud run services update lsc-legal-dashboard \
  --project fsp-legal-esign --region asia-southeast1 \
  --update-env-vars MAILGUN_DOMAIN=...,MAILGUN_API_KEY=...,MAILGUN_SENDER=...,MAILGUN_REGION=us,MAILGUN_WEBHOOK_SIGNING_KEY=...
```

**The OpenSign VM** (signature requests to counterparties):

```bash
MAILGUN_API_KEY=<same key> \
MAILGUN_DOMAIN=sign.leaguesports.co \
MAILGUN_SENDER=postmaster@sign.leaguesports.co \
ops/opensign-gcp/set-mailgun.sh
```

That script rewrites `/opt/opensign/.env.prod` on the VM and restarts the server
container. It replaces the placeholder values the stack was provisioned with.

## Verify, in this order

```bash
npm run mail:check
npm run mail:check -- --send you@futureofsports.io
```

The preflight checks env, that the credentials are accepted, that the domain
state is `active`, every DNS record Mailgun expects, and the local DNS view of
SPF and DMARC. It prints a blocking failure for anything that stops delivery and
a warning for anything that merely weakens it. With `--send` it delivers a real
message and prints the queued id.

Then, in order:

1. `npm run mail:check` passes with no blocking failures.
2. `npm run mail:check -- --send <your address>` arrives, **and is not in spam**.
   Check a Gmail address and an Outlook address; they judge differently.
3. Confirm a `delivered` row appeared: `provider = 'mailgun'` in
   `WebhookEventLog`. That proves the event webhook and its signing key work.
4. Request a magic link at `/login` and sign in with it.
5. Run `ops/opensign-gcp/set-mailgun.sh`, then create the OpenSign admin account,
   whose verification email is the first real test of that path.
6. Send a test agreement to an address outside the organisation and confirm both
   that it arrives in the inbox and that a `delivered` row is linked to the
   signature request.

## Delivery evidence

`src/app/api/webhooks/mailgun/route.ts` records every `delivered`, `failed`,
`rejected` and `complained` event in `WebhookEventLog` with provider `mailgun`,
linked to the `SignatureRequest` whose signatory address it was sent to. That is
the answer when a counterparty says an agreement never arrived.

Deliberately, a bounce does **not** change agreement or signature status. A
bounced invitation needs a human decision, not an automatic transition. To find
problems:

```sql
select w.event_type, w.error, w.created_at, s.signatory_email, d.title
from "WebhookEventLog" w
left join "SignatureRequest" s on s.id = w.signature_request_id
left join "LegalDocument" d on d.id = w.document_id
where w.provider = 'mailgun' and w.event_type <> 'delivered'
order by w.created_at desc;
```

## Known constraints

- The webhook rejects unsigned or stale payloads with `406`, which tells Mailgun
  to stop retrying. A `500` means the event was valid but could not be recorded,
  and Mailgun will retry it.
- The event webhook needs no database migration; `WebhookEventLog` already has
  `signature_request_id` and `document_id`.
- The OpenSign image uses the US Mailgun host. For an EU account, switch OpenSign
  to SMTP instead; see the note in `ops/opensign-gcp/env.prod.example`.
- Mailgun free and trial accounts can only send to **authorised recipients** until
  a paid plan is active. Test sends to a counterparty will fail until then, which
  looks like a deliverability problem but is not.
