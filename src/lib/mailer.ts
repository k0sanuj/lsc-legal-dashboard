/**
 * Mailgun transactional email sender.
 *
 * Magic-link login needs outbound email, and Mailgun is the only mail
 * infrastructure this project has. Keep this module small and total: it never
 * throws. Callers get { ok: false, error } and decide how to degrade.
 */

const MAILGUN_API_BASE = "https://api.mailgun.net/v3"
const SEND_TIMEOUT_MS = 8000
const MAX_ERROR_BODY_CHARS = 500

const REQUIRED_MAILER_ENV = [
  "MAILGUN_DOMAIN",
  "MAILGUN_API_KEY",
  "MAILGUN_SENDER",
]

export interface TransactionalEmailInput {
  to: string
  subject: string
  text: string
  html?: string
}

export interface TransactionalEmailResult {
  ok: boolean
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

export async function sendTransactionalEmail({
  to,
  subject,
  text,
  html,
}: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  const missing = getMailerMissingEnv()
  if (missing.length > 0) {
    return { ok: false, error: `Mailgun env vars not set: ${missing.join(", ")}` }
  }

  const domain = readEnv("MAILGUN_DOMAIN")
  const apiKey = readEnv("MAILGUN_API_KEY")
  const sender = readEnv("MAILGUN_SENDER")

  const body = new URLSearchParams({ from: sender, to, subject, text })
  if (html) body.set("html", html)

  try {
    const response = await fetch(`${MAILGUN_API_BASE}/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      // Vercel serverless requests are short-lived; never make a login form
      // wait on a slow mail API.
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, MAX_ERROR_BODY_CHARS)
      return { ok: false, error: `Mailgun HTTP ${response.status}: ${detail}` }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
