const DEFAULT_ALLOWED_EMAILS = [
  "anuj@futureofsports.io",
  "ak@futureofsports.io",
  "adi@futureofsports.io",
]

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function getAllowedLoginEmails(): string[] {
  const configured = process.env.AUTH_ALLOWED_EMAILS
  const source = configured?.trim() ? configured.split(",") : DEFAULT_ALLOWED_EMAILS

  return Array.from(
    new Set(
      source
        .map((email) => normalizeLoginEmail(email))
        .filter(Boolean)
    )
  )
}

export function isEmailAllowedToLogin(email: string): boolean {
  return getAllowedLoginEmails().includes(normalizeLoginEmail(email))
}
