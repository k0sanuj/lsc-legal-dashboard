<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project-Specific Agent Rules

- Read `CLAUDE.md` for the product, stack, roles, and skill references before making non-trivial changes.
- For agent, cron, webhook, Dropbox Sign, Gmail, or Legal -> Finance sync work, read `.claude/skills/agentic-flows.md` first.
- Treat `.claude/skills/prisma-schema.md` and `.claude/skills/finance-integration.md` as historical references; confirm current truth in `prisma/schema.prisma` and `src/lib/finance-webhook.ts`.
- Do not commit `.env*` or `.vercel`; production secrets belong in GCP runtime configuration or Secret Manager, never the source upload.

## Deployment and verification gotchas, 21 September 2026

- Always pass `--project=fsp-legal-esign`; local gcloud defaults to another project.
- Live data is Neon Postgres; Cloud Run hosting does not imply a Cloud SQL backup.
- Use the isolated verification database for fixtures. Never seed synthetic legal
  entities, money, signatures or Finance payloads into production.
- Run one full TypeScript/release gate at a time; parallel compiler runs exhausted
  local memory during v2 work. Independent agents use bounded checks.
- Preserve additive migration and rollback receipts. Existing production had no
  Prisma migration history, so do not blindly apply a baseline-less deploy.
- Real provider authentication must be verified on the worker, independently of
  local CLI login. A synthetic wrapper test is not a live provider receipt.
