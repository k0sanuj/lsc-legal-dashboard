# Authentication Pattern - LSC Legal Dashboard

## Overview
Magic-link authentication with cookie-based HMAC-signed sessions. A visitor asks
for a link, Mailgun delivers it, and the callback creates the session. An
email/password form is retained as a secondary fallback until magic-link delivery
is verified in production.

Only emails in `AUTH_ALLOWED_EMAILS` can log in, and existing cookies are
rejected if their email is removed from the allowlist.

Approved users:
- `anuj@futureofsports.io`
- `ak@futureofsports.io`
- `adi@futureofsports.io`

## Files

### `src/app/login/page.tsx`
- Renders `MagicLinkForm` as the primary login path.
- Renders `PasswordLoginForm` below it as a secondary fallback.
- Maps `?error=` codes, including `magic_link_invalid`, to a humanized message.

### `src/app/login/magic-link-form.tsx`
- Client form with a single email field.
- Calls `requestMagicLinkAction`, then replaces itself with a neutral
  confirmation that states the link expires in 15 minutes.

### `src/app/login/password-login-form.tsx`
- Deliberate fallback, hidden behind a "Sign in with a password instead" toggle.
- Client form with email and password fields; calls `loginWithPasswordAction`.

### `src/app/login/actions.ts`
- `requestMagicLinkAction` calls `requestMagicLink()` and always returns the same
  neutral confirmation, so the form cannot enumerate users.
- `loginWithPasswordAction` calls `authenticateWithPassword(email, password)`,
  redirects to `/legal` on success, and returns generic
  `Invalid email or password` style failures.

### `src/lib/magic-link.ts`
- `requestMagicLink()` mints `crypto.randomBytes(32).toString("base64url")`,
  stores only its SHA-256 hex digest, rate limits to 5 per email address and 10
  per requesting IP per 15 minutes, and emails the link.
- Outstanding links are deliberately NOT revoked when a new one is requested, and
  the per-IP budget exists for the same reason: the three allowlisted addresses
  are public, so anything keyed only on the target email lets a stranger
  invalidate an admin's link or spend their allowance and deny them login.
- `consumeMagicLink()` refuses used, revoked, or expired tokens, re-checks
  `AUTH_ALLOWED_EMAILS` and `AppUser.is_active`, then burns the token.
- 15 minute TTL in `MAGIC_LINK_TTL_MINUTES`. Raw tokens are never logged.
- `resolveAppBaseUrl()` prefers `AUTH_APP_URL`, then `NEXT_PUBLIC_APP_URL`, then
  `VERCEL_PROJECT_PRODUCTION_URL`, then the production Vercel host.

### `src/lib/mailer.ts`
- Mailgun sender used for delivery. `sendTransactionalEmail()` never throws and
  returns `{ ok, error? }`.
- `isMailerConfigured()` and `getMailerMissingEnv()` gate link creation, so no
  token is minted when mail cannot be sent.

### `src/app/api/auth/magic/route.ts`
- Two steps, on the Node runtime. `GET` only inspects the token and renders a
  confirm button. `POST` burns the token, sets the session cookie, and redirects
  to `/legal` with a 303. `HEAD` returns 200 without touching the token.
- The split exists because mail gateways and chat link-previews fetch URLs before
  a human clicks. A one-step GET would let a scanner spend the single-use link and
  be handed the admin session cookie. Do not collapse this back into one handler.
- Failure redirects to `/login?error=magic_link_invalid` without echoing the
  token or the reason.

### `src/proxy.ts`
- `/api/auth/magic` is exempt from the session redirect, alongside `/api/cron/`
  and `/api/webhooks/`. The callback arrives with no cookie, so without this
  bypass no magic link could ever work.

### `src/lib/auth.ts`
- Uses Prisma to query `AppUser`.
- `establishSessionForUser()` is the one place that sets the session cookie,
  updates `last_login_at`, and writes the success `AuthAccessEvent`. Both login
  paths call it.
- Login is blocked unless the normalized email is in `AUTH_ALLOWED_EMAILS`.
- Login is blocked when `AppUser.is_active = false`.
- `authenticateWithPassword()` verifies bcrypt hashes for the fallback path.

### `src/lib/session.ts`
- Cookie name: `lsc_legal_session`.
- HMAC signing using `AUTH_SESSION_SECRET`.
- Expiry: 90 days.
- `verifySessionToken()` checks expiry and `AUTH_ALLOWED_EMAILS`, so removing an
  email from the allowlist invalidates that user on the next request.

### `src/lib/auth-allowlist.ts`
- Source of truth for strict login allowlisting.
- Production should set `AUTH_ALLOWED_EMAILS` as a comma-separated list.
- Code fallback permits only the three approved emails above.

### `scripts/provision-magic-link-access.mjs`
- Upserts the three approved users as `PLATFORM_ADMIN`, `is_active = true`.
- `AppUser.password_hash` is NOT NULL, so new rows get an unusable random bcrypt
  hash that is never printed.
- `--deactivate-others` disables every non-allowlisted `AppUser`.

Recommended production command:

```bash
node scripts/provision-magic-link-access.mjs --deactivate-others
```

### `scripts/provision-password-access.mjs`
- Legacy provisioner for the password fallback accounts. Retire it with the
  fallback.

### `src/app/api/auth/logout/route.ts`
- Clears the session cookie and redirects to `/login`.

## Audit Trail

`AuthAccessEvent` rows carry `ip_address` (first value of `x-forwarded-for`) and
`user_agent`:
- `magic_link_requested`, `success` or `failed`, with a failure `reason` in
  `metadata`.
- `magic_link_consumed`, `success` or `failed`.
- `login` and `logout` for the password fallback path.

## Required Env

```bash
AUTH_SESSION_SECRET=<32+ character random secret>
AUTH_ALLOWED_EMAILS=anuj@futureofsports.io,ak@futureofsports.io,adi@futureofsports.io
MAGIC_LINK_LOGIN_ENABLED=1
MAILGUN_DOMAIN=<verified Mailgun sending domain>
MAILGUN_API_KEY=<Mailgun private API key>
MAILGUN_SENDER=<display name and sender address>
AUTH_APP_URL=<production origin used to build links>
DATABASE_URL=<production database url>
DIRECT_DATABASE_URL=<production direct database url>
```

`MAGIC_LINK_LOGIN_ENABLED=1` makes the release gate require the Mailgun variables
and `AUTH_ALLOWED_EMAILS`. Email delivery now depends on Mailgun and its verified
sending domain. No `RESEND_API_KEY` or `AUTH_EMAIL_FROM` is used.

See `ops/magic-link-auth.md` for the operator runbook and the steps to remove the
password fallback.
