# OpenSign Render Deployment Contract

OpenSign is the only active e-sign provider for this Legal platform. Dropbox Sign is legacy-readable only.

## Render Services

Create two Render Docker image services:

1. `lsc-opensign-server`
   - Image: `opensign/opensignserver:main`
   - Service type: Web service
   - Required env:
     - `NODE_ENV=production`
     - `PUBLIC_URL=https://<opensign-public-host>`
     - `SERVER_URL=https://<opensign-server-host>/app`
     - `MONGODB_URI=<managed MongoDB connection string>`
     - `MASTER_KEY=<12+ char random secret>`
     - `PARSE_MOUNT=/app`
     - Mail env required by the chosen OpenSign image/version
     - S3-compatible storage env required by the chosen OpenSign image/version

2. `lsc-opensign-web`
   - Image: `opensign/opensign:main`
   - Service type: Web service
   - Required env:
     - `PUBLIC_URL=https://<opensign-public-host>`
     - `SERVER_URL=https://<opensign-server-host>/app`

## Legal Dashboard Env

Set these in Vercel Production and Preview:

- `OPENSIGN_BASE_URL=https://<opensign-server-host>/api/v1`
- `OPENSIGN_PUBLIC_URL=https://<opensign-public-host>`
- `OPENSIGN_API_TOKEN=<token generated in OpenSign>`
- `OPENSIGN_WEBHOOK_SECRET=<shared HMAC secret>`
- `OPENSIGN_WEBHOOK_URL=https://lsc-legal-dashboard.vercel.app/api/webhooks/opensign`

## OpenSign Admin Setup

In OpenSign Settings:

1. Create the API token used by `OPENSIGN_API_TOKEN`.
2. Configure the webhook callback URL to `OPENSIGN_WEBHOOK_URL`.
3. Configure the webhook secret to match `OPENSIGN_WEBHOOK_SECRET`.
4. Send a test document and confirm `/legal/ops-monitor` shows the callback as processed.

## Release Gate

Before Vercel deploy:

```bash
npm run release:gate
```

Before production launch with strict env enforcement:

```bash
RELEASE_GATE_STRICT_ENV=1 npm run release:gate
```
