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

Set these in Vercel Production:

- `OPENSIGN_BASE_URL=https://sign-34-18-92-76.sslip.io/api/app/v1`
- `OPENSIGN_PUBLIC_URL=https://sign-34-18-92-76.sslip.io`
- `OPENSIGN_API_TOKEN=<token generated in OpenSign>`
- `OPENSIGN_WEBHOOK_SECRET=<shared HMAC secret>`
- `OPENSIGN_WEBHOOK_URL=https://lsc-legal-dashboard.vercel.app/api/webhooks/opensign`

The REST base path is `/api/app/v1`, **not** `/api/v1`. That was verified against the running
container with `ops/opensign-gcp/probe-api.sh`, which found `/api/v1/createdocument` returns 404
while `/api/app/v1/createdocument` returns 403 `{"error":"unauthorized"}`. Caddy strips the `/api`
prefix and the Parse server mounts at `PARSE_MOUNT=/app`, so the REST routes land under
`/api/app/v1`. Re-run the probe after any OpenSign image upgrade before trusting the old value.

`getOpenSignSetupStatus()` in `src/lib/opensign.ts` treats the feature as unconfigured until
`OPENSIGN_BASE_URL`, `OPENSIGN_API_TOKEN`, `OPENSIGN_WEBHOOK_SECRET` and `OPENSIGN_WEBHOOK_URL`
are all present, so a partial rollout degrades safely instead of failing mid-send.

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
