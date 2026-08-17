/**
 * Mailgun transactional email sender.
 *
 * Mailgun is the only mail infrastructure this project has, and two things
 * depend on it: magic-link login, and the signature requests OpenSign emails to
 * counterparties. Keep this module small and total: it never throws. Callers get
 * { ok: false, error } and decide how to degrade.
 *
 * Env:
 *   MAILGUN_DOMAIN               sending domain, ideally a subdomain such as
 *                                sign.leaguesports.co so app mail cannot damage
 *                                the reputation of the corporate domain
 *   MAILGUN_API_KEY              private API key
 *   MAILGUN_SENDER               From header, "Name <address@sending-domain>"
 *   MAILGUN_REGION               "us" (default) or "eu". EU accounts are served
 *                                from a different host and silently 401 against
 *                                the US one, which looks like a bad key.
 *   MAILGUN_REPLY_TO             optional Reply-To, usually a real mailbox a
 *                                counterparty can actually reach
 *   MAILGUN_WEBHOOK_SIGNING_KEY  used by the delivery-event webhook, not here
 */
import { createHmac, timingSafeEqual } from "node:crypto"

const SEND_TIMEOUT_MS = 8000
const MAX_ERROR_BODY_CHARS = 500
const REPLAY_WINDOW_SECONDS = 300

const REQUIRED_MAILER_ENV = ["MAILGUN_DOMAIN", "MAILGUN_API_KEY", "MAILGUN_SENDER"]

export interface TransactionalEmailInput {
  to: string
  subject: string
  text: string
  html?: string
  /** Mailgun tag, so login mail and contract mail can be filtered apart. */
  tag?: string
}

export interface TransactionalEmailResult {
  ok: boolean
  /** Mailgun's queued message id, which delivery events reference. */
  messageId?: string
  error?: string
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? ""
}

export function getMailerMissingEnv(): string[] {
  return REQUIRED_MAILER_ENV.filter((name) => !readEnv(name))
}

export function isMailerConfigured(): boolean {
  return getMailerMissingEnv().length === 0
}

/** US and EU Mailgun accounts live on different hosts and are not interchangeable. */
export function getMailgunApiHost(): string {
  return readEnv("MAILGUN_REGION").toLowerCase() === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net"
}

export function getMailgunDomain(): string {
  return readEnv("MAILGUN_DOMAIN")
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`api:${readEnv("MAILGUN_API_KEY")}`).toString("base64")}`
}

export async function sendTransactionalEmail({
  to,
  subject,
  text,
  html,
  tag,
}: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  const missing = getMailerMissingEnv()
  if (missing.length > 0) {
    return { ok: false, error: `Mailgun env vars not set: ${missing.join(", ")}` }
  }

  const body = new URLSearchParams({
    from: readEnv("MAILGUN_SENDER"),
    to,
    subject,
    text,
  })
  if (html) body.set("html", html)
  if (tag) body.set("o:tag", tag)

  const replyTo = readEnv("MAILGUN_REPLY_TO")
  if (replyTo) body.set("h:Reply-To", replyTo)

  try {
    const response = await fetch(
      `${getMailgunApiHost()}/v3/${encodeURIComponent(getMailgunDomain())}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        // Vercel serverless requests are short-lived; never make a login form
        // wait on a slow mail API.
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      }
    )

    const raw = await response.text()

    if (!response.ok) {
      const hint =
        response.status === 401
          ? " (check MAILGUN_API_KEY, and MAILGUN_REGION if this is an EU account)"
          : ""
      return {
        ok: false,
        error: `Mailgun HTTP ${response.status}${hint}: ${raw.slice(0, MAX_ERROR_BODY_CHARS)}`,
      }
    }

    let messageId: string | undefined
    try {
      const parsed = JSON.parse(raw) as { id?: unknown }
      if (typeof parsed.id === "string") messageId = parsed.id
    } catch {
      // A 200 with an unparseable body still means Mailgun accepted the message.
    }

    return { ok: true, messageId }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Reads a Mailgun domain's DNS state. Used by scripts/check-mail-setup.mjs so an
 * operator can see which SPF, DKIM and tracking records are still unverified
 * without opening the Mailgun dashboard.
 */
export async function fetchMailgunDomainStatus(): Promise<
  | { ok: true; state: string; records: Array<{ name: string; recordType: string; value: string; valid: string }> }
  | { ok: false; error: string }
> {
  const missing = ["MAILGUN_DOMAIN", "MAILGUN_API_KEY"].filter((n) => !readEnv(n))
  if (missing.length > 0) {
    return { ok: false, error: `Mailgun env vars not set: ${missing.join(", ")}` }
  }

  try {
    const response = await fetch(
      `${getMailgunApiHost()}/v4/domains/${encodeURIComponent(getMailgunDomain())}`,
      {
        headers: { Authorization: basicAuthHeader() },
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      }
    )

    const raw = await response.text()
    if (!response.ok) {
      return { ok: false, error: `Mailgun HTTP ${response.status}: ${raw.slice(0, MAX_ERROR_BODY_CHARS)}` }
    }

    const parsed = JSON.parse(raw) as {
      domain?: { state?: string }
      sending_dns_records?: Array<Record<string, string>>
      receiving_dns_records?: Array<Record<string, string>>
    }

    const records = [
      ...(parsed.sending_dns_records ?? []),
      ...(parsed.receiving_dns_records ?? []),
    ].map((record) => ({
      name: record.name ?? "",
      recordType: record.record_type ?? "",
      value: record.value ?? "",
      valid: record.valid ?? "unknown",
    }))

    return { ok: true, state: parsed.domain?.state ?? "unknown", records }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Verifies a Mailgun webhook signature.
 *
 * Mailgun signs `timestamp + token` with the webhook signing key, which is a
 * DIFFERENT secret from the API key. The timestamp is also checked so a captured
 * payload cannot be replayed indefinitely.
 */
export function verifyMailgunWebhookSignature(input: {
  timestamp: string
  token: string
  signature: string
}): { valid: boolean; reason?: string } {
  const signingKey = readEnv("MAILGUN_WEBHOOK_SIGNING_KEY")
  if (!signingKey) return { valid: false, reason: "MAILGUN_WEBHOOK_SIGNING_KEY is not set" }
  if (!input.timestamp || !input.token || !input.signature) {
    return { valid: false, reason: "incomplete signature block" }
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(input.timestamp))
  if (!Number.isFinite(age) || age > REPLAY_WINDOW_SECONDS) {
    return { valid: false, reason: "timestamp outside the replay window" }
  }

  const expected = createHmac("sha256", signingKey)
    .update(input.timestamp + input.token)
    .digest("hex")

  const expectedBuffer = Buffer.from(expected, "hex")
  const receivedBuffer = Buffer.from(input.signature.trim().toLowerCase(), "hex")
  if (expectedBuffer.length !== receivedBuffer.length) {
    return { valid: false, reason: "signature length mismatch" }
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
    ? { valid: true }
    : { valid: false, reason: "signature mismatch" }
}
