# Magic-link login runbook

Magic link is the primary login path for the Legal dashboard. A visitor enters an
email, receives a single-use link, and clicking it creates the session.

## Who can sign in

Exactly three addresses:

- `anuj@futureofsports.io`
- `ak@futureofsports.io`
- `adi@futureofsports.io`

`src/lib/auth-allowlist.ts` holds these as the code default.
`AUTH_ALLOWED_EMAILS` overrides them as a comma-separated list, and production
should always set it explicitly.

Two independent gates apply. The address must be in the allowlist, and an
`AppUser` row with `is_active = true` must exist for it. Removing an address from
`AUTH_ALLOWED_EMAILS` invalidates existing session cookies on the next request,
because `verifySessionToken()` re-checks the allowlist on every request, and it
also kills any link already sitting in that person's inbox.

## Environment

```bash
AUTH_SESSION_SECRET=<32+ character random secret>
AUTH_ALLOWED_EMAILS=anuj@futureofsports.io,ak@futureofsports.io,adi@futureofsports.io
MAGIC_LINK_LOGIN_ENABLED=1
MAILGUN_DOMAIN=<verified Mailgun sending domain>
MAILGUN_API_KEY=<Mailgun private API key>
MAILGUN_SENDER=Legal OS <legal@your-mailgun-domain>
AUTH_APP_URL=https://<production host>
DATABASE_URL=<production database url>
DIRECT_DATABASE_URL=<production direct database url>
```

`MAGIC_LINK_LOGIN_ENABLED=1` does not switch behaviour in the app; it tells
`scripts/check-release-env.mjs` and `scripts/check-agent-hygiene.mjs` to fail the
release gate when the Mailgun variables or `AUTH_ALLOWED_EMAILS` are missing. Set
it once Mailgun is configured.

Link host resolution order, in `resolveAppBaseUrl()`:

1. `AUTH_APP_URL`
2. `VERCEL_PROJECT_PRODUCTION_URL` (an `https://` prefix is added when it has no scheme)
3. `https://lsc-legal-dashboard.vercel.app`

Set `AUTH_APP_URL` in production so emailed links never point at a preview
deployment.

## Provision the users

```bash
npm run auth:provision-magic-link
node scripts/provision-magic-link-access.mjs --deactivate-others
```

The script is idempotent. It upserts the three addresses as `PLATFORM_ADMIN` with
`is_active = true`. `AppUser.password_hash` is NOT NULL in the database, so rows
get a bcrypt hash of a random secret that is never printed and never stored; no
password login path exists, so the column is inert. `--deactivate-others` sets
`is_active = false` on every other `AppUser` row.

## Rollout order, which matters

Password login is REMOVED. The emailed link is the only way in, which makes
Mailgun delivery a hard dependency of login itself: if mail cannot be sent,
nobody can start a new session, and sessions last 30 days, so an unnoticed mail
outage eventually locks everyone out as sessions age out.

Narrowing `AUTH_ALLOWED_EMAILS` is the step that locks people out, because
`verifySessionToken` in `src/lib/session.ts` re-checks the allowlist on every
request. Run these in order:

1. Set `MAILGUN_DOMAIN`, `MAILGUN_API_KEY` and `MAILGUN_SENDER` in the hosting
   env, plus `AUTH_APP_URL`.
2. Provision the three accounts: `npm run auth:provision-magic-link`.
3. Temporarily widen `AUTH_ALLOWED_EMAILS` to the old three plus the new three,
   and confirm a magic link actually arrives and signs you in as
   `anuj@futureofsports.io`. Keep a signed-in session open in another browser
   while you do the next step.
4. Only then narrow `AUTH_ALLOWED_EMAILS` to the three `@futureofsports.io`
   addresses, and run the script again with `--deactivate-others`.

If you are ever locked out entirely (mail down, no live session), the recovery is
`AUTH_ALLOWED_EMAILS` plus Mailgun repair at the hosting level; there is no
in-app back door, deliberately.

No schema change is needed. `AuthMagicLinkToken` already exists in
`prisma/schema.prisma` and in the production database via
`ops/sql/20260524_passwordless_magic_links.sql`.

## Security properties

- The token is `crypto.randomBytes(32).toString("base64url")`. Only its SHA-256
  hex digest is stored in `AuthMagicLinkToken.token_hash`, so a database leak
  cannot mint sessions. The raw token exists only in the emailed URL and is never
  logged.
- TTL is 15 minutes (`MAGIC_LINK_TTL_MINUTES` in `src/lib/magic-link.ts`).
- Single use. Consuming sets `used_at` under a `used_at IS NULL` guard, so two
  near-simultaneous clicks resolve to exactly one winner. A token with `used_at`,
  `revoked_at`, or a past `expires_at` is refused.
- Outstanding links are deliberately NOT revoked when a new one is requested.
  Revoking on reissue meant any unauthenticated visitor could invalidate an
  admin's in-flight link just by submitting that admin's address, and these three
  addresses are public. Single use plus the short TTL is the real protection, so
  more than one link can be live at a time and each still works exactly once.
- Two independent budgets per 15 minutes: 5 tokens per email address and 10 per
  requesting IP. The per-IP budget is what stops one caller from spending a
  victim's allowance and denying them login.
- The callback is two steps. `GET /api/auth/magic?token=...` only inspects the
  token and renders a confirm button; `POST` burns it and creates the session.
  Mail gateways and chat link-previews fetch URLs before a human clicks, and a
  one-step GET would let a scanner spend the link and receive the admin session
  cookie. `HEAD` returns 200 without touching the token.
- No user enumeration. Requesting a link always returns the same neutral
  confirmation, whether the address is allowlisted, unknown, inactive, or rate
  limited. The real reason goes to `console.error` and to `AuthAccessEvent`.
- Consuming re-checks, in order: token validity, allowlist membership for
  `AuthMagicLinkToken.email`, then `AppUser.is_active`.
- `AuthAccessEvent` records `magic_link_requested` and `magic_link_consumed` with
  `event_status` `success` or `failed`, plus `ip_address` (first value of
  `x-forwarded-for`) and `user_agent`. Failures carry a `reason` in `metadata`.
- Failures redirect to `/login?error=magic_link_invalid`. The token and the real
  reason are never echoed to the browser.
- `src/proxy.ts` lets `/api/auth/magic` through without a session cookie. That
  bypass is required: the callback is the request that creates the session, so
  without it every link would redirect to `/login`.

## Password login is gone

The password fallback was removed on 2026-08-13 (form, action,
`authenticateWithPassword`, `src/lib/password.ts`, the legacy provisioning
script, and the break-glass password mode, which only made sense while a
password form existed). `AppUser.password_hash` remains as a NOT NULL column
holding unusable random hashes; dropping it is a schema change for another day.

Sessions created by a magic-link sign-in last 30 days
(`SESSION_DURATION_MS` in `src/lib/session.ts`). Existing cookies keep the
expiry they were issued with.

## Verify end to end

1. Confirm env: `node scripts/check-release-env.mjs` with
   `MAGIC_LINK_LOGIN_ENABLED=1` set. It must not report missing Mailgun vars.
2. Provision users: `node scripts/provision-magic-link-access.mjs`.
3. Open `/login`, enter an allowlisted address, submit. The form is replaced by
   the neutral confirmation.
4. Confirm the row:
   `select email, created_at, expires_at, used_at, revoked_at from "AuthMagicLinkToken" order by created_at desc limit 5;`
   `token_hash` must look like a 64-character hex digest, and no log line should
   contain the raw token.
5. Click the emailed link. It should land on `/legal` with a session, and
   `used_at` should be set.
6. Click the same link again. It should land on
   `/login?error=magic_link_invalid`.
7. Request two links in a row, then click the first one. It must be refused as
   revoked.
8. Enter a non-allowlisted address. The response must be the same neutral
   confirmation, and the server log should show `not_allowlisted`.
9. Check the audit trail:
   `select event_type, event_status, ip_address, metadata, created_at from "AuthAccessEvent" order by created_at desc limit 10;`
