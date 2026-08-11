/**
 * Legal tracker channel notifier.
 *
 * Aditya Mishra is notified in the legal tracker channel whenever an agreement
 * is sent out for signature. The target channel platform is not fixed yet, so
 * this transport carries four drivers chosen by LEGAL_TRACKER_CHANNEL_PROVIDER
 * ("slack" | "google_chat" | "mailgun" | "none"). With no provider set we
 * auto-detect from the credentials that are present.
 *
 * Env:
 *   LEGAL_TRACKER_CHANNEL_PROVIDER  driver selector; unset means auto-detect
 *   LEGAL_TRACKER_SLACK_BOT_TOKEN   Slack bot token (xoxb-...), scope chat:write
 *   LEGAL_TRACKER_SLACK_CHANNEL     Slack channel id or #name for chat.postMessage
 *   LEGAL_TRACKER_WEBHOOK_URL       Slack incoming webhook, or the Google Chat webhook
 *   LEGAL_TRACKER_MENTION           opaque mention string used verbatim, e.g. a Slack
 *                                   member mention or a Google Chat "<users/ID>"
 *   LEGAL_TRACKER_EMAIL_TO          recipient for the mailgun driver
 *   MAILGUN_DOMAIN / MAILGUN_API_KEY / MAILGUN_SENDER   shared with OpenSign mail
 * No recipient identity is hardcoded here; see ops/legal-tracker-channel.md.
 *
 * Shape mirrors src/lib/finance-webhook.ts: `notifyLegalTracker` is pure
 * transport (no DB) and never throws, `emitLegalTrackerEvent` is the durable
 * wrapper that persists a CrossModuleEvent row BEFORE the post, stashes the
 * attempt result on that row afterwards, and mirrors the outcome onto the
 * LegalDocument row.
 *
 * NO RETRY EXISTS YET. Nothing consumes CrossModuleEvent rows with source
 * "legal_tracker": /api/cron/finance-resync only replays source "legal", and the
 * queue panel on /legal/ops-monitor filters source "legal" as well. A failed
 * notification is therefore durable and inspectable (the CrossModuleEvent row
 * plus LegalDocument.tracker_notify_status on the document), but it is never
 * retried automatically and never resent without an operator.
 */
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "./prisma"

export type LegalTrackerProvider = "slack" | "google_chat" | "mailgun" | "none"

export type LegalTrackerEventType = "agreement.sent" | "redline.sent"

export interface LegalTrackerMessageField {
  label: string
  value: string
}

export interface LegalTrackerMessage {
  title: string
  summary: string
  url?: string
  fields: LegalTrackerMessageField[]
  mention?: boolean
}

export interface LegalTrackerNotifyResult {
  ok: boolean
  provider: string
  error?: string
}

export interface LegalTrackerSetupStatus {
  configured: boolean
  provider: string
  missing: string[]
}

const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage"
const MAILGUN_API_BASE = "https://api.mailgun.net/v3"
const REQUEST_TIMEOUT_MS = 8000
const MAX_ERROR_CHARS = 500
const SLACK_HEADER_CHARS = 150
const SLACK_SECTION_CHARS = 2900
const SLACK_FIELD_CHARS = 1900
const SLACK_MAX_FIELDS = 10
const MAILGUN_ENV = ["MAILGUN_DOMAIN", "MAILGUN_API_KEY", "MAILGUN_SENDER", "LEGAL_TRACKER_EMAIL_TO"]

function env(name: string): string {
  return process.env[name]?.trim() ?? ""
}

function isLegalTrackerProvider(value: string): value is LegalTrackerProvider {
  return value === "slack" || value === "google_chat" || value === "mailgun" || value === "none"
}

/**
 * An explicit LEGAL_TRACKER_CHANNEL_PROVIDER always wins; an unrecognized value
 * fails closed to "none" instead of guessing. Only when nothing is set do we
 * infer the driver from the credentials that happen to be present.
 */
export function resolveLegalTrackerProvider(): LegalTrackerProvider {
  const configured = env("LEGAL_TRACKER_CHANNEL_PROVIDER").toLowerCase()
  if (configured) return isLegalTrackerProvider(configured) ? configured : "none"

  if (env("LEGAL_TRACKER_SLACK_BOT_TOKEN") || env("LEGAL_TRACKER_WEBHOOK_URL")) return "slack"
  if (env("MAILGUN_API_KEY") && env("MAILGUN_DOMAIN") && env("LEGAL_TRACKER_EMAIL_TO")) return "mailgun"
  return "none"
}

function slackMissingEnv(): string[] {
  const token = env("LEGAL_TRACKER_SLACK_BOT_TOKEN")
  if (token && env("LEGAL_TRACKER_SLACK_CHANNEL")) return []
  if (env("LEGAL_TRACKER_WEBHOOK_URL")) return []
  if (token) return ["LEGAL_TRACKER_SLACK_CHANNEL"]
  return ["LEGAL_TRACKER_SLACK_BOT_TOKEN", "LEGAL_TRACKER_SLACK_CHANNEL"]
}

function mailgunMissingEnv(): string[] {
  return MAILGUN_ENV.filter((name) => !env(name))
}

function providerMissingEnv(provider: LegalTrackerProvider): string[] {
  if (provider === "slack") return slackMissingEnv()
  if (provider === "google_chat") return env("LEGAL_TRACKER_WEBHOOK_URL") ? [] : ["LEGAL_TRACKER_WEBHOOK_URL"]
  if (provider === "mailgun") return mailgunMissingEnv()
  return ["LEGAL_TRACKER_CHANNEL_PROVIDER"]
}

export function getLegalTrackerSetupStatus(): LegalTrackerSetupStatus {
  const provider = resolveLegalTrackerProvider()
  const missing = providerMissingEnv(provider)

  return {
    configured: provider !== "none" && missing.length === 0,
    provider,
    missing,
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

function httpError(status: number, body: string): string {
  return `HTTP ${status}: ${body.slice(0, MAX_ERROR_CHARS)}`
}

/** The mention string is opaque and goes out verbatim. */
function mentionPrefix(message: LegalTrackerMessage): string {
  const mention = env("LEGAL_TRACKER_MENTION")
  return message.mention && mention ? `${mention} ` : ""
}

function renderPlainText(message: LegalTrackerMessage): string {
  const lines = [`${mentionPrefix(message)}${message.summary}`, ""]
  for (const field of message.fields) {
    lines.push(`${field.label}: ${field.value}`)
  }
  if (message.url) {
    lines.push("", message.url)
  }
  return lines.join("\n")
}

function buildSlackBlocks(message: LegalTrackerMessage): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: truncate(message.title, SLACK_HEADER_CHARS) },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(`${mentionPrefix(message)}${message.summary}`, SLACK_SECTION_CHARS),
      },
    },
  ]

  if (message.fields.length > 0) {
    blocks.push({
      type: "section",
      fields: message.fields.slice(0, SLACK_MAX_FIELDS).map((field) => ({
        type: "mrkdwn",
        text: truncate(`*${field.label}*\n${field.value}`, SLACK_FIELD_CHARS),
      })),
    })
  }

  if (message.url) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `<${message.url}|Open the document in LSC Legal>` },
    })
  }

  return blocks
}

/**
 * chat.postMessage answers HTTP 200 with `{ ok: false, error }` on failure, so
 * the status code is not the outcome. Incoming webhooks answer with the plain
 * string "ok" instead of JSON, which is why an unparseable body is not an error.
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

async function postSlackJson(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<LegalTrackerNotifyResult> {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    // Vercel serverless cap is 10-60s; keep our wait short so a slow channel
    // never delays the signature send that triggered it.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const body = await res.text()
  if (!res.ok) return { ok: false, provider: "slack", error: httpError(res.status, body) }

  const apiError = readSlackApiError(body)
  if (apiError) return { ok: false, provider: "slack", error: `Slack rejected the message: ${apiError}` }

  return { ok: true, provider: "slack" }
}

async function notifyViaSlack(message: LegalTrackerMessage): Promise<LegalTrackerNotifyResult> {
  const token = env("LEGAL_TRACKER_SLACK_BOT_TOKEN")
  const channel = env("LEGAL_TRACKER_SLACK_CHANNEL")
  const webhookUrl = env("LEGAL_TRACKER_WEBHOOK_URL")
  const blocks = buildSlackBlocks(message)
  const text = truncate(`${mentionPrefix(message)}${message.title}`, SLACK_SECTION_CHARS)

  if (token && channel) {
    return postSlackJson(
      SLACK_POST_MESSAGE_URL,
      {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      { channel, text, blocks }
    )
  }

  if (webhookUrl) {
    return postSlackJson(webhookUrl, { "Content-Type": "application/json" }, { text, blocks })
  }

  return {
    ok: false,
    provider: "slack",
    error: "Slack legal tracker env vars not set",
  }
}

function buildGoogleChatPayload(message: LegalTrackerMessage): Record<string, unknown> {
  const widgets: Record<string, unknown>[] = message.fields.map((field) => ({
    decoratedText: { topLabel: field.label, text: field.value, wrapText: true },
  }))

  if (message.url) {
    widgets.push({
      buttonList: {
        buttons: [{ text: "Open in LSC Legal", onClick: { openLink: { url: message.url } } }],
      },
    })
  }

  return {
    // Google Chat only turns a mention into a notification when it appears in
    // the plain text of the message, not inside the card.
    text: `${mentionPrefix(message)}${message.summary}`,
    cardsV2: [
      {
        cardId: "legal-tracker-notification",
        card: {
          header: { title: truncate(message.title, SLACK_HEADER_CHARS), subtitle: "LSC Legal tracker" },
          sections: [{ widgets }],
        },
      },
    ],
  }
}

async function notifyViaGoogleChat(message: LegalTrackerMessage): Promise<LegalTrackerNotifyResult> {
  const webhookUrl = env("LEGAL_TRACKER_WEBHOOK_URL")
  if (!webhookUrl) {
    return { ok: false, provider: "google_chat", error: "LEGAL_TRACKER_WEBHOOK_URL is not set" }
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(buildGoogleChatPayload(message)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    return { ok: false, provider: "google_chat", error: httpError(res.status, await res.text()) }
  }
  return { ok: true, provider: "google_chat" }
}

/** Same Mailgun account OpenSign uses for its signature emails. */
async function notifyViaMailgun(message: LegalTrackerMessage): Promise<LegalTrackerNotifyResult> {
  const missing = mailgunMissingEnv()
  if (missing.length > 0) {
    return {
      ok: false,
      provider: "mailgun",
      error: `Mailgun legal tracker env vars not set: ${missing.join(", ")}`,
    }
  }

  const form = new URLSearchParams({
    from: env("MAILGUN_SENDER"),
    to: env("LEGAL_TRACKER_EMAIL_TO"),
    subject: message.title,
    text: renderPlainText(message),
  })

  const res = await fetch(`${MAILGUN_API_BASE}/${encodeURIComponent(env("MAILGUN_DOMAIN"))}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`api:${env("MAILGUN_API_KEY")}`).toString("base64")}`,
    },
    body: form.toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    return { ok: false, provider: "mailgun", error: httpError(res.status, await res.text()) }
  }
  return { ok: true, provider: "mailgun" }
}

/**
 * Pure transport. One attempt, no DB writes, never throws: every failure comes
 * back as { ok: false, provider, error }.
 */
export async function notifyLegalTracker(message: LegalTrackerMessage): Promise<LegalTrackerNotifyResult> {
  const provider = resolveLegalTrackerProvider()

  try {
    switch (provider) {
      case "slack":
        return await notifyViaSlack(message)
      case "google_chat":
        return await notifyViaGoogleChat(message)
      case "mailgun":
        return await notifyViaMailgun(message)
      default:
        return {
          ok: false,
          provider: "none",
          error: "Legal tracker channel is not configured. Set LEGAL_TRACKER_CHANNEL_PROVIDER and its env vars.",
        }
    }
  } catch (err) {
    return {
      ok: false,
      provider,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function messageToJson(message: LegalTrackerMessage): Prisma.InputJsonObject {
  return {
    title: message.title,
    summary: message.summary,
    url: message.url ?? null,
    fields: message.fields.map((field) => ({ label: field.label, value: field.value })),
    mention: message.mention ?? false,
  }
}

async function mirrorOntoLegalDocument(
  documentId: string,
  result: LegalTrackerNotifyResult
): Promise<void> {
  await prisma.legalDocument.update({
    where: { id: documentId },
    data: {
      last_tracker_notified_at: new Date(),
      tracker_notify_status: result.ok ? "sent" : "failed",
      last_tracker_notify_error: result.ok ? null : (result.error ?? "Unknown error"),
    },
  })
}

/**
 * Persist to CrossModuleEvent FIRST (durable record), then attempt the post,
 * then write the attempt outcome back onto the queue row and onto the
 * originating LegalDocument. There is no retry consumer for source
 * "legal_tracker" yet, so processed=false means "seen, never delivered".
 */
export async function emitLegalTrackerEvent(
  eventType: LegalTrackerEventType,
  message: LegalTrackerMessage,
  ref: { entityType: string; entityId: string }
): Promise<{ ok: boolean; eventId: string; error?: string }> {
  const payload = messageToJson(message)

  const queueRow = await prisma.crossModuleEvent.create({
    data: {
      source: "legal_tracker",
      event_type: eventType,
      entity_type: ref.entityType,
      entity_id: ref.entityId,
      payload,
      processed: false,
    },
  })

  const result = await notifyLegalTracker(message)

  await prisma.crossModuleEvent.update({
    where: { id: queueRow.id },
    data: {
      processed: result.ok,
      payload: {
        ...payload,
        _last_attempt: { count: 1, provider: result.provider, error: result.error ?? null },
      },
    },
  })

  if (ref.entityType === "LegalDocument") {
    await mirrorOntoLegalDocument(ref.entityId, result)
  }

  return { ok: result.ok, eventId: queueRow.id, error: result.error }
}
