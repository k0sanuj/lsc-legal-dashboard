# Agentic Flows - LSC Legal Dashboard

Use this file before editing anything in `src/lib/agents`, `src/actions/documents.ts`,
webhook routes, cron routes, or Legal -> Finance sync code.

## Current Agent Registry

Agents are instantiated in `src/lib/agents/orchestrator.ts`.
`src/lib/agents/types.ts` must only list executable agents in this table.
Conceptual subagents should not be added to `AgentId` or the architecture UI
until they have a class, trigger, tests, and observable output.

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
  - Analyzer output is persisted to `DocumentAnalysis`; the latest row is the source of truth for summaries, dates, clauses, gaps, risks, and next steps.
  - `DRAFT -> IN_REVIEW`: schedules `agreement-analyzer`.
  - `NEGOTIATION -> AWAITING_SIGNATURE`: schedules `pre-signature-checklist`.
  - `SIGNED -> ACTIVE`: schedules `activation`.
  - Any transition into `SIGNED`, `ACTIVE`, `EXPIRING`, `EXPIRED`, or `TERMINATED`: emits a Finance contract event.
- `src/actions/files.ts`, `src/actions/kyc.ts`, `src/actions/litigation.ts`
  - Manual document uploads, version uploads, KYC uploads, and litigation uploads all store files in S3 and schedule `agreement-analyzer`.
  - KYC and litigation analysis rows use `DocumentAnalysis.kyc_document_id` or `DocumentAnalysis.litigation_document_id` instead of creating unrelated LegalDocument rows.
- `src/app/api/webhooks/gmail/route.ts`
  - Requires `GMAIL_WEBHOOK_SECRET` via query token or `x-lsc-webhook-secret`.
  - Logs each Pub/Sub callback in `WebhookEventLog` with provider `gmail` and dedupes by Pub/Sub `messageId`.
  - Marks callbacks as `processed`, `ignored`, or `failed` for audit/debuggability.
  - Decodes Pub/Sub `message.data.emailAddress` and only processes mailboxes in `GMAIL_WATCH_MAILBOXES`.
  - Creates incoming notices and runs invoice detection against recent Gmail messages for the changed mailbox.
  - Returns HTTP 500 on Gmail fetch/notice-processing failures so Pub/Sub can retry; invoice-agent failures are non-blocking and recorded on the webhook log.
- `src/app/api/cron/gmail-watch/route.ts`
  - Protected by `CRON_SECRET`.
  - Renews Gmail watches daily for all mailboxes in `GMAIL_WATCH_MAILBOXES`.
- `src/actions/opensign.ts`
  - Creates OpenSign document requests from a LegalDocument file and pending `SignatureRequest` rows.
  - Uploads the current PDF to OpenSign, sends pending signers, and stores OpenSign provider IDs/signing links on Legal rows.
  - Optional widget JSON can be supplied per signer; otherwise the action sends default signature/date widgets on page 1.
  - Transitions the document to `AWAITING_SIGNATURE` and marks pending signers as `SENT`.
  - After the transaction commits, schedules a legal tracker channel notification with `after()`. A channel outage must never fail or slow a signature send.
- `src/lib/legal-tracker.ts` + `src/lib/legal-tracker-payloads.ts`
  - Outbound channel notifier for the legal tracker channel that Aditya Mishra watches. Transport and pure payload builders are split the same way `finance-webhook.ts` and `finance-payloads.ts` are.
  - Driver is chosen by `LEGAL_TRACKER_CHANNEL_PROVIDER`: `slack`, `google_chat`, `mailgun`, or `none`. Unset auto-detects from whichever credentials exist.
  - Slack answers HTTP 200 with `{ ok: false, error }` on failure, so the body is parsed rather than trusting the status code.
  - Never throws. Returns `{ ok, provider, error? }` and returns `ok: false` when unconfigured.
  - Writes a `CrossModuleEvent` row with source `legal_tracker` before posting. Only the `agreement.sent` path also mirrors the outcome onto `LegalDocument.last_tracker_notified_at` / `tracker_notify_status` / `last_tracker_notify_error`; `redline.sent` carries `entity_type` `Redline` and has no document to mirror onto.
  - Delivery failure arrives as a return value, never as a thrown error, so every call site must check `result.ok` rather than relying on try/catch.
  - No retry cron consumes source `legal_tracker`. An undelivered notification shows up in the Outbound Queue Failures panel on `/legal/ops-monitor` (which selects sources `legal` and `legal_tracker`) and must be resent by an operator. Add a cron or extend the finance-resync whitelist if that changes.
  - `LEGAL_TRACKER_MENTION` and `LEGAL_TRACKER_EMAIL_TO` are env-only. Never hardcode a person's Slack id or email.
- `src/actions/redlines.ts`
  - Redline lifecycle for the redline editor and tracker. Every action requires `PLATFORM_ADMIN`, `LEGAL_ADMIN` or `OPS_ADMIN`.
  - `createRedlineFromDocument` extracts text from the stored S3 file (or a chosen `DocumentVersion`), stores it as both `base_text` and `proposed_text`, and opens a new round.
  - `transitionRedline` writes the status plus a `RedlineEvent` in one transaction, and on `SENT_TO_COUNTERPARTY` notifies the legal tracker channel inside `after()`.
- `src/app/api/webhooks/opensign/route.ts`
  - Verifies `x-webhook-signature` / `x-opensign-signature` / `x-signature` with `OPENSIGN_WEBHOOK_SECRET` using HMAC-SHA256.
  - Dedupes callbacks with `WebhookEventLog.event_hash`.
  - On viewed/signed/declined/stalled events, updates signer status fields and leaves stalled documents visible to admins.
  - On completed events, stores the completed signed PDF in S3 as a new `DocumentVersion`, updates the main file, transitions lifecycle to `SIGNED`, starts final AI analysis, and emits Legal -> Finance sync.
  - Dropbox Sign / HelloSign files are legacy-readable only. Do not add new user-facing Dropbox paths.
- `src/app/api/cron/*.ts`
  - All cron routes must require `CRON_SECRET`. Missing secrets must deny requests.
- `src/app/api/agents/route.ts`
  - Admin-only diagnostic surface for direct `runAgent()` calls.
  - Generic message routing is not a production workflow. Unsupported message
    intents must remain unresponded and visible in `/legal/ops-monitor`.

## Required Runtime Env

Production needs these variables in Vercel, not committed `.env` files:

- Auth/database: `AUTH_SESSION_SECRET`, `AUTH_ALLOWED_EMAILS`, `DATABASE_URL`, `DIRECT_DATABASE_URL`
- Cron: `CRON_SECRET`
- AI: `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, optional `ANTHROPIC_API_KEY` fallback
- S3: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
- OpenSign: `OPENSIGN_BASE_URL`, `OPENSIGN_PUBLIC_URL`, `OPENSIGN_API_TOKEN`, `OPENSIGN_WEBHOOK_SECRET`, `OPENSIGN_WEBHOOK_URL`
- Dropbox Sign legacy-readable only: `HELLOSIGN_API_KEY`, `HELLOSIGN_CLIENT_ID`, `HELLOSIGN_TEST_MODE`
- Gmail: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CLOUD_PROJECT_ID`
- Gmail webhook: `GMAIL_WEBHOOK_SECRET`, `GMAIL_WATCH_MAILBOXES`
- Finance webhook: `FINANCE_WEBHOOK_URL`, `FINANCE_WEBHOOK_KEY`, `FINANCE_WEBHOOK_SECRET`
- Legal tracker channel: `LEGAL_TRACKER_CHANNEL_PROVIDER` plus the driver's own vars. See `ops/legal-tracker-channel.md`

## Legal -> Finance Contract Events

`src/lib/finance-webhook.ts` is the durable queue boundary.

1. Persist `CrossModuleEvent` with `processed=false`.
2. Send HMAC-signed webhook to Finance.
3. Mark the queue row and originating Legal row as `synced` or `failed`.
4. `/api/cron/finance-resync` retries failed Legal -> Finance events.

Do not bypass `emitFinanceEvent()` for new contract, tranche, share grant, or invoice flows.
TBR invoice detection uses `invoice_detected` through the durable Finance queue.

## Verification Checklist

Run these before handing off agent or sync changes:

```bash
npm run release:gate
```

Expected current state after the May 4, 2026 cleanup:

- `npm run release:gate` runs env/route checks, Prisma validate, TypeScript, lint, and build.
- Vercel Production/Preview must be given `CRON_SECRET`; otherwise scheduled jobs will deny by design.
- Google Pub/Sub must call `/api/webhooks/gmail?token=<GMAIL_WEBHOOK_SECRET>` or send `x-lsc-webhook-secret`.
- OpenSign must call `/api/webhooks/opensign` and sign the exact raw JSON body with `OPENSIGN_WEBHOOK_SECRET`.

## Known Risks To Fix Next

- OpenSign live deployment still requires Render-hosted OpenSign, MongoDB, mail, storage, API token, and webhook secret configuration.
- AI extraction source of truth is `DocumentAnalysis`, keyed to Legal documents, versions, KYC documents, or litigation documents. Do not depend on analyzer log JSON except as legacy fallback.
- Gemini is the primary AI provider for agents. If Anthropic is configured, it is
  only a fallback for provider/quota/rate-limit failures.
- Run `node scripts/check-agent-hygiene.mjs` when changing agents, agent UI,
  Finance retry routing, or required runtime tables.
- `.claude/skills/prisma-schema.md` and `.claude/skills/finance-integration.md` are historical references; verify against `prisma/schema.prisma` and current webhook code before relying on them.
