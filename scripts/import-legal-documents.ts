import { createHash } from "node:crypto"
import { config } from "dotenv"
import { google } from "googleapis"
import type { gmail_v1 } from "googleapis"

config({ path: ".env" })
config({ path: ".env.local", override: true })

type ImportedModules = {
  prisma: typeof import("../src/lib/prisma").prisma
  uploadBufferToS3: typeof import("../src/lib/s3").uploadBufferToS3
  getS3Key: typeof import("../src/lib/s3").getS3Key
  extractTextFromFile: typeof import("../src/lib/extract-text").extractTextFromFile
  runAgent: typeof import("../src/lib/agents/orchestrator").runAgent
}

type SourceMailbox = "legal@leaguesportsco.com" | "anuj@leaguesportsco.com"

type AttachmentCandidate = {
  mailbox: SourceMailbox
  messageId: string
  attachmentId: string
  filename: string
  mimeType: string
  size: number
  subject: string
  from: string
  date: string
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const OWNER_EMAILS = ["anuj@leaguesports.co", "anuj@leaguesportsco.com"]
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

const LEGAL_MAILBOX_QUERY =
  "has:attachment (filename:pdf OR filename:doc OR filename:docx OR filename:rtf OR filename:txt)"

const ANUJ_MAILBOX_QUERY =
  "has:attachment (filename:pdf OR filename:doc OR filename:docx OR filename:rtf OR filename:txt) " +
  "(agreement OR NDA OR MNDA OR contract OR signed OR docusign OR hellosign OR LOA OR LOI OR MOU OR waiver OR addendum OR terms) -invoice"

const LEGAL_KEYWORDS = [
  "addendum",
  "agreement",
  "certificate",
  "consultancy",
  "contract",
  "council",
  "docusign",
  "experience letter",
  "heads of terms",
  "hellosign",
  "loa",
  "loi",
  "mechanic",
  "mnda",
  "mou",
  "mutual nda",
  "nda",
  "non compete",
  "non disclosure",
  "pilot agreement",
  "pro rata",
  "release letter",
  "relieving letter",
  "salary increment",
  "side letter",
  "signature",
  "signed",
  "sponsorship",
  "termination",
  "terms",
  "token grant",
  "waiver",
]

const EXCLUDED_KEYWORDS = [
  "bank statement",
  "flight schedule",
  "hotel confirmation",
  "inv-",
  "invoice",
  "paid_",
  "receipt",
  "sign documents online",
  "transaction",
]

function parseArgs() {
  const args = new Set(process.argv.slice(2))
  return {
    apply: args.has("--apply"),
    legalOnly: args.has("--legal-only"),
    anujOnly: args.has("--anuj-only"),
    limit: Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 500),
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
}

function cleanTitle(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function hasAnyKeyword(value: string, keywords: string[]): boolean {
  const normalized = normalizeText(value)
  return keywords.some((keyword) => normalized.includes(keyword))
}

function isProbablyLegal(candidate: AttachmentCandidate): boolean {
  const haystack = `${candidate.filename} ${candidate.subject}`
  if (!/\.(pdf|docx?|rtf|txt)$/i.test(candidate.filename)) return false
  if (candidate.size > MAX_UPLOAD_BYTES) return false
  if (hasAnyKeyword(candidate.filename, EXCLUDED_KEYWORDS)) return false
  if (candidate.mailbox === "legal@leaguesportsco.com") return true
  return hasAnyKeyword(haystack, LEGAL_KEYWORDS) && !hasAnyKeyword(haystack, EXCLUDED_KEYWORDS)
}

function inferEntity(text: string) {
  const normalized = normalizeText(text)
  if (
    normalized.includes("team blue rising") ||
    normalized.includes("tbr") ||
    normalized.includes(" e1 ")
  ) {
    return "TBR"
  }
  if (
    normalized.includes("future of sports") ||
    normalized.includes("fsp") ||
    normalized.includes("fsp labs")
  ) {
    return "FSP"
  }
  if (normalized.includes("xtz") || normalized.includes("esports")) {
    return "XTZ"
  }
  if (normalized.includes("xte")) {
    return "XTE"
  }
  return "LSC"
}

function inferCategory(text: string) {
  const normalized = normalizeText(text)
  if (normalized.includes("mnda") || normalized.includes("nda") || normalized.includes("non disclosure")) {
    return "NDA"
  }
  if (normalized.includes("sla")) return "SLA"
  if (normalized.includes("msa")) return "MSA"
  if (normalized.includes("sponsorship")) return "SPONSORSHIP"
  if (normalized.includes("waiver")) return "WAIVER"
  if (normalized.includes("employment") || normalized.includes("pilot") || normalized.includes("mechanic")) {
    return "EMPLOYMENT"
  }
  if (normalized.includes("token grant") || normalized.includes("pro rata") || normalized.includes("side letter")) {
    return "ESOP"
  }
  if (normalized.includes("referral")) return "REFERRAL_PARTNER"
  if (normalized.includes("consultancy") || normalized.includes("contractor")) return "CONTRACTOR"
  if (normalized.includes("terms of service")) return "TERMS_OF_SERVICE"
  if (normalized.includes("policy")) return "POLICY"
  return "OTHER"
}

function inferStatus(text: string) {
  const normalized = normalizeText(text)
  if (
    normalized.includes("everyone has signed") ||
    normalized.includes("has been signed") ||
    normalized.includes("signed by") ||
    normalized.startsWith("completed:") ||
    normalized.includes(" docusign") ||
    normalized.includes("docusing")
  ) {
    return "SIGNED"
  }
  if (
    normalized.includes("reviewed") ||
    normalized.includes("comments") ||
    normalized.includes("signature requested") ||
    normalized.includes("final draft")
  ) {
    return "IN_REVIEW"
  }
  return "DRAFT"
}

function contentTypeFor(filename: string, mimeType: string): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType
  const lower = filename.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
  if (lower.endsWith(".doc")) return "application/msword"
  if (lower.endsWith(".rtf")) return "application/rtf"
  if (lower.endsWith(".txt")) return "text/plain"
  return "application/octet-stream"
}

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is required")
  return JSON.parse(raw) as { client_email: string; private_key: string }
}

function gmailClient(mailbox: SourceMailbox) {
  const credentials = getCredentials()
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [GMAIL_READONLY_SCOPE],
    subject: mailbox,
  })
  return google.gmail({ version: "v1", auth })
}

function headerValue(message: gmail_v1.Schema$Message, name: string): string {
  const headers = message.payload?.headers ?? []
  return headers.find((header) => header.name?.toLowerCase() === name)?.value ?? ""
}

function collectAttachments(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: Omit<AttachmentCandidate, "mailbox" | "messageId" | "subject" | "from" | "date">[] = []
) {
  if (!part) return out
  if (part.filename && part.body?.attachmentId) {
    out.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
    })
  }
  for (const child of part.parts ?? []) collectAttachments(child, out)
  return out
}

async function listCandidates(mailbox: SourceMailbox, query: string, limit: number) {
  const gmail = gmailClient(mailbox)
  const candidates: AttachmentCandidate[] = []
  let pageToken: string | undefined

  do {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(100, limit),
      pageToken,
    })
    pageToken = list.data.nextPageToken ?? undefined

    for (const item of list.data.messages ?? []) {
      if (!item.id) continue
      const message = await gmail.users.messages.get({
        userId: "me",
        id: item.id,
        format: "full",
      })
      const subject = headerValue(message.data, "subject")
      const from = headerValue(message.data, "from")
      const date = headerValue(message.data, "date")
      for (const attachment of collectAttachments(message.data.payload)) {
        const candidate = {
          mailbox,
          messageId: item.id,
          subject,
          from,
          date,
          ...attachment,
        }
        if (isProbablyLegal(candidate)) candidates.push(candidate)
      }
    }
  } while (pageToken && candidates.length < limit)

  return candidates.slice(0, limit)
}

function decodeBase64Url(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64")
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)
  return arrayBuffer
}

async function downloadAttachment(candidate: AttachmentCandidate): Promise<Buffer> {
  const gmail = gmailClient(candidate.mailbox)
  const response = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId: candidate.messageId,
    id: candidate.attachmentId,
  })
  if (!response.data.data) throw new Error(`Missing attachment bytes for ${candidate.filename}`)
  return decodeBase64Url(response.data.data)
}

async function sourceAlreadyImported(
  prisma: ImportedModules["prisma"],
  sourceHash: string,
  title: string
) {
  const byHash = await prisma.legalDocument.findFirst({
    where: { notes: { contains: `sourceHash:${sourceHash}` } },
    select: { id: true, title: true },
  })
  if (byHash) return byHash

  return prisma.legalDocument.findFirst({
    where: { title: { equals: title, mode: "insensitive" }, file_url: { not: null } },
    select: { id: true, title: true },
  })
}

async function importCandidate(
  modules: ImportedModules,
  ownerId: string,
  candidate: AttachmentCandidate,
  apply: boolean,
  seenHashes: Set<string>
) {
  const buffer = await downloadAttachment(candidate)
  const sourceHash = createHash("sha256").update(buffer).digest("hex")
  const title = cleanTitle(candidate.filename)
  if (seenHashes.has(sourceHash)) {
    return { action: "skip", title, reason: "duplicate file hash in this import run" }
  }
  const existing = await sourceAlreadyImported(modules.prisma, sourceHash, title)
  if (existing) {
    return { action: "skip", title, reason: `already imported as ${existing.id}` }
  }
  seenHashes.add(sourceHash)

  const context = `${candidate.filename} ${candidate.subject}`
  const entity = inferEntity(context)
  const filenameCategory = inferCategory(candidate.filename)
  const category = filenameCategory === "OTHER" ? inferCategory(context) : filenameCategory
  const lifecycleStatus = inferStatus(context)
  const contentType = contentTypeFor(candidate.filename, candidate.mimeType)

  if (!apply) {
    return { action: "would-import", title, entity, category, lifecycleStatus, bytes: buffer.length }
  }

  const key = modules.getS3Key(entity, category, candidate.filename)
  const fileUrl = await modules.uploadBufferToS3(buffer, key, contentType)
  const file = new File([bufferToArrayBuffer(buffer)], candidate.filename, { type: contentType })
  const extractedText = await modules.extractTextFromFile(file)
  const sourceMarker = [
    `source:gmail:${candidate.mailbox}:${candidate.messageId}:${candidate.attachmentId}`,
    `sourceHash:${sourceHash}`,
  ].join("\n")
  const notes = [
    sourceMarker,
    `Imported from ${candidate.mailbox}`,
    `Email subject: ${candidate.subject}`,
    `Email from: ${candidate.from}`,
    `Email date: ${candidate.date}`,
    extractedText ? `Extracted preview:\n${extractedText.slice(0, 4000)}` : "",
  ].filter(Boolean).join("\n\n")

  const document = await modules.prisma.legalDocument.create({
    data: {
      title,
      category: category as never,
      entity: entity as never,
      owner_id: ownerId,
      lifecycle_status: lifecycleStatus as never,
      notes,
      file_url: fileUrl,
      contract_name: title,
      contract_status: lifecycleStatus === "SIGNED" ? "active" : "draft",
    },
  })

  const version = await modules.prisma.documentVersion.create({
    data: {
      document_id: document.id,
      version_number: 1,
      file_url: fileUrl,
      change_summary: `Initial Gmail import from ${candidate.mailbox}`,
      created_by: ownerId,
    },
  })

  const analysisContent = extractedText.trim() || notes
  if (analysisContent.trim()) {
    await modules.runAgent("agreement-analyzer", {
      documentId: document.id,
      versionId: version.id,
      sourceType: "gmail_import",
      sourceLabel: candidate.filename,
      content: analysisContent,
    })
  }

  await modules.prisma.lifecycleEvent.create({
    data: {
      document_id: document.id,
      from_status: "DRAFT",
      to_status: lifecycleStatus as never,
      transitioned_by: ownerId,
      notes: `Imported from Gmail attachment: ${candidate.filename}`,
    },
  })

  return { action: "import", title, id: document.id, entity, category, lifecycleStatus, bytes: buffer.length }
}

async function main() {
  const args = parseArgs()
  const prismaModule = await import("../src/lib/prisma")
  const s3Module = await import("../src/lib/s3")
  const extractModule = await import("../src/lib/extract-text")
  const agentsModule = await import("../src/lib/agents/orchestrator")
  const modules: ImportedModules = {
    prisma: prismaModule.prisma,
    uploadBufferToS3: s3Module.uploadBufferToS3,
    getS3Key: s3Module.getS3Key,
    extractTextFromFile: extractModule.extractTextFromFile,
    runAgent: agentsModule.runAgent,
  }

  const owner = await modules.prisma.appUser.findFirst({
    where: { email: { in: OWNER_EMAILS } },
    select: { id: true, email: true },
  })
  if (!owner) throw new Error(`Owner user not found: ${OWNER_EMAILS.join(", ")}`)

  const sources: { mailbox: SourceMailbox; query: string }[] = []
  if (!args.anujOnly) sources.push({ mailbox: "legal@leaguesportsco.com", query: LEGAL_MAILBOX_QUERY })
  if (!args.legalOnly) sources.push({ mailbox: "anuj@leaguesportsco.com", query: ANUJ_MAILBOX_QUERY })

  const candidates: AttachmentCandidate[] = []
  for (const source of sources) {
    const sourceCandidates = await listCandidates(source.mailbox, source.query, args.limit)
    console.log(`${source.mailbox}: ${sourceCandidates.length} legal attachment candidate(s)`)
    candidates.push(...sourceCandidates)
  }

  const seen = new Set<string>()
  const unique = candidates.filter((candidate) => {
    const key = `${candidate.mailbox}:${candidate.messageId}:${candidate.attachmentId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  let imported = 0
  let skipped = 0
  let wouldImport = 0
  const seenHashes = new Set<string>()
  for (const candidate of unique) {
    const result = await importCandidate(modules, owner.id, candidate, args.apply, seenHashes)
    if (result.action === "import") imported += 1
    if (result.action === "skip") skipped += 1
    if (result.action === "would-import") wouldImport += 1
    console.log(JSON.stringify({ mailbox: candidate.mailbox, filename: candidate.filename, ...result }))
  }

  console.log(JSON.stringify({ apply: args.apply, candidates: unique.length, imported, skipped, wouldImport }))
  await modules.prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
