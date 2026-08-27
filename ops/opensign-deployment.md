# OpenSign Deployment Contract

OpenSign is the only active e-sign provider for this Legal platform. Dropbox Sign is legacy-readable only.

**Hosting moved from Render to the FSP GCP organisation on 2026-08-11.** Render is no longer used.
The live deployment kit is `ops/opensign-gcp/`; read `ops/opensign-gcp/README.md` for the runbook.
This file is kept as the env and admin-setup contract only.

## Live deployment

| Item | Value |
| --- | --- |
| GCP org | futureofsports.io (`332878680067`) |
| GCP project | `fsp-legal-esign` |
| Zone | `me-central1-a` (Doha, closest region to the UAE legal team) |
| Instance | `opensign-vm` (e2-medium, Ubuntu 24.04) |
| Static IP | `34.18.92.76` |
| Host | `https://sign-34-18-92-76.sslip.io` |
| Stack | docker compose: `opensign/opensignserver:main`, `opensign/opensign:main`, `mongo:7`, `caddy:2` |
| TLS | Caddy with Let's Encrypt, automatic renewal |
| Mail | Mailgun (see the Mailgun section) |

`sslip.io` resolves any `<ip-with-dashes>.sslip.io` name to that IP, so the host needs no DNS
record and still gets a real certificate. To move to a vanity host such as `sign.leaguesports.co`,
point an A record at the static IP and re-run `deploy.sh` with `OPENSIGN_HOST=sign.leaguesports.co`.

## Legal Dashboard Env

```
OPENSIGN_BASE_URL=https://sign-34-18-92-76.sslip.io/api/app
OPENSIGN_PUBLIC_URL=https://sign-34-18-92-76.sslip.io
OPENSIGN_APP_ID=opensign
OPENSIGN_MASTER_KEY=<MASTER_KEY from the VM's /opt/opensign/.env.prod>
OPENSIGN_USER_EMAIL=legal@futureofsports.io
```

## What the self-hosted build does NOT have

Verified against the running container on 2026-08-27, and this corrects earlier
notes in this file:

- **No REST v1 API.** There is no `/api/v1` or `/api/app/v1`. An earlier version
  of this document claimed `/api/app/v1` was verified because it returned 403
  rather than 404; that was a misreading, since Parse returns 403 for unknown
  paths under its mount too.
- **No API tokens.** The client bundle has no `/generatetoken` route, the server
  never reads an `x-api-token` header, and no token is stored anywhere. The
  "API Token" entry in Settings is a menu item whose page was never bundled, so
  it 404s. It is a cloud-only feature.
- **No webhooks.** Nothing in the server source mentions them, and the Webhook
  settings page is likewise absent. `OPENSIGN_WEBHOOK_SECRET` and
  `OPENSIGN_WEBHOOK_URL` are therefore unused by this deployment.

## How the integration actually works

Parse Server is mounted at `/api/app` with about 70 cloud functions, and that is
the interface:

1. `POST /api/app/loginAs` with `X-Parse-Master-Key` mints a session token for
   the `OPENSIGN_USER_EMAIL` account. No OpenSign password is stored anywhere.
2. Cloud functions are called with `X-Parse-Session-Token`:
   `createDocumentFromApp` to raise a signature request, `getDocument` to read
   progress, `savecontact` and `isUserInContactBook` to resolve signers.
3. The PDF is uploaded into OpenSign's own Parse file store rather than passed
   as a presigned S3 link. Presigned links expire in an hour, while OpenSign
   re-fetches the document each time a signer opens it, which can be days later.

Because there are no webhooks, completion is discovered by polling
`/api/cron/opensign-poll`.

**The 15 minute cadence runs on GCP, not Vercel.** Vercel's Hobby plan permits
only one cron run per day and rejects the whole deployment if any schedule asks
for more, so `vercel.json` carries a daily entry purely to stay deployable. The
real poll is a Cloud Scheduler job, `opensign-poll` in `fsp-legal-esign`
(`asia-southeast1`), calling the Cloud Run URL every 15 minutes with a bearer
`CRON_SECRET`. Cloud Run has its own `CRON_SECRET`, separate from Vercel's,
because Vercel stores that value as sensitive and will not disclose it. It shares its completion path with
the (currently dead) webhook route via `src/lib/opensign-sync.ts`, so filing the
signed PDF and posting to Finance cannot drift between the two.

The practical consequence: signature status updates lag by up to 15 minutes
rather than arriving instantly. For contract signing that is not material.

## Mailgun

OpenSign refuses to initialise without mail credentials, so the VM was first brought up with
placeholder values via `ALLOW_PLACEHOLDER_MAIL=1`. Outbound email, including the OpenSign admin
signup verification and every signer invitation, stays broken until the real key is injected:

```bash
MAILGUN_API_KEY=key-... \
MAILGUN_DOMAIN=mg.leaguesports.co \
MAILGUN_SENDER=postmaster@mg.leaguesports.co \
ops/opensign-gcp/set-mailgun.sh
```

`SMTP_ENABLE` stays `false` so the Mailgun driver is used. The same Mailgun account can back the
legal tracker channel notifier's email driver; see `ops/legal-tracker-channel.md`.

## OpenSign Admin Setup

In OpenSign Settings:

1. Create the admin account at the host URL. This sends a verification email, so Mailgun must be
   live first.
2. Create the API token used by `OPENSIGN_API_TOKEN`.
3. Configure the webhook callback URL to `OPENSIGN_WEBHOOK_URL`.
4. Configure the webhook secret to match `OPENSIGN_WEBHOOK_SECRET`.
5. Send a test document and confirm `/legal/ops-monitor` shows the callback as processed.

The webhook route accepts the signature on `x-webhook-signature`, `x-opensign-signature` or
`x-signature` and expects hex HMAC-SHA256 over the raw body. Which header this OpenSign build
actually sends has not been observed yet; if the first live callback returns 401, read the stored
`WebhookEventLog` row and the Caddy access log to see the header that arrived.

## Signed PDF storage

The stack runs with `USE_LOCAL=true`, so OpenSign keeps files on the `opensign-files` volume and
the Legal webhook downloads the completed PDF over HTTPS before re-uploading it to the LSC S3
bucket as a new `DocumentVersion`. If that download ever returns 403, switch OpenSign to the
S3-compatible `DO_*` block documented in `ops/opensign-gcp/env.prod.example` and redeploy.

## Release Gate

Before Vercel deploy:

```bash
npm run release:gate
```

Before production launch with strict env enforcement:

```bash
RELEASE_GATE_STRICT_ENV=1 npm run release:gate
```

Set `OPENSIGN_SIGNING_ENABLED=1` in the gate environment to make the four OpenSign vars mandatory,
and `LEGAL_TRACKER_NOTIFY_ENABLED=1` to make the tracker channel vars mandatory.
