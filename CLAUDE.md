@AGENTS.md

# LSC Legal & Compliance Dashboard

## Project Overview
Module 2 of the LSC Operations Platform. Full legal operations platform: compliance management (per-entity, per-jurisdiction), agreement lifecycle management, KYC tracking, litigation management, email intelligence, subsidies, AI contract generation, ESOP management, agent-based automation, and 85-item legal tracker for League Sports Co.

## Agent Architecture

Contract generation uses an isolated Codex CLI worker authenticated with Anuj's
ChatGPT account, as explicitly requested on 21 September 2026. App requesters are
separate from the worker owner. `GENERATION_ENABLED=1` alone is insufficient:
the owner, requester, live heartbeat, synthetic inference proof and exact skill
hash must all pass. Drafts require independent fairness and cross-reference
reviews bound to their content hash plus a fresh human approval before saving.
No API drafting fallback. See `ops/generation-worker/README.md`.
Existing analysis agents and deterministic MNDA sending are separate workflows.

Agents live in `src/lib/agents/`. Each extends `BaseAgent` and implements `run()`.

- **Orchestrator** (`orchestrator.ts`): Single registry for runnable agents and direct `runAgent()` triggers
- **Compliance Agent**: 15-day scan of all entities/jurisdictions for compliance issues
- **Agreement Analyzer**: AI-powered document categorization, clause extraction, file naming
- **Invoice Detection**: Scans emails for invoices, verifies math, routes to finance
- **Compliance Audit**: Full adversarial audit every 15 days, produces AuditReport records
- `AgentMessage` is diagnostic/legacy plumbing only; production workflows use direct triggers. Cross-dashboard events use the durable `CrossModuleEvent` queue.

## Tech Stack
- **Framework**: Next.js 16.3.5 (App Router, Server Components)
- **Database**: NeonDB (PostgreSQL) via Prisma 7.6.0
- **UI**: shadcn/ui + Tailwind CSS v4 (dark mode primary)
- **Charts**: Recharts
- **AI**: Codex CLI with ChatGPT for drafting; existing Gemini/Anthropic analysis agents
- **Drag & Drop**: @dnd-kit/core
- **Icons**: lucide-react
- **Auth**: Custom cookie-based HMAC sessions
- **Deploy**: GCP Cloud Run `lsc-legal-dashboard`, project `fsp-legal-esign`, region `asia-southeast1`; GitHub source

## Key Rules
1. **Read Next.js 16 docs first**: Check `node_modules/next/dist/docs/` before writing any code. `params` and `searchParams` are Promises in page components — always `await` them.
2. **Server Components by default**: Only add `'use client'` when you need state, effects, or event handlers.
3. **Dark mode primary**: slate-950 background everywhere. See `.claude/skills/design-system.md` for full tokens.
4. **Prisma for all DB access**: Use the singleton from `src/lib/prisma.ts`. Never raw SQL unless reading finance tables.
5. **Server Actions for mutations**: All writes go through `src/actions/`. Always call `requireSession()` or `requireRole()` first.
6. **Financial figures use JetBrains Mono**: `font-mono tabular-nums` class on all numbers.
7. **USD reporting default**: Keep agreement-currency Decimal values and display native amounts with sourced USD references using `src/lib/money.ts`. Missing/stale FX and unknown amounts remain explicit. Never relabel native amounts or use floating-point money.

## Skills Reference
- `.claude/skills/agentic-flows.md` — Current agent registry, lifecycle triggers, cron/webhook/Finance sync rules, verification checklist
- `.claude/skills/design-system.md` — Colors, typography, component patterns, dark theme tokens
- `.claude/skills/prisma-schema.md` — Full database schema with all models and enums
- `.claude/skills/auth-pattern.md` — Cookie-based auth, roles, permissions, middleware
- `.claude/skills/page-specs.md` — Detailed spec for all 13 legal dashboard pages
- `.claude/skills/component-patterns.md` — Server/Client component patterns, reusable components
- `.claude/skills/api-and-actions.md` — Server actions, route handlers, mutation patterns
- `.claude/skills/tracker-seed-data.md` — All 85 tracker items with priorities and dependencies
- `.claude/skills/finance-integration.md` — How legal and finance modules connect

## Entity Structure
- **LSC** (parent holding company)
- **TBR** (Team Blue Rising — E1 racing)
- **FSP** (Future of Sports — tech platform)
- **Bowling, Squash, Basketball, Beer Pong, Padel** (tournament properties)
- **Foundation Events** (charitable)

## Permission Roles (8 roles from PRD)
Platform Admin (AK) | Finance Admin (Anuj) | Legal Admin (Arvind) | Ops Admin (AM) | FSP Finance (Tabitha, Sayan) | Commercial Officer | Team Member | External Auditor

## Legal OS v2 invariants

- The central document policy in `src/lib/document-access.ts` limits global access
  to the four confirmed futureofsports.io principals. Platform role alone does
  not bypass it. Fresh AppUser state controls sessions and individual grants.
- Artifact bytes and provenance are immutable. Signed lineage binds to the exact
  populated artifact sent to the provider, never the current attachment.
- Entity legal identities require sourced evidence; arena codes are a separate
  naming lexicon. Existing unclassified matters and unmapped KYC remain visible.
- Review schedule mutations and dependency events are durable database writes.
  Public cadence is 14 days for six calendar months; later cadence is unset.
- Backup archives are scoped document exports with manifests and missing-file
  reports, not proof of database or OpenSign recovery.
- Use explicit GCP project flags. The operator's default gcloud project is unrelated.
- Runtime configuration and credentials are separate from tested implementation.
  See `docs/v2/documents-runtime.md`, `docs/v2/entities-runtime.md`, and `PLAN.md`.
