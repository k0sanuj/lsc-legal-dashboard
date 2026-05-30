import { createHash, createHmac, timingSafeEqual } from "node:crypto"

export interface OpenSignSigner {
  name: string
  email: string
  widgets?: unknown[]
}

export interface OpenSignCreateDocumentInput {
  title: string
  note: string
  description?: string
  fileName: string
  fileBase64: string
  signers: OpenSignSigner[]
  metadata?: Record<string, string>
  webhookUrl?: string
}

export interface OpenSignCreateDocumentResult {
  providerDocumentId: string | null
  raw: unknown
  signingLinks: Record<string, string>
}

export interface OpenSignSetupStatus {
  configured: boolean
  missing: string[]
  publicUrl: string | null
  webhookUrl: string | null
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function openSignApiUrl(path: string): string {
  const baseUrl = requireEnv("OPENSIGN_BASE_URL").replace(/\/+$/, "")
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`
}

function getOpenSignApiToken(): string {
  return requireEnv("OPENSIGN_API_TOKEN")
}

export function getOpenSignPublicUrl(): string | null {
  return process.env.OPENSIGN_PUBLIC_URL ?? process.env.OPENSIGN_BASE_URL ?? null
}

export function getOpenSignWebhookUrl(): string | null {
  return process.env.OPENSIGN_WEBHOOK_URL ?? null
}

export function getOpenSignSetupStatus(): OpenSignSetupStatus {
  const required = [
    "OPENSIGN_BASE_URL",
    "OPENSIGN_API_TOKEN",
    "OPENSIGN_WEBHOOK_SECRET",
    "OPENSIGN_WEBHOOK_URL",
  ]
  const missing = required.filter((name) => !process.env[name])

  return {
    configured: missing.length === 0,
    missing,
    publicUrl: getOpenSignPublicUrl(),
    webhookUrl: getOpenSignWebhookUrl(),
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function findProviderDocumentId(value: unknown): string | null {
  const record = asRecord(value)
  const direct =
    asString(record.objectId) ??
    asString(record.documentId) ??
    asString(record.id) ??
    asString(record._id)
  if (direct) return direct
  return record.data ? findProviderDocumentId(record.data) : null
}

function extractSigningLinks(value: unknown): Record<string, string> {
  const record = asRecord(value)
  const direct = record.signingLinks ?? record.signing_links
  const links: Record<string, string> = {}

  if (Array.isArray(direct)) {
    for (const item of direct) {
      const linkRecord = asRecord(item)
      const email = asString(linkRecord.email) ?? asString(linkRecord.signerEmail)
      const url = asString(linkRecord.url) ?? asString(linkRecord.link) ?? asString(linkRecord.signingUrl)
      if (email && url) links[email.toLowerCase()] = url
    }
  } else {
    const linkRecord = asRecord(direct)
    for (const [email, url] of Object.entries(linkRecord)) {
      if (typeof url === "string") links[email.toLowerCase()] = url
    }
  }

  if (Object.keys(links).length === 0 && record.data) {
    return extractSigningLinks(record.data)
  }

  return links
}

export async function createOpenSignDocument(
  input: OpenSignCreateDocumentInput
): Promise<OpenSignCreateDocumentResult> {
  const payload = {
    name: input.title,
    title: input.title,
    note: input.note,
    description: input.description ?? "",
    file: input.fileBase64,
    fileName: input.fileName,
    signers: input.signers,
    sendMail: true,
    metadata: input.metadata ?? {},
    webhook: input.webhookUrl,
    webhookUrl: input.webhookUrl,
  }

  const response = await fetch(openSignApiUrl("/createdocument"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-token": getOpenSignApiToken(),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  })

  const text = await response.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { message: text }
  }

  if (!response.ok) {
    const message = asString(asRecord(body).message) ?? text.slice(0, 500)
    throw new Error(`OpenSign create document failed (${response.status}): ${message}`)
  }

  return {
    providerDocumentId: findProviderDocumentId(body),
    raw: body,
    signingLinks: extractSigningLinks(body),
  }
}

export function verifyOpenSignWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.OPENSIGN_WEBHOOK_SECRET
  if (!secret || !signature) return false

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const normalized = signature.replace(/^sha256=/i, "").trim().toLowerCase()
  const expectedBuffer = Buffer.from(expected, "hex")
  const receivedBuffer = Buffer.from(normalized, "hex")

  if (expectedBuffer.length !== receivedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

export function hashOpenSignWebhookEvent(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex")
}
