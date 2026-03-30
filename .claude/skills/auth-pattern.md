# Authentication Pattern — LSC Legal Dashboard

## Overview
Cookie-based HMAC-signed session authentication. Matches the pattern used in the finance dashboard (`/Users/anujsingh/lsc-finance-dashboard`) for future unification.

## Files

### `src/lib/session.ts`
- Cookie name: `lsc_legal_session`
- HMAC signing using `AUTH_SESSION_SECRET` env var
- Token payload: `{ userId: string, role: UserRole, email: string, exp: number }`
- Expiry: 7 days
- Functions:
  - `createSessionToken(payload)` → signed string
  - `verifySessionToken(token)` → payload or null
  - `setSessionCookie(payload)` → sets HTTP-only cookie
  - `clearSessionCookie()` → clears cookie
- Use `crypto.createHmac('sha256', secret)` for signing
- Token format: `base64(payload).base64(signature)`

### `src/lib/auth.ts`
- Uses Prisma client to query `AppUser` table
- Functions:
  - `authenticateWithPassword(email, password)` → creates session, logs event, returns user
  - `requireSession()` → reads cookie, verifies, returns session payload; redirects to `/login` if invalid
  - `requireRole(allowedRoles: UserRole[])` → calls requireSession, checks role, throws 403 if unauthorized
  - `getOptionalSession()` → returns session or null (no redirect)
  - `logoutCurrentUser()` → clears cookie, logs event
- Password hashing: `bcryptjs` with salt rounds 12

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

### `src/middleware.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/session'

const PUBLIC_PATHS = ['/login']

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
- Simple dark-themed login form
- Email + password fields
- Submit calls server action `authenticateWithPassword`
- Error display for invalid credentials
- Redirect to `/legal` on success

### `src/app/login/actions.ts`
```typescript
'use server'
import { authenticateWithPassword } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const result = await authenticateWithPassword(email, password)
  if (!result.success) {
    return { error: result.error }
  }

  redirect('/legal')
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

Default dev password for all: `lsc2026!` (only in seed, never in production)
