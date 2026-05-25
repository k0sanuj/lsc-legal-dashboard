import { createHash, randomBytes } from "node:crypto"
import { headers } from "next/headers"
import { prisma } from "./prisma"
import { sendTransactionalEmail } from "./email"
import { normalizeLoginEmail, isEmailAllowedToLogin } from "./auth-allowlist"

const DEFAULT_TOKEN_TTL_MINUTES = 15

type RequestMagicLinkResult = {
  success: boolean
  message: string
  debugLink?: string
}

type RequestContext = {
  ipAddress?: string | null
  userAgent?: string | null
}

function getMagicLinkTtlMinutes(): number {
  const parsed = Number(process.env.AUTH_MAGIC_LINK_TTL_MINUTES)
  if (Number.isFinite(parsed) && parsed >= 5 && parsed <= 60) return parsed
  return DEFAULT_TOKEN_TTL_MINUTES
}

export function hashMagicLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function getBaseUrl(host?: string | null, protocol?: string | null): string {
  const configured =
    process.env.AUTH_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  if (configured) return configured.replace(/\/+$/, "")
  if (host) {
    const inferredProtocol = host.includes("localhost") || host.startsWith("127.")
      ? "http"
      : protocol ?? "https"
    return `${inferredProtocol}://${host}`.replace(/\/+$/, "")
  }
  return "http://localhost:3000"
}

export async function getRequestContext(): Promise<RequestContext & { baseUrl: string }> {
  const headerStore = await headers()
  const forwardedFor = headerStore.get("x-forwarded-for")
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? headerStore.get("x-real-ip")
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host")
  const protocol = headerStore.get("x-forwarded-proto") ?? "https"

  return {
    ipAddress,
    userAgent: headerStore.get("user-agent"),
    baseUrl: getBaseUrl(host, protocol),
  }
}

export async function requestMagicLink(
  rawEmail: string,
  context: RequestContext & { baseUrl: string }
): Promise<RequestMagicLinkResult> {
  const email = normalizeLoginEmail(rawEmail)
  const genericMessage = "If this email is approved, a sign-in link has been sent."

  if (!email || !isEmailAllowedToLogin(email)) {
    return { success: true, message: genericMessage }
  }

  const user = await prisma.appUser.findUnique({ where: { email } })
  if (!user || !user.is_active) {
    return { success: true, message: genericMessage }
  }

  await prisma.authMagicLinkToken.updateMany({
    where: {
      app_user_id: user.id,
      used_at: null,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
    data: { revoked_at: new Date() },
  })

  const token = randomBytes(32).toString("base64url")
  const tokenHash = hashMagicLinkToken(token)
  const expiresAt = new Date(Date.now() + getMagicLinkTtlMinutes() * 60 * 1000)
  const magicLink = `${context.baseUrl}/api/auth/magic?token=${encodeURIComponent(token)}`

  await prisma.authMagicLinkToken.create({
    data: {
      app_user_id: user.id,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      request_ip: context.ipAddress ?? null,
      request_user_agent: context.userAgent ?? null,
    },
  })

  const delivery = await sendMagicLinkEmail({
    email,
    fullName: user.full_name,
    magicLink,
    expiresAt,
  })

  await prisma.authAccessEvent.create({
    data: {
      app_user_id: user.id,
      event_type: "magic_link_requested",
      event_status: delivery.delivered ? "success" : "failed",
      ip_address: context.ipAddress ?? null,
      user_agent: context.userAgent ?? null,
      metadata: {
        provider: delivery.provider,
        providerId: delivery.delivered ? delivery.id ?? null : null,
        error: delivery.delivered ? null : delivery.error,
        expiresAt: expiresAt.toISOString(),
      },
    },
  })

  if (!delivery.delivered) {
    return {
      success: false,
      message: "Magic-link email could not be sent. Check email provider configuration.",
    }
  }

  return {
    success: true,
    message: genericMessage,
    debugLink: delivery.provider === "debug" ? magicLink : undefined,
  }
}

async function sendMagicLinkEmail({
  email,
  fullName,
  magicLink,
  expiresAt,
}: {
  email: string
  fullName: string
  magicLink: string
  expiresAt: Date
}) {
  const expiryLabel = expiresAt.toLocaleString("en-AE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  })

  return sendTransactionalEmail({
    to: email,
    subject: "Your Legal OS sign-in link",
    text: [
      `Hi ${fullName},`,
      "",
      "Use this one-time link to sign in to LSC Legal OS:",
      magicLink,
      "",
      `The link expires at ${expiryLabel} GST and can be used once.`,
      "If you did not request this, ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#0f172a">
        <p>Hi ${escapeHtml(fullName)},</p>
        <p>Use this one-time link to sign in to LSC Legal OS.</p>
        <p>
          <a href="${magicLink}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 14px;border-radius:6px;text-decoration:none">
            Sign in to Legal OS
          </a>
        </p>
        <p style="font-size:13px;color:#475569">This link expires at ${escapeHtml(expiryLabel)} GST and can be used once.</p>
        <p style="font-size:13px;color:#475569">If you did not request this, ignore this email.</p>
      </div>
    `,
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
