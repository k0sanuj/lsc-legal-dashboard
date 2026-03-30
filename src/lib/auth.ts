import { redirect } from "next/navigation"
import { prisma } from "./prisma"
import { verifyPassword } from "./password"
import {
  setSessionCookie,
  getSessionFromCookie,
  clearSessionCookie,
  type SessionPayload,
} from "./session"
import type { UserRole } from "@/generated/prisma/client"

export async function authenticateWithPassword(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.appUser.findUnique({
    where: { email: email.toLowerCase().trim() },
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

  // Set session cookie
  await setSessionCookie({
    userId: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
  })

  // Update last login and log success
  await Promise.all([
    prisma.appUser.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    }),
    prisma.authAccessEvent.create({
      data: {
        app_user_id: user.id,
        event_type: "login",
        event_status: "success",
      },
    }),
  ])

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
