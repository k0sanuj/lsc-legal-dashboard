/**
 * Slack control surface: verification, identity, and outbound API calls.
 *
 * This module owns everything the /api/slack/* routes need to trust and answer
 * an inbound Slack request. It is deliberately separate from the legal tracker
 * notifier (src/lib/legal-tracker.ts): that bot only posts, this surface also
 * receives, so the two carry distinct token env vars and can diverge in scope.
 *
 * Env:
 *   SLACK_SIGNING_SECRET   app Signing Secret, verifies every inbound request
 *   SLACK_BOT_TOKEN        bot token (xoxb-...), scopes commands, chat:write, users:read + users:read.email
 *
 * Identity is resolved through Slack users.info, then matched to an active
 * AppUser. Central document entitlements govern each command. An email mapping
 * in environment configuration is not evidence of the caller's identity.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { prisma } from "./prisma"
import type { UserRole } from "@/generated/prisma/client"
import type { SessionPayload } from "@/lib/session"

const SLACK_API_BASE = "https://slack.com/api"
const REQUEST_TIMEOUT_MS = 8000
const REPLAY_WINDOW_SECONDS = 300
const MAX_ERROR_CHARS = 500

function env(name: string): string {
  return process.env[name]?.trim() ?? ""
}

/**
 * Verifies Slack's v0 request signature, modeled on
 * verifyMailgunWebhookSignature in src/lib/mailer.ts.
 *
 * The basestring is "v0:" + timestamp + ":" + RAW body, so callers must pass
 * the unmodified request body text, never a re-serialized form. Timestamps
 * outside a 300 second window are rejected to stop replays.
 */
export function verifySlackSignature(input: {
  timestamp: string
  signature: string
  rawBody: string
}): { valid: boolean; reason?: string } {
  const signingSecret = env("SLACK_SIGNING_SECRET")
  if (!signingSecret) return { valid: false, reason: "SLACK_SIGNING_SECRET is not set" }
  if (!input.timestamp || !input.signature) {
    return { valid: false, reason: "incomplete signature block" }
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(input.timestamp))
  if (!Number.isFinite(age) || age > REPLAY_WINDOW_SECONDS) {
    return { valid: false, reason: "timestamp outside the replay window" }
  }

  const digest = createHmac("sha256", signingSecret)
    .update(`v0:${input.timestamp}:${input.rawBody}`)
    .digest("hex")

  const expectedBuffer = Buffer.from(`v0=${digest}`)
  const receivedBuffer = Buffer.from(input.signature.trim())
  if (expectedBuffer.length !== receivedBuffer.length) {
    return { valid: false, reason: "signature length mismatch" }
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
    ? { valid: true }
    : { valid: false, reason: "signature mismatch" }
}

/** The resolved dashboard identity behind an authorised Slack caller. */
export interface SlackActor {
  userId: string
  email: string
  display: string
  role: UserRole
}

/** Resolve Slack's current verified profile email, never an operator-authored impersonation map. */
export async function resolveSlackActor(slackUserId: string): Promise<SlackActor | null> {
  if (!/^U[A-Z0-9]+$/.test(slackUserId)) return null
  const token = env("SLACK_BOT_TOKEN")
  if (!token) return null
  try {
    const response = await fetch(`${SLACK_API_BASE}/users.info?user=${encodeURIComponent(slackUserId)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    const result = await response.json() as { ok?: boolean; user?: { id?: string; deleted?: boolean; is_bot?: boolean; profile?: { email?: string } } }
    const member = result.user
    if (result.ok !== true || member?.id !== slackUserId || member.deleted || member.is_bot || !member.profile?.email) return null
    const verifiedEmail = member.profile.email.trim().toLowerCase()
    let email = verifiedEmail
    const links = JSON.parse(env("SLACK_LEGAL_IDENTITY_LINKS") || "{}") as Record<string, { verifiedEmail?: unknown; appEmail?: unknown }>
    const link = links[slackUserId]
    if (link) {
      if (link.verifiedEmail !== verifiedEmail || typeof link.appEmail !== "string") return null
      email = link.appEmail.trim().toLowerCase()
    }
    const user = await prisma.appUser.findUnique({ where: { email }, select: { id: true, email: true, full_name: true, is_active: true, role: true } })
    if (!user?.is_active) return null
    return { userId: user.id, email: user.email, display: user.full_name, role: user.role }
  } catch {
    return null
  }
}

export function slackSession(actor: SlackActor): SessionPayload {
  return { userId: actor.userId, email: actor.email, fullName: actor.display, role: actor.role, exp: Date.now() + 60_000 }
}

export interface SlackApiResult {
  ok: boolean
  error?: string
}

/**
 * Slack answers HTTP 200 with { ok: false, error } on failure, so the status
 * code is never the outcome; the body must be parsed. Mirrors
 * readSlackApiError in src/lib/legal-tracker.ts.
 */
function readSlackApiError(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { ok?: unknown; error?: unknown }
    if (parsed && typeof parsed === "object" && parsed.ok === false) {
      return typeof parsed.error === "string" && parsed.error ? parsed.error : "unknown_error"
    }
    return null
  } catch {
    return null
  }
}

/** Calls one Slack Web API method with the bot token. Never throws. */
async function callSlackApi(
  method: string,
  payload: Record<string, unknown>,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<SlackApiResult> {
  const token = env("SLACK_BOT_TOKEN")
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN is not set" }

  try {
    const res = await fetch(`${SLACK_API_BASE}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })

    const body = await res.text()
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, MAX_ERROR_CHARS)}` }

    const apiError = readSlackApiError(body)
    if (apiError) return { ok: false, error: `Slack rejected ${method}: ${apiError}` }

    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : `${method} failed` }
  }
}

/** Posts a message visible to the whole channel. */
export async function postSlackMessage(
  channel: string,
  blocks: Record<string, unknown>[],
  text: string
): Promise<SlackApiResult> {
  return callSlackApi("chat.postMessage", { channel, text, blocks })
}

/** Posts a message only the named user can see, in the given channel. */
export async function postSlackEphemeral(
  channel: string,
  user: string,
  blocks: Record<string, unknown>[],
  text: string
): Promise<SlackApiResult> {
  return callSlackApi("chat.postEphemeral", { channel, user, text, blocks })
}

/**
 * Opens a modal against a trigger_id. The trigger dies three seconds after
 * Slack mints it, so callers must invoke this before any slow work.
 */
export async function openSlackModal(
  triggerId: string,
  view: Record<string, unknown>
): Promise<SlackApiResult> {
  // The slash-command handler awaits this before acking, and Slack's slash
  // deadline is 3 seconds. A tight timeout means the caller either gets the
  // modal or a retry hint inside the budget, never Slack's generic timeout
  // error with a second live modal behind it.
  return callSlackApi("views.open", { trigger_id: triggerId, view }, 2500)
}
