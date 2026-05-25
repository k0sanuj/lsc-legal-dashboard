import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashMagicLinkToken } from "@/lib/magic-link"
import { setSessionCookie } from "@/lib/session"
import { isEmailAllowedToLogin } from "@/lib/auth-allowlist"

function getRequestIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")
  )
}

function invalidLinkRedirect(request: NextRequest) {
  return NextResponse.redirect(new URL("/login?error=invalid-link", request.url))
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (!token) return invalidLinkRedirect(request)

  const tokenHash = hashMagicLinkToken(token)
  const now = new Date()
  const record = await prisma.authMagicLinkToken.findUnique({
    where: { token_hash: tokenHash },
    include: { user: true },
  })

  if (
    !record ||
    record.used_at ||
    record.revoked_at ||
    record.expires_at <= now ||
    !record.user.is_active ||
    !isEmailAllowedToLogin(record.user.email)
  ) {
    return invalidLinkRedirect(request)
  }

  const consumed = await prisma.authMagicLinkToken.updateMany({
    where: {
      id: record.id,
      used_at: null,
      revoked_at: null,
      expires_at: { gt: now },
    },
    data: {
      used_at: now,
      consumed_ip: getRequestIp(request),
      consumed_user_agent: request.headers.get("user-agent"),
    },
  })

  if (consumed.count !== 1) return invalidLinkRedirect(request)

  await setSessionCookie({
    userId: record.user.id,
    email: record.user.email,
    role: record.user.role,
    fullName: record.user.full_name,
  })

  await Promise.all([
    prisma.appUser.update({
      where: { id: record.user.id },
      data: { last_login_at: now },
    }),
    prisma.authAccessEvent.create({
      data: {
        app_user_id: record.user.id,
        event_type: "magic_link_login",
        event_status: "success",
        ip_address: getRequestIp(request),
        user_agent: request.headers.get("user-agent"),
        metadata: { tokenId: record.id },
      },
    }),
  ])

  return NextResponse.redirect(new URL("/legal", request.url))
}
