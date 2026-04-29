# Agentic Flows - LSC Legal Dashboard

Use this file before editing anything in `src/lib/agents`, `src/actions/documents.ts`,
webhook routes, cron routes, or Legal -> Finance sync code.

## Current Agent Registry

Agents are instantiated in `src/lib/agents/orchestrator.ts`.

| Agent id | Class | Main trigger |
| --- | --- | --- |
| `agreement-analyzer` | `AgreementAnalyzerAgent` | Document upload, `DRAFT -> IN_REVIEW` |
| `pre-signature-checklist` | `PreSignatureChecklistAgent` | `NEGOTIATION -> AWAITING_SIGNATURE` |
| `activation` | `ActivationAgent` | `SIGNED -> ACTIVE` |
| `email-inbox.invoice-detection` | `InvoiceDetectionAgent` | Gmail webhook |
| `compliance` | `ComplianceAgent` | `/api/cron/compliance-scan` |
| `compliance-audit` | `ComplianceAuditAgent` | `/api/cron/full-audit` |

## Trigger Map

- `src/actions/documents.ts`
  - New upload with extracted text: schedules `agreement-analyzer` with `after()`.
  - `DRAFT -> IN_REVIEW`: schedules `agreement-analyzer`.
  - `NEGOTIATION -> AWAITING_SIGNATURE`: schedules `pre-signature-checklist`.
  - `SIGNED -> ACTIVE`: schedules `activation`.
  - Any transition into `SIGNED`, `ACTIVE`, `EXPIRING`, `EXPIRED`, or `TERMINATED`: emits a Finance contract event.
- `src/app/api/webhooks/gmail/route.ts`
  - Creates incoming notices and runs invoice detection against recent Gmail messages.
- `src/actions/hellosign.ts`
  - Sends uploaded document files to Dropbox Sign using `fileUrls`.
  - Stores the returned `signatureRequestId` in `LegalDocument.hellosign_envelope_id`.
- `src/app/api/webhooks/hellosign/route.ts`
  - Uses `hellosign_envelope_id` first and title only as a legacy fallback.
- `src/app/api/cron/*.ts`
  - All cron routes must require `CRON_SECRET`. Missing secrets must deny requests.

## Required Runtime Env

Production needs these variables in Vercel, not committed `.env` files:

- Auth/database: `AUTH_SESSION_SECRET`, `DATABASE_URL`, `DIRECT_DATABASE_URL`
- Cron: `CRON_SECRET`
- AI: `AI_PROVIDER`, `ANTHROPIC_API_KEY`, optional `GEMINI_API_KEY`
- S3: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
- Dropbox Sign: `HELLOSIGN_API_KEY`
- Gmail: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CLOUD_PROJECT_ID`
- Gmail webhook: `GMAIL_WEBHOOK_SECRET`
- Finance webhook: `FINANCE_WEBHOOK_URL`, `FINANCE_WEBHOOK_KEY`, `FINANCE_WEBHOOK_SECRET`

## Legal -> Finance Contract Events

`src/lib/finance-webhook.ts` is the durable queue boundary.

1. Persist `CrossModuleEvent` with `processed=false`.
2. Send HMAC-signed webhook to Finance.
3. Mark the queue row and originating Legal row as `synced` or `failed`.
4. `/api/cron/finance-resync` retries failed Legal -> Finance events.

Do not bypass `emitFinanceEvent()` for new contract, tranche, or share grant flows.

## Verification Checklist

Run these before handing off agent or sync changes:

```bash
npm run build
npm run lint
npx prisma validate
npx vercel env ls
```

Expected current state after the April 29, 2026 audit:

- `npm run build` passes locally with `NODE_OPTIONS=--max-old-space-size=4096`.
- `npx prisma validate` passes.
- `npm run lint` still fails and needs cleanup before CI can use lint as a gate.
- Vercel Production/Preview must be given `CRON_SECRET`; otherwise scheduled jobs will deny by design.
- Google Pub/Sub must call `/api/webhooks/gmail?token=<GMAIL_WEBHOOK_SECRET>` or send `x-lsc-webhook-secret`.

## Known Risks To Fix Next

- Dropbox Sign webhook routes are session-bypassed in `src/proxy.ts`; add provider signature validation before treating them as trusted.
- Existing AI extraction is not persisted as structured document metadata, so later lifecycle agents can still re-read `notes` instead of stored extracted file text.
- `.claude/skills/prisma-schema.md` and `.claude/skills/finance-integration.md` are historical references; verify against `prisma/schema.prisma` and current webhook code before relying on them.
