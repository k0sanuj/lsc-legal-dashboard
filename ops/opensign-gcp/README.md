# OpenSign on FSP GCP

One-command deployment of the OpenSign e-signature stack onto a single Compute Engine VM in the
futureofsports.io GCP organisation. Replaces the earlier Render plan.

## Why a VM and not Cloud Run

OpenSign needs a stateful MongoDB and a persistent files volume, and the official distribution is a
four-container docker compose stack. Cloud Run would mean an external MongoDB plus separate services
for the client and server, for no operational gain at this scale. One e2-medium VM running the
upstream compose file is the smallest thing that actually works, and it stays close to how OpenSign
is tested upstream.

## Files

| File | Role |
| --- | --- |
| `deploy.sh` | Idempotent end-to-end deploy: APIs, network, static IP, firewall, VM, upload, start, health check |
| `startup-script.sh` | VM bootstrap: installs Docker Engine with the compose plugin, drops a readiness marker |
| `docker-compose.yml` | server, client, mongo, caddy |
| `Caddyfile` | TLS termination, `/api/*` to the server, everything else to the client |
| `env.prod.example` | Template for the OpenSign runtime env, rendered to `.env.prod` on the VM |
| `set-mailgun.sh` | Inject real Mailgun credentials into a running VM and restart the server |
| `probe-api.sh` | Discover the REST base path of the deployed build instead of guessing it |

## First deploy

```bash
MAILGUN_API_KEY=key-... \
MAILGUN_DOMAIN=mg.leaguesports.co \
MAILGUN_SENDER=postmaster@mg.leaguesports.co \
ACME_EMAIL=anuj@futureofsports.io \
ops/opensign-gcp/deploy.sh
```

To provision before the Mailgun account exists, add `ALLOW_PLACEHOLDER_MAIL=1`. The stack comes up
and serves HTTPS, but no email is deliverable until `set-mailgun.sh` runs, which also blocks the
OpenSign admin signup because that step sends a verification email.

Re-running `deploy.sh` is safe. It reuses the existing IP, firewall rules and VM, re-uploads the
compose files, and restarts the containers.

## Host naming

With no `OPENSIGN_HOST`, the script derives one from the reserved static IP,
`sign-<ip-with-dashes>.sslip.io`. sslip.io resolves that name to the IP with no DNS record needed,
and Let's Encrypt issues a real certificate for it. To move to a vanity hostname later, point an A
record at the static IP and re-run with `OPENSIGN_HOST=sign.leaguesports.co`.

## Operating the VM

```bash
ZONE=me-central1-a
gcloud compute ssh opensign-vm --zone=$ZONE --project=fsp-legal-esign
cd /opt/opensign
sudo docker compose ps
sudo docker compose logs -f server
sudo docker compose logs -f caddy      # certificate issuance problems show up here
sudo docker compose up -d --force-recreate server
```

Mongo data lives in the `opensign_data-volume` Docker volume and completed files in
`opensign_opensign-files`. Neither is backed up yet. Before this handles real executed agreements,
add either a scheduled `mongodump` to GCS or a snapshot schedule on the boot disk.

## Costs

One e2-medium plus a static IP and a 40GB balanced disk is roughly 35 to 45 USD per month in
me-central1. Billing account `01093C-C0D401-782C53`.

## Known gaps

- The document-sealing certificate is a self-signed FSP p12 (CN "Future Of Sports Labs Inc.
  Document Sealing", valid to 2031-08-30), set 2026-08-31 after its absence crashed every signing
  completion. Source of truth: Secret Manager secrets `OPENSIGN_PFX_BASE64` and
  `OPENSIGN_PFX_PASSPHRASE` in project `fresh-authority-499619-r7`. Re-exports must use
  `openssl pkcs12 -export -legacy`; node-forge inside `@signpdf/signer-p12` cannot parse
  OpenSSL 3's default AES-256 p12 encryption. Self-signed means PDF readers show "validity
  unknown"; swap in a CA-issued document-signing certificate for third-party-verifiable seals.
- SSH is open to `0.0.0.0/0` by default. Pass `SSH_SOURCE_RANGE=<your-cidr>/32` to narrow it.
- No MongoDB backup schedule, as noted above.
