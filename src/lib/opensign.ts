/**
 * OpenSign client for the SELF-HOSTED deployment.
 *
 * The self-hosted build does not ship the REST v1 API, the API-token UI, or
 * webhooks. Those are cloud-only features: the client bundle has no
 * /generatetoken route, the server has no x-api-token handling, and nothing in
 * the server source mentions webhooks at all. An earlier version of this file
 * targeted `${BASE}/createdocument` with an `x-api-token` header, which could
 * never have worked here.
 *
 * What this build does expose is Parse Server at PARSE_MOUNT (/app) with ~70
 * cloud functions. So this module speaks Parse:
 *
 *   1. Mint a session with the master key via /loginAs. No password needed, and
 *      no long-lived credential is stored in OpenSign itself.
 *   2. Call cloud functions with X-Parse-Session-Token.
 *
 * Because there are no webhooks, completion is discovered by polling
 * getDocument from a cron. See src/app/api/cron/opensign-poll/route.ts.
 *
 * Env:
 *   OPENSIGN_BASE_URL     Parse mount, e.g. https://sign-x.sslip.io/api/app
 *   OPENSIGN_APP_ID       Parse application id, "opensign"
 *   OPENSIGN_MASTER_KEY   Parse master key, from the VM's .env.prod
 *   OPENSIGN_USER_EMAIL   the OpenSign account documents are created as
 *   OPENSIGN_PUBLIC_URL   browser-facing host, for signing links
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const REQUEST_TIMEOUT_MS = 20_000
const MAX_ERROR_CHARS = 500
/** Parse sessions outlive this comfortably; re-minting is cheap and stateless. */
const SESSION_TTL_MS = 20 * 60 * 1000

const REQUIRED_ENV = [
  "OPENSIGN_BASE_URL",
  "OPENSIGN_APP_ID",
  "OPENSIGN_MASTER_KEY",
  "OPENSIGN_USER_EMAIL",
]

export interface OpenSignSigner {
  name: string
  email: string
  widgets?: unknown[]
}

export interface OpenSignCreateDocumentInput {
  title: string
  note: string
  description?: string
  /** Raw PDF bytes. Uploaded to OpenSign's own file store, see below. */
  fileBytes: Buffer
  fileName: string
  signers: OpenSignSigner[]
}

export interface OpenSignCreateDocumentResult {
  providerDocumentId: string
  raw: unknown
  signingLinks: Record<string, string>
}

export interface OpenSignSetupStatus {
  configured: boolean
  missing: string[]
  publicUrl: string | null
  webhookUrl: string | null
}

function env(name: string): string {
  return process.env[name]?.trim() ?? ""
}

function requireEnv(name: string): string {
  const value = env(name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function getOpenSignPublicUrl(): string | null {
  return env("OPENSIGN_PUBLIC_URL") || env("OPENSIGN_BASE_URL") || null
}

export function getOpenSignWebhookUrl(): string | null {
  return env("OPENSIGN_WEBHOOK_URL") || null
}

export function getOpenSignSetupStatus(): OpenSignSetupStatus {
  const missing = REQUIRED_ENV.filter((name) => !env(name))
  return {
    configured: missing.length === 0,
    missing,
    publicUrl: getOpenSignPublicUrl(),
    webhookUrl: getOpenSignWebhookUrl(),
  }
}

function parseUrl(path: string): string {
  const base = requireEnv("OPENSIGN_BASE_URL").replace(/\/+$/, "")
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

/**
 * Session cache. Module scope is per serverless instance, which is the right
 * granularity: a cold start mints a new session, a warm one reuses it.
 */
let cachedSession: { token: string; userId: string; expiresAt: number } | null = null

async function parseFetch(
  path: string,
  headers: Record<string, string>,
  body: unknown
): Promise<unknown> {
  const response = await fetch(parseUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Parse-Application-Id": requireEnv("OPENSIGN_APP_ID"),
      ...headers,
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { message: text }
  }

  if (!response.ok) {
    const record = asRecord(parsed)
    const detail = asString(record.error) ?? asString(record.message) ?? text.slice(0, MAX_ERROR_CHARS)
    throw new Error(`OpenSign ${path} failed (${response.status}): ${detail}`)
  }

  return parsed
}

/**
 * Resolves the OpenSign user to act as, then impersonates it with the master
 * key. Parse's /loginAs is the documented master-key impersonation endpoint, so
 * no OpenSign password is ever stored here.
 */
async function getSession(): Promise<{ token: string; userId: string }> {
  if (cachedSession && cachedSession.expiresAt > Date.now()) {
    return { token: cachedSession.token, userId: cachedSession.userId }
  }

  const masterKey = requireEnv("OPENSIGN_MASTER_KEY")
  const email = requireEnv("OPENSIGN_USER_EMAIL").toLowerCase()

  // Look the user up by email rather than pinning an objectId in config, so a
  // rebuilt OpenSign instance does not need an env change.
  const query = encodeURIComponent(JSON.stringify({ username: email }))
  const lookupResponse = await fetch(parseUrl(`/users?where=${query}&limit=1`), {
    headers: {
      "X-Parse-Application-Id": requireEnv("OPENSIGN_APP_ID"),
      "X-Parse-Master-Key": masterKey,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!lookupResponse.ok) {
    throw new Error(
      `OpenSign user lookup failed (${lookupResponse.status}): ${(await lookupResponse.text()).slice(0, MAX_ERROR_CHARS)}`
    )
  }

  const results = asRecord(await lookupResponse.json()).results
  const user = Array.isArray(results) ? asRecord(results[0]) : {}
  const userId = asString(user.objectId)
  if (!userId) {
    throw new Error(`OpenSign has no account for ${email}. Create it before sending for signature.`)
  }

  const loginAs = asRecord(
    await parseFetch("/loginAs", { "X-Parse-Master-Key": masterKey }, { userId })
  )
  const token = asString(loginAs.sessionToken)
  if (!token) throw new Error("OpenSign loginAs returned no session token.")

  cachedSession = { token, userId, expiresAt: Date.now() + SESSION_TTL_MS }
  return { token, userId }
}

/** Calls a cloud function as the configured OpenSign user. */
async function callFunction(name: string, params: Record<string, unknown>): Promise<unknown> {
  const { token } = await getSession()
  const result = asRecord(
    await parseFetch(`/functions/${name}`, { "X-Parse-Session-Token": token }, params)
  )
  return result.result ?? result
}

/** The contracts_Users row for the session user, which documents are owned by. */
async function getExtUser(): Promise<{ objectId: string }> {
  const extUser = asRecord(await callFunction("getUserDetails", {}))
  const objectId = asString(extUser.objectId)
  if (!objectId) {
    throw new Error("OpenSign returned no contracts_Users record for the configured account.")
  }
  return { objectId }
}

/** Finds or creates the contact each signer is represented by. */
async function resolveContact(signer: OpenSignSigner): Promise<{ objectId: string }> {
  const existing = asRecord(
    await callFunction("isUserInContactBook", { email: signer.email.toLowerCase() })
  )
  const found = asString(existing.objectId)
  if (found) return { objectId: found }

  const created = asRecord(
    await callFunction("savecontact", {
      name: signer.name,
      email: signer.email.toLowerCase(),
      phone: "",
    })
  )
  const objectId = asString(created.objectId)
  if (!objectId) {
    throw new Error(`OpenSign could not create a contact for ${signer.email}.`)
  }
  return { objectId }
}

/**
 * Uploads the PDF into OpenSign's Parse file store and returns its permanent
 * URL.
 *
 * The document is deliberately not referenced by a presigned S3 link: OpenSign
 * stores whatever URL it is given and fetches it again each time a signer opens
 * the document, which can be days later, while our presigned links last an
 * hour. Handing OpenSign its own copy removes that time bomb, and keeps the
 * signing path entirely inside the self-hosted stack.
 */
async function uploadPdf(fileBytes: Buffer, fileName: string): Promise<string> {
  const { token } = await getSession()
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_")

  const response = await fetch(parseUrl(`/files/${encodeURIComponent(safeName)}`), {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-Parse-Application-Id": requireEnv("OPENSIGN_APP_ID"),
      "X-Parse-Session-Token": token,
    },
    body: new Uint8Array(fileBytes),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`OpenSign file upload failed (${response.status}): ${text.slice(0, MAX_ERROR_CHARS)}`)
  }

  const url = asString(asRecord(JSON.parse(text)).url)
  if (!url) throw new Error("OpenSign file upload returned no URL.")
  return url
}

function pointer(className: string, objectId: string) {
  return { __type: "Pointer", className, objectId }
}

/**
 * Creates a signature request.
 *
 * The document is referenced by URL rather than uploaded as base64: OpenSign
 * fetches it itself, so the caller passes a presigned S3 link that outlives the
 * signing window.
 */
export async function createOpenSignDocument(
  input: OpenSignCreateDocumentInput
): Promise<OpenSignCreateDocumentResult> {
  const { userId } = await getSession()
  const extUser = await getExtUser()
  const fileUrl = await uploadPdf(input.fileBytes, input.fileName)

  const contacts = []
  for (const signer of input.signers) {
    contacts.push({ signer, contact: await resolveContact(signer) })
  }

  const placeholders = contacts.map(({ signer, contact }, index) => ({
    signerObjId: contact.objectId,
    signerPtr: pointer("contracts_Contactbook", contact.objectId),
    blockColor: "#93a3db",
    Role: signer.name || `Signer ${index + 1}`,
    Id: index + 1,
    placeHolder: signer.widgets ?? [],
  }))

  const created = asRecord(
    await callFunction("createDocumentFromApp", {
      document: {
        Name: input.title,
        Description: input.description ?? "",
        Note: input.note,
        URL: fileUrl,
        ExtUserPtr: pointer("contracts_Users", extUser.objectId),
        CreatedBy: pointer("_User", userId),
        Signers: contacts.map(({ contact }) => pointer("contracts_Contactbook", contact.objectId)),
        Placeholders: placeholders,
        SentToOthers: true,
        SendinOrder: false,
        NotifyOnSignatures: true,
        DocSentAt: { __type: "Date", iso: new Date().toISOString() },
      },
    })
  )

  const providerDocumentId =
    asString(created.objectId) ?? asString(asRecord(created.document).objectId)
  if (!providerDocumentId) {
    throw new Error("OpenSign did not return a document id.")
  }

  const publicUrl = (getOpenSignPublicUrl() ?? "").replace(/\/+$/, "")
  const signingLinks: Record<string, string> = {}
  for (const { signer, contact } of contacts) {
    if (publicUrl) {
      signingLinks[signer.email.toLowerCase()] =
        `${publicUrl}/login/${providerDocumentId}/${contact.objectId}`
    }
  }

  return { providerDocumentId, raw: created, signingLinks }
}

export interface OpenSignDocumentStatus {
  objectId: string
  isCompleted: boolean
  isDeclined: boolean
  declinedReason: string | null
  signedUrl: string | null
  signedEmails: string[]
  viewedEmails: string[]
  raw: unknown
}

/**
 * Reads current signing state. This is the polling counterpart to the webhook
 * the self-hosted build does not have.
 */
export async function fetchOpenSignDocument(
  providerDocumentId: string
): Promise<OpenSignDocumentStatus> {
  const doc = asRecord(await callFunction("getDocument", { docId: providerDocumentId }))

  const error = asString(doc.error)
  if (error) throw new Error(`OpenSign getDocument: ${error}`)

  const auditTrail = Array.isArray(doc.AuditTrail) ? doc.AuditTrail : []
  const signedEmails: string[] = []
  const viewedEmails: string[] = []

  for (const entry of auditTrail) {
    const record = asRecord(entry)
    const activity = (asString(record.Activity) ?? "").toLowerCase()
    const signer = asRecord(record.UserPtr)
    const email = asString(signer.Email)?.toLowerCase()
    if (!email) continue
    if (activity.includes("sign")) signedEmails.push(email)
    else if (activity.includes("view")) viewedEmails.push(email)
  }

  const declineBy = asRecord(doc.DeclineBy)
  const isDeclined = Boolean(doc.IsDeclined) || Boolean(asString(declineBy.objectId))

  return {
    objectId: providerDocumentId,
    isCompleted: Boolean(doc.IsCompleted),
    isDeclined,
    declinedReason: asString(doc.DeclineReason),
    signedUrl: asString(doc.SignedUrl),
    signedEmails: [...new Set(signedEmails)],
    viewedEmails: [...new Set(viewedEmails)],
    raw: doc,
  }
}

/**
 * Retained for a future hosted deployment, which does send webhooks. The
 * self-hosted build never calls the webhook route, so this is currently unused
 * by any live path.
 */
export function verifyOpenSignWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = env("OPENSIGN_WEBHOOK_SECRET")
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
