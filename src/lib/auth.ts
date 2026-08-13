import { redirect } from "next/navigation"
import { prisma } from "./prisma"
import { verifyPassword } from "./password"
import {
  setSessionCookie,
  getSessionFromCookie,
  clearSessionCookie,
  type SessionPayload,
} from "./session"
import { isEmailAllowedToLogin, normalizeLoginEmail } from "./auth-allowlist"
import type { UserRole } from "@/generated/prisma/client"

/** The AppUser fields a session cookie is built from. */
export interface SessionUserRecord {
  id: string
  email: string
  role: UserRole
  full_name: string
}

export interface EstablishSessionOptions {
  /** AuthAccessEvent event_type, for example "login" or "magic_link_consumed". */
  eventType: string
  ip?: string | null
  userAgent?: string | null
}

/**
 * Single place that turns a verified AppUser into a signed session: cookie,
 * last_login_at, and the success AuthAccessEvent. Every login path calls this so
 * password and magic-link sign-ins stay identical from here on.
 */
export async function establishSessionForUser(
  user: SessionUserRecord,
  { eventType, ip, userAgent }: EstablishSessionOptions
): Promise<void> {
  await setSessionCookie({
    userId: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
  })

  await Promise.all([
    prisma.appUser.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    }),
    prisma.authAccessEvent.create({
      data: {
        app_user_id: user.id,
        event_type: eventType,
        event_status: "success",
        ip_address: ip ?? null,
        user_agent: userAgent ?? null,
      },
    }),
  ])
}

/**
 * DELIBERATE FALLBACK. Magic link is the primary login path; this password path
 * stays only until magic-link delivery is verified in production, because
 * Mailgun credentials are not set there yet. To retire it, delete
 * src/app/login/password-login-form.tsx, drop loginWithPasswordAction from
 * src/app/login/actions.ts, and delete this function.
 */
export async function authenticateWithPassword(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = normalizeLoginEmail(email)
  if (!isEmailAllowedToLogin(normalizedEmail)) {
    return { success: false, error: "Invalid email or password" }
  }

  const user = await prisma.appUser.findUnique({
    where: { email: normalizedEmail },
  })

  if (!user || !user.is_active) {
    return { success: false, error: "Invalid email or password" }
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    // Log failed attempt
    await prisma.authAccessEvent.create({
      data: {
        app_user_id: user.id,
        event_type: "login",
        event_status: "failed",
      },
    })
    return { success: false, error: "Invalid email or password" }
  }

  // Session cookie, last login, and success event
  await establishSessionForUser(user, { eventType: "login" })

  return { success: true }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSessionFromCookie()
  if (!session) {
    redirect("/login")
  }
  return session
}

export async function requireRole(
  allowedRoles: UserRole[]
): Promise<SessionPayload> {
  const session = await requireSession()
  if (!allowedRoles.includes(session.role)) {
    redirect("/legal?error=unauthorized")
  }
  return session
}

export async function getOptionalSession(): Promise<SessionPayload | null> {
  return getSessionFromCookie()
}

export async function logoutCurrentUser() {
  const session = await getSessionFromCookie()
  if (session) {
    await prisma.authAccessEvent.create({
      data: {
        app_user_id: session.userId,
        event_type: "logout",
        event_status: "success",
      },
    })
  }
  await clearSessionCookie()
}
