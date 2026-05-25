# Authentication Pattern — LSC Legal Dashboard

## Overview
Passwordless magic-link authentication with cookie-based HMAC-signed sessions.
Only emails in `AUTH_ALLOWED_EMAILS` can request or redeem links, and existing
cookies are rejected if their email is removed from the allowlist.

## Files

### `src/lib/session.ts`
- Cookie name: `lsc_legal_session`
- HMAC signing using `AUTH_SESSION_SECRET` env var
- Token payload: `{ userId: string, role: UserRole, email: string, exp: number }`
- Expiry: 90 days
- Functions:
  - `createSessionToken(payload)` → signed string
  - `verifySessionToken(token)` → payload or null
  - `setSessionCookie(payload)` → sets HTTP-only cookie
  - `clearSessionCookie()` → clears cookie
- Uses Web Crypto HMAC SHA-256 for edge-compatible signing
- Token format: `base64(payload).base64(signature)`
- `verifySessionToken()` also checks `AUTH_ALLOWED_EMAILS`, so removing an email
  from the allowlist invalidates its existing session on the next request.

### `src/lib/auth.ts`
- Uses Prisma client to query `AppUser` table
- Functions:
  - `authenticateWithPassword(email, password)` → legacy-compatible helper; still allowlist-gated, but no user-facing password form should call it
  - `requireSession()` → reads cookie, verifies, returns session payload; redirects to `/login` if invalid
  - `requireRole(allowedRoles: UserRole[])` → calls requireSession, checks role, throws 403 if unauthorized
  - `getOptionalSession()` → returns session or null (no redirect)
  - `logoutCurrentUser()` → clears cookie, logs event
- Password hashing: `bcryptjs` with salt rounds 12

### `src/lib/auth-allowlist.ts`
- Source of truth for strict login allowlisting.
- Production should set `AUTH_ALLOWED_EMAILS` as a comma-separated list.
- Code fallback currently permits only:
  - `anuj@leaguesportsco.com`
  - `ak@leaguesportsco.com`
  - `adi@leaguesportsco.com`

### `src/lib/magic-link.ts`
- Generates one-time 32-byte tokens and stores only SHA-256 token hashes in `AuthMagicLinkToken`.
- Default token TTL: 15 minutes (`AUTH_MAGIC_LINK_TTL_MINUTES`, 5-60 minute bounds).
- Revokes previous unused links for the same user before issuing a new one.
- Sends via `src/lib/email.ts`; production requires `RESEND_API_KEY` and `AUTH_EMAIL_FROM`.
- Local development without `RESEND_API_KEY` uses debug delivery and exposes a local debug link in the login UI.

### `src/app/api/auth/magic/route.ts`
- Public GET route used by emailed links.
- Verifies the token hash, expiry, one-time status, user active state, and allowlist membership.
- Marks the token consumed, logs `magic_link_login`, sets the 90-day session cookie, and redirects to `/legal`.

### `src/app/api/auth/logout/route.ts`
- POST route used by the sidebar sign-out form.
- Clears the session cookie and redirects to `/login`.

### `src/lib/password.ts`
- `hashPassword(plain)` → bcrypt hash
- `verifyPassword(plain, hash)` → boolean

### `src/lib/permissions.ts`
Role-based page access:

```typescript
const PAGE_PERMISSIONS: Record<string, UserRole[]> = {
  '/legal':                 ['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN', 'FSP_FINANCE', 'COMMERCIAL_OFFICER', 'TEAM_MEMBER', 'EXTERNAL_AUDITOR'],
  '/legal/documents':       ['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN', 'FSP_FINANCE', 'COMMERCIAL_OFFICER', 'TEAM_MEMBER', 'EXTERNAL_AUDITOR'],
  '/legal/documents/[id]':  ['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN', 'FSP_FINANCE', 'COMMERCIAL_OFFICER', 'TEAM_MEMBER', 'EXTERNAL_AUDITOR'],
  '/legal/signatures':      ['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'],
  '/legal/generate':        ['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'],
  '/legal/templates':       ['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'],
  '/legal/expirations':     ['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'],
  '/legal/compliance':      ['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'],
  '/legal/esop':            ['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'],
  '/legal/policies':        ['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN', 'FSP_FINANCE', 'TEAM_MEMBER'],
  '/legal/issues':          ['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN', 'FSP_FINANCE', 'COMMERCIAL_OFFICER', 'TEAM_MEMBER'],
  '/legal/tracker':         ['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'],
  '/legal/payment-cycles':  ['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'],
}
```

Entity-level scoping:
- `FSP_FINANCE`: can only view documents where entity = FSP (unless emergency override is active)
- `COMMERCIAL_OFFICER`: can only view documents they own or are associated with
- `TEAM_MEMBER`: can only view own employment docs, sign assigned docs, submit issues
- `EXTERNAL_AUDITOR`: read-only access to document repository, time-limited sessions

### `src/proxy.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/session'

const PUBLIC_PATHS = ['/login', '/api/auth/magic']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = request.cookies.get('lsc_legal_session')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const session = verifySessionToken(token)
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)']
}
```

### `src/app/login/page.tsx`
- Simple dark-themed passwordless login page.
- Email-only form lives in `src/app/login/magic-link-login-form.tsx`.
- Submit calls `requestMagicLinkAction`.
- The response is generic for unapproved or missing accounts to avoid account enumeration.
- Invalid/expired/reused links redirect to `/login?error=invalid-link`.

### `src/app/login/actions.ts`
```typescript
'use server'
import { getRequestContext, requestMagicLink } from '@/lib/magic-link'

export async function requestMagicLinkAction(formData: FormData) {
  const email = formData.get('email') as string
  const context = await getRequestContext()
  return requestMagicLink(email, context)
}
```

## Seed Users (from PRD Section 8)

| Name | Email | Role | Notes |
|------|-------|------|-------|
| Adi K Mishra (AK) | ak@leaguesports.co | PLATFORM_ADMIN | Full access everywhere |
| Anuj Kumar Singh | anuj@leaguesports.co | FINANCE_ADMIN | Full access, primary operator |
| Arvind (AV) | arvind@leaguesports.co | LEGAL_ADMIN | Full legal, view-only finance |
| AM | am@leaguesports.co | OPS_ADMIN | Full access |
| Tabitha | tabitha@leaguesports.co | FSP_FINANCE | FSP-scoped |
| Sayan | sayan@leaguesports.co | FSP_FINANCE | FSP-scoped |
| Commercial | commercial@leaguesports.co | COMMERCIAL_OFFICER | Own contracts only |
| Team Member | team@leaguesports.co | TEAM_MEMBER | Own docs, submit issues |

Default dev passwords are legacy seed-only. User-facing login is magic-link only.
