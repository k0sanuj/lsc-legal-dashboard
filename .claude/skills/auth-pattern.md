# Authentication Pattern — LSC Legal Dashboard

## Overview
Email/password authentication with cookie-based HMAC-signed sessions.
Only emails in `AUTH_ALLOWED_EMAILS` can log in, and existing cookies are
rejected if their email is removed from the allowlist.

Approved fallback users:
- `anuj@leaguesportsco.com`
- `ak@leaguesportsco.com`
- `adi@leaguesportsco.com`

## Files

### `src/app/login/page.tsx`
- Renders the operational email/password login form.
- No magic-link, Resend, DNS, or email-delivery dependency.

### `src/app/login/password-login-form.tsx`
- Client form with email and password fields.
- Calls `loginWithPasswordAction`.

### `src/app/login/actions.ts`
- Server action calls `authenticateWithPassword(email, password)`.
- Redirects to `/legal` on success.
- Returns generic `Invalid email or password` style failures.

### `src/lib/auth.ts`
- Uses Prisma to query `AppUser`.
- Login is blocked unless the normalized email is in `AUTH_ALLOWED_EMAILS`.
- Login is blocked when `AppUser.is_active = false`.
- Passwords are verified with bcrypt.
- Successful login sets a 90-day signed session cookie and logs `AuthAccessEvent`.

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

### `scripts/provision-password-access.mjs`
- Upserts the three approved users.
- `--reset-passwords` generates strong temporary passwords and stores bcrypt hashes.
- `--deactivate-others` disables every non-allowlisted `AppUser`.

Recommended production command:

```bash
npm run auth:provision-password -- --reset-passwords --deactivate-others
```

### `src/app/api/auth/logout/route.ts`
- Clears the session cookie and redirects to `/login`.

## Required Env

```bash
AUTH_SESSION_SECRET=<32+ character random secret>
AUTH_ALLOWED_EMAILS=anuj@leaguesportsco.com,ak@leaguesportsco.com,adi@leaguesportsco.com
DATABASE_URL=<production database url>
DIRECT_DATABASE_URL=<production direct database url>
```

No `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, or `AUTH_APP_URL` is required for this
email/password fallback.
