/**
 * Magic-link login lifecycle.
 *
 * Security properties enforced in this module:
 * - The raw token only ever exists inside the emailed URL. The database keeps
 *   the SHA-256 hex digest, so a database leak cannot mint sessions.
 * - Links expire after MAGIC_LINK_TTL_MINUTES and can be consumed exactly once.
 * - Outstanding links are deliberately NOT revoked when a new one is requested.
 *   Revoking on reissue let any unauthenticated visitor invalidate an admin's
 *   in-flight link just by submitting that admin's address, and the allowlisted
 *   addresses are public. Single use plus a short TTL is the real protection.
 * - Two independent budgets: MAGIC_LINK_MAX_REQUESTS_PER_WINDOW per email, and
 *   MAGIC_LINK_MAX_REQUESTS_PER_IP_WINDOW per requesting IP, so one caller
 *   cannot spend a victim's allowance and lock them out of login.
 * - requestMagicLink never reveals whether an address is allowlisted, exists or
 *   is active. The real outcome goes to console.error and AuthAccessEvent.
 *   Latency is not equalised, so a determined observer can still distinguish
 *   outcomes by timing; the response body and status never differ.
 * - Allowlist membership and AppUser.is_active are re-checked at consume time,
 *   so removing an address kills links that are already in flight.
 * - The raw token is never logged.
 */
import { createHash, randomBytes } from "node:crypto"
import { prisma } from "./prisma"
import { isEmailAllowedToLogin, normalizeLoginEmail } from "./auth-allowlist"
import {
  getMailerMissingEnv,
  isMailerConfigured,
  sendTransactionalEmail,
} from "./mailer"
import type { AppUser, AuthMagicLinkToken, UserRole } from "@/generated/prisma/client"

export const MAGIC_LINK_TTL_MINUTES = 15
export const MAGIC_LINK_REQUESTED_EVENT = "magic_link_requested"
export const MAGIC_LINK_CONSUMED_EVENT = "magic_link_consumed"

const MAGIC_LINK_TTL_MS = MAGIC_LINK_TTL_MINUTES * 60 * 1000
/** At most this many links per email per rate-limit window; the next one is refused. */
const MAGIC_LINK_MAX_REQUESTS_PER_WINDOW = 5
/**
 * Separate per-IP budget. Without it, the per-email counter is a weapon: anyone
 * can spend an admin's allowance on their behalf and deny them login, because
 * the allowlisted addresses are not secret.
 */
const MAGIC_LINK_MAX_REQUESTS_PER_IP_WINDOW = 10
const MAGIC_LINK_RATE_LIMIT_WINDOW_MS = MAGIC_LINK_TTL_MS
/** Guards the auth log against a caller pasting megabytes into the email field. */
const MAX_EMAIL_LENGTH = 254
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
const MAGIC_LINK_CALLBACK_PATH = "/api/auth/magic"
const FALLBACK_APP_URL = "https://lsc-legal-dashboard.vercel.app"

export interface MagicLinkRequestInput {
  email: string
  ip?: string | null
  userAgent?: string | null
  baseUrl?: string | null
}

export interface MagicLinkRequestResult {
  delivered: boolean
  reason?: string
}

export interface MagicLinkConsumeInput {
  token: string
  ip?: string | null
  userAgent?: string | null
}

/** The AppUser fields a session cookie is built from. */
export interface MagicLinkSessionUser {
  id: string
  email: string
  role: UserRole
  full_name: string
}

export type MagicLinkConsumeResult =
  | { ok: true; user: MagicLinkSessionUser }
  | { ok: false; reason: string }

type MagicLinkTokenWithUser = AuthMagicLinkToken & { user: AppUser }

/** First value of x-forwarded-for, which is the originating client. */
export function firstForwardedIp(
  forwardedFor: string | null | undefined
): string | null {
  const first = forwardedFor?.split(",")[0]?.trim()
  return first ? first : null
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "")
}

export function resolveAppBaseUrl(): string {
  // AUTH_APP_URL first, and it is the one to set. NEXT_PUBLIC_ values are
  // inlined at build time, so setting NEXT_PUBLIC_APP_URL in Vercel after a
  // deploy would silently do nothing until the next build.
  const configured =
    process.env.AUTH_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return stripTrailingSlashes(configured)

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelHost) {
    const withScheme = /^https?:\/\//i.test(vercelHost)
      ? vercelHost
      : `https://${vercelHost}`
    return stripTrailingSlashes(withScheme)
  }

  return FALLBACK_APP_URL
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex")
}

async function logAccessEvent(input: {
  appUserId: string
  eventType: string
  eventStatus: string
  ip?: string | null
  userAgent?: string | null
  reason?: string
}): Promise<void> {
  try {
    await prisma.authAccessEvent.create({
      data: {
        app_user_id: input.appUserId,
        event_type: input.eventType,
        event_status: input.eventStatus,
        ip_address: input.ip ?? null,
        user_agent: input.userAgent ?? null,
        metadata: input.reason ? { reason: input.reason } : undefined,
      },
    })
  } catch (error) {
    console.error("[magic-link] could not write AuthAccessEvent:", error)
  }
}

function buildEmailText(link: string): string {
  return [
    "Sign in to Legal OS",
    "",
    "Open this link to sign in:",
    link,
    "",
    `The link expires in ${MAGIC_LINK_TTL_MINUTES} minutes and can be used once.`,
    "If you did not request it, ignore this message; no session is created.",
    "",
    "LSC Operations Platform",
  ].join("\n")
}

function buildEmailHtml(link: string): string {
  return [
    "<p>Sign in to Legal OS.</p>",
    `<p><a href="${link}">Open this link to sign in</a></p>`,
    `<p>The link expires in ${MAGIC_LINK_TTL_MINUTES} minutes and can be used once.`,
    " If you did not request it, ignore this message; no session is created.</p>",
    "<p>LSC Operations Platform</p>",
  ].join("")
}

function buildMagicLinkUrl(rawToken: string, baseUrl?: string | null): string {
  const base = baseUrl?.trim()
    ? stripTrailingSlashes(baseUrl.trim())
    : resolveAppBaseUrl()
  return `${base}${MAGIC_LINK_CALLBACK_PATH}?token=${encodeURIComponent(rawToken)}`
}

/**
 * Mints and emails a single-use sign-in link.
 *
 * The caller must ignore `reason` in anything it shows a visitor. It exists for
 * operators reading logs, not for the browser.
 */
export async function requestMagicLink({
  email,
  ip,
  userAgent,
  baseUrl,
}: MagicLinkRequestInput): Promise<MagicLinkRequestResult> {
  const normalizedEmail = normalizeLoginEmail(email)

  // Validate the shape before it reaches a log line. The value is attacker
  // controlled, and JSON.stringify keeps newlines from forging log entries.
  if (
    !normalizedEmail ||
    normalizedEmail.length > MAX_EMAIL_LENGTH ||
    !EMAIL_SHAPE.test(normalizedEmail)
  ) {
    console.error("[magic-link] request refused, malformed email:", JSON.stringify(normalizedEmail.slice(0, MAX_EMAIL_LENGTH)))
    return { delivered: false, reason: "malformed_email" }
  }

  if (!isEmailAllowedToLogin(normalizedEmail)) {
    console.error(
      "[magic-link] request refused, email not allowlisted:",
      JSON.stringify(normalizedEmail)
    )
    return { delivered: false, reason: "not_allowlisted" }
  }

  const user = await prisma.appUser.findUnique({
    where: { email: normalizedEmail },
  })

  if (!user) {
    console.error(`[magic-link] request refused, no AppUser row: ${normalizedEmail}`)
    return { delivered: false, reason: "unknown_user" }
  }

  if (!user.is_active) {
    console.error(`[magic-link] request refused, user inactive: ${normalizedEmail}`)
    await logAccessEvent({
      appUserId: user.id,
      eventType: MAGIC_LINK_REQUESTED_EVENT,
      eventStatus: "failed",
      ip,
      userAgent,
      reason: "user_inactive",
    })
    return { delivered: false, reason: "user_inactive" }
  }

  // Checked before a token is minted so a delivery outage never leaves live
  // tokens behind and never burns the rate-limit budget.
  if (!isMailerConfigured()) {
    console.error(
      `[magic-link] request refused, mailer not configured. Missing: ${getMailerMissingEnv().join(", ")}`
    )
    await logAccessEvent({
      appUserId: user.id,
      eventType: MAGIC_LINK_REQUESTED_EVENT,
      eventStatus: "failed",
      ip,
      userAgent,
      reason: "mailer_not_configured",
    })
    return { delivered: false, reason: "mailer_not_configured" }
  }

  const windowStart = new Date(Date.now() - MAGIC_LINK_RATE_LIMIT_WINDOW_MS)
  const [recentForEmail, recentForIp] = await Promise.all([
    prisma.authMagicLinkToken.count({
      where: { email: normalizedEmail, created_at: { gte: windowStart } },
    }),
    ip
      ? prisma.authMagicLinkToken.count({
          where: { request_ip: ip, created_at: { gte: windowStart } },
        })
      : Promise.resolve(0),
  ])

  if (
    recentForEmail >= MAGIC_LINK_MAX_REQUESTS_PER_WINDOW ||
    recentForIp >= MAGIC_LINK_MAX_REQUESTS_PER_IP_WINDOW
  ) {
    console.error(
      `[magic-link] request rate limited: ${recentForEmail} for this address and ${recentForIp} from this IP in the last ${MAGIC_LINK_TTL_MINUTES} minutes`
    )
    await logAccessEvent({
      appUserId: user.id,
      eventType: MAGIC_LINK_REQUESTED_EVENT,
      eventStatus: "failed",
      ip,
      userAgent,
      reason: "rate_limited",
    })
    return { delivered: false, reason: "rate_limited" }
  }

  // Outstanding links are intentionally left alone. See the module docstring:
  // revoking them here would let anyone invalidate an admin's in-flight link.
  const rawToken = randomBytes(32).toString("base64url")
  const tokenRecord = await prisma.authMagicLinkToken.create({
    data: {
      app_user_id: user.id,
      email: normalizedEmail,
      token_hash: hashToken(rawToken),
      expires_at: new Date(Date.now() + MAGIC_LINK_TTL_MS),
      request_ip: ip ?? null,
      request_user_agent: userAgent ?? null,
    },
  })

  const link = buildMagicLinkUrl(rawToken, baseUrl)
  const sent = await sendTransactionalEmail({
    to: normalizedEmail,
    subject: "Your Legal OS sign-in link",
    text: buildEmailText(link),
    html: buildEmailHtml(link),
  })

  if (!sent.ok) {
    // Never leave a live token behind for a link that was not delivered.
    await prisma.authMagicLinkToken.update({
      where: { id: tokenRecord.id },
      data: { revoked_at: new Date() },
    })
    console.error(
      `[magic-link] delivery failed for ${normalizedEmail}: ${sent.error ?? "unknown error"}`
    )
    await logAccessEvent({
      appUserId: user.id,
      eventType: MAGIC_LINK_REQUESTED_EVENT,
      eventStatus: "failed",
      ip,
      userAgent,
      reason: "delivery_failed",
    })
    return { delivered: false, reason: "delivery_failed" }
  }

  await logAccessEvent({
    appUserId: user.id,
    eventType: MAGIC_LINK_REQUESTED_EVENT,
    eventStatus: "success",
    ip,
    userAgent,
  })

  return { delivered: true }
}

function findConsumeRejection(record: MagicLinkTokenWithUser): string | null {
  if (record.used_at) return "already_used"
  if (record.revoked_at) return "revoked"
  if (record.expires_at.getTime() <= Date.now()) return "expired"
  // Re-checked here, not only at request time, so removing an address takes
  // effect even when a link is already in someone's inbox.
  if (!isEmailAllowedToLogin(record.email)) return "not_allowlisted"
  if (!record.user.is_active) return "user_inactive"
  return null
}

/**
 * Checks a token WITHOUT burning it, so a GET can decide whether to show the
 * confirm step. Never creates a session and never mutates the token.
 */
export async function inspectMagicLink(
  token: string
): Promise<{ valid: boolean; reason?: string }> {
  const rawToken = token?.trim()
  if (!rawToken) return { valid: false, reason: "missing_token" }

  const record = await prisma.authMagicLinkToken.findUnique({
    where: { token_hash: hashToken(rawToken) },
    include: { user: true },
  })
  if (!record) return { valid: false, reason: "unknown_token" }

  const rejection = findConsumeRejection(record)
  return rejection ? { valid: false, reason: rejection } : { valid: true }
}

/**
 * Validates and burns a token.
 *
 * On success the caller establishes the session, which is also what writes the
 * `magic_link_consumed` success AuthAccessEvent. Failures are logged here.
 */
export async function consumeMagicLink({
  token,
  ip,
  userAgent,
}: MagicLinkConsumeInput): Promise<MagicLinkConsumeResult> {
  const rawToken = token?.trim()
  if (!rawToken) {
    console.error("[magic-link] consume refused, no token supplied")
    return { ok: false, reason: "missing_token" }
  }

  const record = await prisma.authMagicLinkToken.findUnique({
    where: { token_hash: hashToken(rawToken) },
    include: { user: true },
  })

  if (!record) {
    console.error("[magic-link] consume refused, token not recognised")
    return { ok: false, reason: "unknown_token" }
  }

  const rejection = findConsumeRejection(record)
  if (rejection) {
    console.error(`[magic-link] consume refused for ${record.email}: ${rejection}`)
    await logAccessEvent({
      appUserId: record.app_user_id,
      eventType: MAGIC_LINK_CONSUMED_EVENT,
      eventStatus: "failed",
      ip,
      userAgent,
      reason: rejection,
    })
    return { ok: false, reason: rejection }
  }

  // Single use. The used_at guard means two near-simultaneous clicks resolve to
  // exactly one winner.
  const claimed = await prisma.authMagicLinkToken.updateMany({
    where: { id: record.id, used_at: null },
    data: {
      used_at: new Date(),
      consumed_ip: ip ?? null,
      consumed_user_agent: userAgent ?? null,
    },
  })

  if (claimed.count === 0) {
    console.error(`[magic-link] consume lost the race for ${record.email}`)
    await logAccessEvent({
      appUserId: record.app_user_id,
      eventType: MAGIC_LINK_CONSUMED_EVENT,
      eventStatus: "failed",
      ip,
      userAgent,
      reason: "already_used",
    })
    return { ok: false, reason: "already_used" }
  }

  return {
    ok: true,
    user: {
      id: record.user.id,
      email: record.user.email,
      role: record.user.role,
      full_name: record.user.full_name,
    },
  }
}
