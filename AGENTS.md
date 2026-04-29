<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project-Specific Agent Rules

- Read `CLAUDE.md` for the product, stack, roles, and skill references before making non-trivial changes.
- For agent, cron, webhook, Dropbox Sign, Gmail, or Legal -> Finance sync work, read `.claude/skills/agentic-flows.md` first.
- Treat `.claude/skills/prisma-schema.md` and `.claude/skills/finance-integration.md` as historical references; confirm current truth in `prisma/schema.prisma` and `src/lib/finance-webhook.ts`.
- Do not commit `.env*` or `.vercel`; production secrets belong in Vercel environment variables.
