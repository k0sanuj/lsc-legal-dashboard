type SendEmailInput = {
  to: string
  subject: string
  text: string
  html: string
}

type SendEmailResult =
  | { delivered: true; provider: "resend" | "debug"; id?: string }
  | { delivered: false; provider: "resend"; error: string }

function getFromAddress(): string {
  return process.env.AUTH_EMAIL_FROM ?? "LSC Legal <no-reply@leaguesportsco.com>"
}

export async function sendTransactionalEmail({
  to,
  subject,
  text,
  html,
}: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      return {
        delivered: false,
        provider: "resend",
        error: "RESEND_API_KEY is required to send magic-link email in production.",
      }
    }

    console.info("[auth] Magic-link email debug delivery", { to, subject, text })
    return { delivered: true, provider: "debug" }
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to,
      subject,
      text,
      html,
    }),
  })

  const body = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: string }
    | null

  if (!response.ok) {
    return {
      delivered: false,
      provider: "resend",
      error: body?.message ?? body?.error ?? `Resend returned HTTP ${response.status}`,
    }
  }

  return { delivered: true, provider: "resend", id: body?.id }
}
