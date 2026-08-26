# Mailgun setup runbook

Mailgun carries two things this platform cannot work without:

1. **Magic-link login.** It is the only way anyone signs in, so no Mailgun means
   no new sessions.
2. **OpenSign signature requests.** Contracts go to counterparties outside the
   organisation, so inbox placement is a business requirement, not a nicety.

Everything in the codebase is wired and waiting. The only missing inputs are the
account credentials and four DNS records.

## What to create in Mailgun

1. **Check whether an account already exists first.** The DNS for
   `futureofsports.io` is already fully set up for Mailgun (verified 2026-08-16):

   ```
   SPF     v=spf1 include:_spf.google.com include:mailgun.org ~all
   DKIM    mailo._domainkey.futureofsports.io
   Track   email.futureofsports.io -> mailgun.org
   DMARC   p=none, reports to fc491052@dmarc.mailgun.org
   ```

   A domain can only be verified in one Mailgun account, so if you create a new
   account and add `futureofsports.io`, it will be rejected as already claimed.
   Find the existing account before signing up. The DMARC reporting address is
   the clue to who set it up.

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

## DNS records

**Already done for `futureofsports.io`.** SPF, DKIM, the tracking CNAME and DMARC
all resolve correctly today, so there is nothing to add at the registrar. The SPF
record is the one people get wrong and it is already right here: Google and
Mailgun are merged into a single record, rather than two separate SPF records,
which would invalidate both.

```
v=spf1 include:_spf.google.com include:mailgun.org ~all
```

Two things to keep in mind now that the sending domain is the root corporate
domain rather than a subdomain:

- **App mail and everyone's Workspace mail share one reputation.** At contract
  volume that is fine. If outbound volume ever grows a lot, moving to a
  subdomain such as `sign.futureofsports.io` is the escape hatch, and it means
  repeating the DKIM and tracking records there.
- **DMARC is at `p=none`**, which means nothing gets rejected while the reports
  accumulate. Read them for a couple of weeks before tightening to `quarantine`.
  Do not jump to `p=reject` until Workspace and Mailgun are both confirmed
  aligned, or legitimate mail including your own login links will bounce.

`MAILGUN_SENDER` must stay on `futureofsports.io` for alignment. Sending as
`legal@futureofsports.io` is correct and will authenticate. A From address on
`leaguesports.co` would not: that domain has no SPF record at all.

## Where each secret goes

Three places need credentials, because three things send mail.

**Vercel and Cloud Run** (the dashboard, for magic-link login):

```bash
MAILGUN_DOMAIN=futureofsports.io
MAILGUN_API_KEY=<private API key>
MAILGUN_SENDER=League Sports Legal <legal@futureofsports.io>
MAILGUN_REPLY_TO=legal@futureofsports.io
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
MAILGUN_DOMAIN=futureofsports.io \
MAILGUN_SENDER=legal@futureofsports.io \
ops/opensign-gcp/set-mailgun.sh
```

**The sender format differs between the two systems, and getting it wrong fails
silently.** The dashboard accepts a display name, because it passes the value
straight to Mailgun's `from` parameter, which understands `Name <address>`.
OpenSign does not: it builds its own header as `appName <MAILGUN_SENDER>`, so a
display name here nests the angle brackets and Mailgun rejects every send with
`400 from parameter is not a valid address`. Nothing in the OpenSign UI reports
this; mail just never arrives. Use a bare address on the VM and set the display
name with `appName` in `.env.prod`. `set-mailgun.sh` now refuses the wrong form.

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
