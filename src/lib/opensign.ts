/**
 * OpenSign client for the SELF-HOSTED deployment.
 *
 * The self-hosted build does not ship the REST v1 API, the API-token UI, or
 * webhooks. Those are cloud-only features: the client bundle has no
 * /generatetoken route, the server has no x-api-token handling, and nothing in
 * the server source mentions webhooks at all. What this build does expose is
 * Parse Server at PARSE_MOUNT (/app) with ~70 cloud functions. So this module
 * speaks Parse:
 *
 *   1. Mint a session with the master key via /loginAs. No password needed, and
 *      no long-lived credential is stored in OpenSign itself.
 *   2. Call cloud functions with X-Parse-Session-Token.
 *
 * Because there are no webhooks, completion is discovered by polling
 * getDocument from a cron. See src/app/api/cron/opensign-poll/route.ts.
 *
 * Cloud function names are CASE-SENSITIVE (a wrong-case name is Parse error
 * 141, verified live). Every name used here is copied from the server's
 * cloud/main.js registrations:
 *   createdocumentfromapp   main.js:140, all lowercase
 *   getUserDetails          main.js:92, camelCase as registered
 *   getDocument             main.js:93, camelCase as registered
 *   savecontact             main.js:114, all lowercase
 *   isuserincontactbook     main.js:115, all lowercase; NOT used here because
 *                           it ignores any email param and only self-looks-up
 *                           the session user, so contacts are resolved via
 *                           savecontact plus a class query instead.
 *
 * Placement contract (verified against the live server's client bundle, see
 * the placement recon): widget coordinates are PDF points (1/72in) with the
 * ORIGIN AT THE PAGE TOP-LEFT; yPosition runs from the page top to the widget
 * top; pageNumber is 1-based; no scale factor is applied anywhere. Callers
 * describe fields as fractions of the page box (OpenSignFieldPlacement) and
 * ONLY this module converts them to points, using the per-page dims it is
 * handed in OpenSignCreateDocumentInput.pages.
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

/** Parse error code thrown by savecontact when the contact already exists. */
const PARSE_DUPLICATE_VALUE = 137

/**
 * A field position expressed as fractions of the page box, origin TOP-LEFT.
 * The percentage form keeps callers independent of the physical page size;
 * conversion to PDF points happens only inside this module.
 */
export interface OpenSignFieldPlacement {
  page: number
  xPct: number
  yPct: number
  wPct: number
  hPct: number
  type: "signature" | "initials" | "date" | "text input" | "name" | "email"
  required?: boolean
  prefill?: string
  /** Shown as help text in the OpenSign signing UI (options.hint). */
  label?: string
}

/** Real page dimensions in PDF points, measured server-side from the file. */
export interface OpenSignPageDims {
  pageNumber: number
  widthPt: number
  heightPt: number
}

export interface OpenSignSigner {
  name: string
  email: string
  fields: OpenSignFieldPlacement[]
}

export interface OpenSignCreateDocumentInput {
  title: string
  note: string
  description?: string
  /** Raw PDF bytes. Uploaded to OpenSign's own file store, see uploadPdf. */
  fileBytes: Buffer
  fileName: string
  /** Dims for every page that carries fields. */
  pages: OpenSignPageDims[]
  signers: OpenSignSigner[]
  /** Contacts emailed the completed document (contracts_Contactbook Cc). */
  ccEmails?: string[]
  timeToCompleteDays?: number
  /** Display name used in the invitation From header. Name only, no address. */
  senderDisplayName?: string
}

export interface OpenSignCreateDocumentResult {
  /** Signer email -> failure reason, for invitations that could not be sent. */
  invitationFailures?: Record<string, string>
  providerDocumentId: string
  raw: unknown
  signingLinks: Record<string, string>
  /** The document's URL in OpenSign's own file store; a durable fallback when S3 is unavailable. */
  providerFileUrl: string
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

/** Carries the Parse error code so callers can branch on well-known codes. */
class OpenSignRequestError extends Error {
  constructor(
    message: string,
    readonly parseCode: number | null
  ) {
    super(message)
    this.name = "OpenSignRequestError"
  }
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
    const code = typeof record.code === "number" ? record.code : null
    throw new OpenSignRequestError(`OpenSign ${path} failed (${response.status}): ${detail}`, code)
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
  // Registered as "getUserDetails" (cloud/main.js:92), camelCase verified.
  const extUser = asRecord(await callFunction("getUserDetails", {}))
  const objectId = asString(extUser.objectId)
  if (!objectId) {
    throw new Error("OpenSign returned no contracts_Users record for the configured account.")
  }
  return { objectId }
}

/**
 * Looks up an existing, non-deleted contact of the session user by email.
 * There is no cloud function for this ("isuserincontactbook" ignores any email
 * param and only self-looks-up the session user), so this queries the class
 * directly; the contact ACL grants the creating user read access.
 */
async function findContactByEmail(email: string): Promise<{ objectId: string } | null> {
  const { token, userId } = await getSession()
  const where = {
    Email: email,
    CreatedBy: pointer("_User", userId),
    IsDeleted: { $ne: true },
  }
  const query = encodeURIComponent(JSON.stringify(where))
  const response = await fetch(
    parseUrl(`/classes/contracts_Contactbook?where=${query}&limit=1&keys=objectId`),
    {
      headers: {
        "X-Parse-Application-Id": requireEnv("OPENSIGN_APP_ID"),
        "X-Parse-Session-Token": token,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  )
  if (!response.ok) {
    throw new Error(
      `OpenSign contact lookup failed (${response.status}): ${(await response.text()).slice(0, MAX_ERROR_CHARS)}`
    )
  }
  const results = asRecord(await response.json()).results
  const first = Array.isArray(results) ? asRecord(results[0]) : {}
  const objectId = asString(first.objectId)
  return objectId ? { objectId } : null
}

/**
 * Finds or creates the contact a signer or Cc recipient is represented by.
 * savecontact (cloud/main.js:114, lowercase verified) also creates the linked
 * _User the after-save ACL needs; a contact without a UserId pointer silently
 * loses its ACL and the signer cannot open the document.
 */
async function resolveContact(name: string, email: string): Promise<{ objectId: string }> {
  const normalized = email.trim().toLowerCase()
  try {
    const created = asRecord(
      await callFunction("savecontact", { name, email: normalized, phone: "" })
    )
    const objectId = asString(created.objectId)
    if (objectId) return { objectId }
  } catch (error) {
    const isDuplicate =
      error instanceof OpenSignRequestError &&
      (error.parseCode === PARSE_DUPLICATE_VALUE || error.message.includes("already exists"))
    if (!isDuplicate) throw error
  }
  // Either the contact already existed (error 137) or savecontact swallowed an
  // internal error and returned nothing; the class query settles both.
  const existing = await findContactByEmail(normalized)
  if (existing) return existing
  throw new Error(`OpenSign could not resolve a contact for ${normalized}.`)
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

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 8-digit random int, unique within this document's Ids and widget keys. */
function randomWireId(used: Set<number>): number {
  let id = Math.floor(10000000 + Math.random() * 90000000)
  while (used.has(id)) id = Math.floor(10000000 + Math.random() * 90000000)
  used.add(id)
  return id
}

/** Widget types the signing client draws from fontSize instead of Height. */
const TEXT_LIKE_TYPES = new Set(["date", "text input", "name", "email"])

interface WireWidget {
  key: number
  type: string
  xPosition: number
  yPosition: number
  Width: number
  Height: number
  isStamp: false
  scale: 1
  zIndex: number
  options: Record<string, unknown>
}

interface WirePageGroup {
  pageNumber: number
  pos: WireWidget[]
}

interface WirePlaceholder {
  Id: number
  Role: string
  blockColor: string
  signerObjId: string
  signerPtr: { __type: string; className: string; objectId: string }
  email: string
  placeHolder: WirePageGroup[]
}

/**
 * Validates one field against the known page dims and returns the dims of the
 * page it targets. Errors name the offending field so a caller can fix it.
 */
function validateField(
  field: OpenSignFieldPlacement,
  index: number,
  pages: OpenSignPageDims[],
  signerEmail: string
): OpenSignPageDims {
  const label = `Field ${index + 1} (${field.type}) for ${signerEmail}`
  const dims = pages.find((page) => page.pageNumber === field.page)
  if (!Number.isInteger(field.page) || field.page < 1 || !dims) {
    throw new Error(`${label} targets page ${field.page}, which is not in the document's page list.`)
  }
  for (const key of ["xPct", "yPct", "wPct", "hPct"] as const) {
    const value = field[key]
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${label} has ${key} ${value}, outside [0, 1].`)
    }
  }
  if (field.wPct <= 0 || field.hPct <= 0) {
    throw new Error(`${label} needs wPct and hPct greater than 0.`)
  }
  // A box may not extend past the page edge: the stamped content would be
  // clipped or drawn entirely off the executed PDF.
  if (field.xPct + field.wPct > 1.0001) {
    throw new Error(`${label} extends past the right page edge (x ${field.xPct} + w ${field.wPct} > 1).`)
  }
  if (field.yPct + field.hPct > 1.0001) {
    throw new Error(`${label} extends past the bottom page edge (y ${field.yPct} + h ${field.hPct} > 1).`)
  }
  return dims
}

/** Converts one field to the wire widget, percent-of-page to top-left points. */
function buildWidget(
  field: OpenSignFieldPlacement,
  dims: OpenSignPageDims,
  zIndex: number,
  usedIds: Set<number>
): WireWidget {
  const key = randomWireId(usedIds)
  const options: Record<string, unknown> = {
    name: `${field.type}-${key}`,
    status: field.required === false ? "optional" : "required",
  }
  if (field.label?.trim()) options.hint = field.label.trim().slice(0, 120)
  if (TEXT_LIKE_TYPES.has(field.type)) {
    options.response = field.prefill ?? ""
    options.isReadOnly = field.prefill != null
    options.fontSize = 12
    options.fontColor = "black"
    if (field.type === "date") {
      options.validation = { format: "dd/MM/yyyy", type: "date-format" }
    }
  }
  return {
    key,
    type: field.type,
    xPosition: round2(field.xPct * dims.widthPt),
    yPosition: round2(field.yPct * dims.heightPt),
    Width: round2(field.wPct * dims.widthPt),
    Height: round2(field.hPct * dims.heightPt),
    isStamp: false,
    scale: 1,
    zIndex,
    options,
  }
}

/**
 * Builds the verified Placeholders wire schema: one entry per signer, widgets
 * grouped per 1-based page. Placeholder array order is the signing order, and
 * every non-prefill entry counts toward completion, so an entry with no
 * widgets would make the document impossible to complete; that is rejected.
 */
function buildPlaceholders(
  resolved: Array<{ signer: OpenSignSigner; contact: { objectId: string } }>,
  pages: OpenSignPageDims[],
  usedIds: Set<number>
): WirePlaceholder[] {
  let zIndex = 1
  return resolved.map(({ signer, contact }, index) => {
    const email = signer.email.trim().toLowerCase()
    if (signer.fields.length === 0) {
      throw new Error(`Signer ${email} has no fields; a signer without fields can never complete the document.`)
    }

    const groups = new Map<number, WirePageGroup>()
    signer.fields.forEach((field, fieldIndex) => {
      const dims = validateField(field, fieldIndex, pages, email)
      const group = groups.get(field.page) ?? { pageNumber: field.page, pos: [] }
      group.pos.push(buildWidget(field, dims, zIndex++, usedIds))
      groups.set(field.page, group)
    })

    // "prefill" is a reserved Role that removes the entry from signing.
    const name = signer.name.trim()
    const role = !name || name.toLowerCase() === "prefill" ? `Signer ${index + 1}` : name

    return {
      Id: randomWireId(usedIds),
      Role: role,
      blockColor: "#93a3db",
      signerObjId: contact.objectId,
      signerPtr: pointer("contracts_Contactbook", contact.objectId),
      email,
      placeHolder: [...groups.values()].sort((a, b) => a.pageNumber - b.pageNumber),
    }
  })
}

/**
 * Creates a signature request via the "createdocumentfromapp" cloud function
 * (cloud/main.js:140, all lowercase; the camelCase name is Parse error 141).
 */
export async function createOpenSignDocument(
  input: OpenSignCreateDocumentInput
): Promise<OpenSignCreateDocumentResult> {
  if (input.signers.length === 0) throw new Error("At least one signer is required.")
  for (const page of input.pages) {
    if (page.widthPt <= 0 || page.heightPt <= 0) {
      throw new Error(`Page ${page.pageNumber} has invalid dimensions ${page.widthPt}x${page.heightPt}pt.`)
    }
  }
  // Two signers on one email resolve to one contact and produce a duplicate
  // signerObjId; the recipient page binds only the first placeholder entry and
  // the completion count can then never be met, so the document hangs forever.
  const emailCounts = new Map<string, number>()
  for (const signer of input.signers) {
    const email = signer.email.trim().toLowerCase()
    emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1)
  }
  for (const [email, count] of emailCounts) {
    if (count > 1) {
      throw new Error(`Signer email ${email} appears ${count} times; each signer needs a distinct address.`)
    }
  }

  // Validate every field before any contact or file write happens.
  for (const signer of input.signers) {
    const email = signer.email.trim().toLowerCase()
    if (signer.fields.length === 0) {
      throw new Error(`Signer ${email} has no fields; a signer without fields can never complete the document.`)
    }
    signer.fields.forEach((field, index) => validateField(field, index, input.pages, email))
  }

  const { userId } = await getSession()
  const extUser = await getExtUser()
  const fileUrl = await uploadPdf(input.fileBytes, input.fileName)

  const resolved = []
  for (const signer of input.signers) {
    resolved.push({ signer, contact: await resolveContact(signer.name, signer.email) })
  }

  // Cc contacts get emailed the completed document. Signers already do, so
  // they are skipped. The address itself is the only identity we have for a
  // Cc, so it doubles as the contact name; nothing is invented.
  const signerEmails = new Set(resolved.map(({ signer }) => signer.email.trim().toLowerCase()))
  const ccPointers: ReturnType<typeof pointer>[] = []
  const seenCc = new Set<string>()
  for (const raw of input.ccEmails ?? []) {
    const cc = raw.trim().toLowerCase()
    if (!cc || signerEmails.has(cc) || seenCc.has(cc)) continue
    seenCc.add(cc)
    const contact = await resolveContact(cc, cc)
    ccPointers.push(pointer("contracts_Contactbook", contact.objectId))
  }

  const usedIds = new Set<number>()
  const placeholders = buildPlaceholders(resolved, input.pages, usedIds)

  // Length caps enforced by DocumentBeforesave: Name 250, Note 200,
  // Description 500. Truncating beats a VALIDATION_ERROR round trip.
  const document: Record<string, unknown> = {
    Name: input.title.slice(0, 250),
    Note: input.note.slice(0, 200),
    URL: fileUrl,
    ExtUserPtr: pointer("contracts_Users", extUser.objectId),
    CreatedBy: pointer("_User", userId),
    // Signers must be exactly the placeholder signerObjIds, same order; the
    // after-save ACL and the recipient page both reconcile against it.
    Signers: resolved.map(({ contact }) => pointer("contracts_Contactbook", contact.objectId)),
    Placeholders: placeholders,
    SentToOthers: true,
    SendinOrder: false,
    NotifyOnSignatures: true,
    TimeToCompleteDays: input.timeToCompleteDays ?? 15,
    SignatureType: [
      { name: "default", enabled: true },
      { name: "draw", enabled: true },
      { name: "typed", enabled: true },
      { name: "upload", enabled: true },
    ],
    DocSentAt: { __type: "Date", iso: new Date().toISOString() },
  }
  if (input.description) document.Description = input.description.slice(0, 500)
  if (ccPointers.length > 0) document.Cc = ccPointers

  const created = asRecord(await callFunction("createdocumentfromapp", { document }))

  const providerDocumentId =
    asString(created.objectId) ?? asString(asRecord(created.document).objectId)
  if (!providerDocumentId) {
    throw new Error("OpenSign did not return a document id.")
  }

  // Signing links use the guest-login route the client itself generates:
  // /login/<base64(docId/email/contactId/sendMail)>, route "/login/:base64url"
  // in the client router table. A plain /login/<docId>/<contactId> path does
  // not exist and would throw inside the client's atob().
  const publicUrl = (getOpenSignPublicUrl() ?? "").replace(/\/+$/, "")
  const signingLinks: Record<string, string> = {}
  for (const { signer, contact } of resolved) {
    if (!publicUrl) continue
    const email = signer.email.trim().toLowerCase()
    const payload = Buffer.from(
      `${providerDocumentId}/${email}/${contact.objectId}/false`,
      "utf8"
    ).toString("base64")
    signingLinks[email] = `${publicUrl}/login/${payload}`
  }

  // Deliver the signing invitations. createdocumentfromapp only SAVES the
  // document; in OpenSign the invitation mail is sent separately by the web
  // client through the sendmailv3 cloud function (cloud/main.js:87), so an API
  // caller that skips this step produces a document nobody ever hears about.
  // sendmailv3 builds its From header as `from + " <" + MAILGUN_SENDER + ">"`,
  // so `from` must be a DISPLAY NAME ONLY, never an address in brackets.
  const invitationFailures: Record<string, string> = {}
  const ccList = [...seenCc]
  for (const { signer } of resolved) {
    const email = signer.email.trim().toLowerCase()
    const link = signingLinks[email]
    if (!link) continue
    try {
      const mail = asRecord(
        await callFunction("sendmailv3", {
          extUserId: extUser.objectId,
          from: input.senderDisplayName?.slice(0, 80) ?? "LSC Legal",
          recipient: email,
          subject: `Signature requested: ${input.title.slice(0, 180)}`,
          text: `${signer.name}, you have been asked to sign "${input.title}". Open ${link} to review and sign.`,
          html: buildInvitationHtml(signer.name, input.title, link, input.note),
        })
      )
      if (asString(mail.status) !== "success") {
        invitationFailures[email] = asString(mail.status) ?? "unknown sendmailv3 response"
      }
    } catch (error) {
      invitationFailures[email] = error instanceof Error ? error.message : String(error)
    }
  }

  // Cc'd colleagues get a plain heads-up with NO signing link. A signing link
  // IS the signer's identity (the guest route authenticates purely on it), so
  // cc-ing it onto an invitation lets any cc recipient sign as the
  // counterparty; that happened in production on 2026-08-30. The signed copy
  // still reaches cc through the document's Cc contact pointers at completion.
  if (ccList.length > 0) {
    try {
      const mail = asRecord(
        await callFunction("sendmailv3", {
          extUserId: extUser.objectId,
          from: input.senderDisplayName?.slice(0, 80) ?? "LSC Legal",
          recipient: ccList.join(","),
          subject: `Sent for signature: ${input.title.slice(0, 180)}`,
          text: `You are cc'd on "${input.title}". It has been sent for signature; you will receive the completed copy once everyone has signed.`,
          html: buildCcNoticeHtml(input.title),
        })
      )
      if (asString(mail.status) !== "success") {
        invitationFailures["cc"] = asString(mail.status) ?? "unknown sendmailv3 response"
      }
    } catch (error) {
      invitationFailures["cc"] = error instanceof Error ? error.message : String(error)
    }
  }

  return { providerDocumentId, raw: created, signingLinks, invitationFailures, providerFileUrl: fileUrl }
}

/** Cc heads-up body: names the document, carries no link on purpose. */
function buildCcNoticeHtml(title: string): string {
  const safeTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return [
    `<p>You are cc'd on <strong>${safeTitle}</strong>.</p>`,
    "<p>It has been sent for signature. You will receive the completed copy once everyone has signed.</p>",
  ].join("")
}

/** Plain, provider-neutral invitation body. No tracking, no external assets. */
function buildInvitationHtml(
  signerName: string,
  title: string,
  link: string,
  note: string
): string {
  const safe = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return [
    `<p>Hello ${safe(signerName)},</p>`,
    `<p>You have been asked to sign <b>${safe(title)}</b>.</p>`,
    note ? `<p>${safe(note)}</p>` : "",
    `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#1c2bb8;color:#ffffff;border-radius:6px;text-decoration:none;">Review &amp; sign</a></p>`,
    `<p style="font-size:12px;color:#666">Or open this link: ${link}</p>`,
  ].join("")
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
 * Reads current signing state via "getDocument" (cloud/main.js:93, camelCase
 * verified). This is the polling counterpart to the webhook the self-hosted
 * build does not have.
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
