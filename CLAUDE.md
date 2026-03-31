@AGENTS.md

# LSC Legal & Compliance Dashboard

## Project Overview
Module 2 of the LSC Operations Platform. Legal document management, compliance tracking, signature workflows, AI contract generation, ESOP management, and 85-item legal tracker for League Sports Co.

## Tech Stack
- **Framework**: Next.js 16.2.1 (App Router, Server Components)
- **Database**: NeonDB (PostgreSQL) via Prisma 7.6.0
- **UI**: shadcn/ui + Tailwind CSS v4 (dark mode primary)
- **Charts**: Recharts
- **AI**: Google Gemini API (@google/generative-ai)
- **Drag & Drop**: @dnd-kit/core
- **Icons**: lucide-react
- **Auth**: Custom cookie-based HMAC sessions
- **Deploy**: Vercel + GitHub

## Key Rules
1. **Read Next.js 16 docs first**: Check `node_modules/next/dist/docs/` before writing any code. `params` and `searchParams` are Promises in page components — always `await` them.
2. **Server Components by default**: Only add `'use client'` when you need state, effects, or event handlers.
3. **Dark mode primary**: slate-950 background everywhere. See `.claude/skills/design-system.md` for full tokens.
4. **Prisma for all DB access**: Use the singleton from `src/lib/prisma.ts`. Never raw SQL unless reading finance tables.
5. **Server Actions for mutations**: All writes go through `src/actions/`. Always call `requireSession()` or `requireRole()` first.
6. **Financial figures use JetBrains Mono**: `font-mono tabular-nums` class on all numbers.
7. **AED is primary currency**: Format with `Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' })`.

## Skills Reference
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
