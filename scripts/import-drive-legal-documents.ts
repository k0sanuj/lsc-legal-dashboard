import { createHash } from "node:crypto"
import { config } from "dotenv"
import { google } from "googleapis"
import type { GoogleAuth } from "google-auth-library"
import type { drive_v3 } from "googleapis"

config({ path: ".env" })
config({ path: ".env.local", override: true })

type ImportedModules = {
  prisma: typeof import("../src/lib/prisma").prisma
  uploadBufferToS3: typeof import("../src/lib/s3").uploadBufferToS3
  getS3Key: typeof import("../src/lib/s3").getS3Key
  extractTextFromFile: typeof import("../src/lib/extract-text").extractTextFromFile
  runAgent: typeof import("../src/lib/agents/orchestrator").runAgent
}

type DriveCandidate = {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedTime: string
  webViewLink: string
  parentPath: string
}

type ExistingDocument = {
  id: string
  title: string
  notes: string | null
  file_url: string | null
}

type ExistingIndex = {
  byDriveId: Map<string, ExistingDocument>
  byHash: Map<string, ExistingDocument>
  byTitle: Map<string, ExistingDocument>
}

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024
const GOOGLE_API_TIMEOUT_MS = 30_000
const OWNER_EMAILS = ["anuj@leaguesports.co", "anuj@leaguesportsco.com"]
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document"
const GOOGLE_DOCX_EXPORT_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

const ALLOWED_BINARY_EXTENSIONS = /\.(pdf|docx?|rtf|txt)$/i
const ALLOWED_BINARY_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/rtf",
  "text/plain",
  GOOGLE_DOCX_EXPORT_MIME,
])

const DEFAULT_LEGAL_FOLDER_NAME_TERMS = ["Legal", "legal"]

const LEGAL_KEYWORDS = [
  "addendum",
  "agreement",
  "certificate",
  "consultancy",
  "contract",
  "docusign",
  "employment",
  "executed",
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
  "retainer",
  "retainership",
  "settlement",
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
  "address proof",
  "bank statement",
  "boarding pass",
  "cover letter",
  "flight",
  "hotel",
  "incorrect",
  "invoice",
  "passport",
  "receipt",
  "travel advice",
  "upload file guide",
  "visa",
]

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = new Set(args)
  return {
    apply: flags.has("--apply"),
    allLegalFolders: flags.has("--all-legal-folders") || !args.some((arg) => arg.startsWith("--folder-id=")),
    folderIds: args
      .filter((arg) => arg.startsWith("--folder-id="))
      .map((arg) => arg.split("=")[1])
      .filter(Boolean),
    limit: Number(args.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 500),
    offset: Number(args.find((arg) => arg.startsWith("--offset="))?.split("=")[1] ?? 0),
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

function isDownloadableLegalFile(file: DriveCandidate): boolean {
  if (file.size > MAX_UPLOAD_BYTES) return false
  if (hasAnyKeyword(`${file.name} ${file.parentPath}`, EXCLUDED_KEYWORDS)) return false
  if (file.mimeType === GOOGLE_DOC_MIME) {
    return hasAnyKeyword(`${file.name} ${file.parentPath}`, LEGAL_KEYWORDS)
  }
  if (!ALLOWED_BINARY_MIME_TYPES.has(file.mimeType) && !ALLOWED_BINARY_EXTENSIONS.test(file.name)) {
    return false
  }
  return hasAnyKeyword(`${file.name} ${file.parentPath}`, LEGAL_KEYWORDS)
}

function inferEntity(text: string) {
  const normalized = normalizeText(text)
  if (normalized.includes("team blue rising") || normalized.includes("tbr") || normalized.includes(" e1 ")) {
    return "TBR"
  }
  if (
    normalized.includes("future of sports") ||
    normalized.includes("fsp") ||
    normalized.includes("fsp labs")
  ) {
    return "FSP"
  }
  if (normalized.includes("xtz") || normalized.includes("esports")) return "XTZ"
  if (normalized.includes("xte")) return "XTE"
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
  if (
    normalized.includes("employment") ||
    normalized.includes("pilot") ||
    normalized.includes("mechanic") ||
    normalized.includes("retainership") ||
    normalized.includes("retainer")
  ) {
    return "EMPLOYMENT"
  }
  if (normalized.includes("token grant") || normalized.includes("pro rata") || normalized.includes("side letter")) {
    return "ESOP"
  }
  if (normalized.includes("consultancy") || normalized.includes("contractor")) return "CONTRACTOR"
  if (normalized.includes("terms of service")) return "TERMS_OF_SERVICE"
  if (normalized.includes("policy")) return "POLICY"
  return "OTHER"
}

function inferStatus(text: string) {
  const normalized = normalizeText(text)
  if (
    normalized.includes("complete with docusign") ||
    normalized.includes("completed") ||
    normalized.includes("executed") ||
    normalized.includes("signed")
  ) {
    return "SIGNED"
  }
  if (normalized.includes("reviewed") || normalized.includes("comments") || normalized.includes("revised")) {
    return "IN_REVIEW"
  }
  return "DRAFT"
}

function contentTypeFor(file: DriveCandidate): string {
  if (file.mimeType === GOOGLE_DOC_MIME) return GOOGLE_DOCX_EXPORT_MIME
  if (file.mimeType && file.mimeType !== "application/octet-stream") return file.mimeType
  const lower = file.name.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".docx")) return GOOGLE_DOCX_EXPORT_MIME
  if (lower.endsWith(".doc")) return "application/msword"
  if (lower.endsWith(".rtf")) return "application/rtf"
  if (lower.endsWith(".txt")) return "text/plain"
  return "application/octet-stream"
}

function filenameFor(file: DriveCandidate): string {
  if (file.mimeType === GOOGLE_DOC_MIME) return `${file.name}.docx`
  return file.name
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)
  return arrayBuffer
}

function isRetryableError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return (
    text.includes("EHOSTUNREACH") ||
    text.includes("ECONNRESET") ||
    text.includes("ETIMEDOUT") ||
    text.includes("fetch failed") ||
    text.includes("socket hang up")
  )
}

async function withRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isRetryableError(error) || attempt === 3) break
      console.warn(JSON.stringify({ action: "retry", label, attempt, reason: error instanceof Error ? error.message : String(error) }))
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
    }
  }
  throw lastError
}

async function driveClient() {
  const auth = new google.auth.GoogleAuth({ scopes: [DRIVE_READONLY_SCOPE] })
  return { drive: google.drive({ version: "v3", auth }), auth }
}

async function listAllFiles(
  drive: drive_v3.Drive,
  q: string,
  fields = "nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,parents,shortcutDetails)"
) {
  const files: drive_v3.Schema$File[] = []
  let pageToken: string | undefined
  do {
    const response = await drive.files.list(
      {
        q,
        corpora: "allDrives",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 100,
        pageToken,
        fields,
      },
      { timeout: GOOGLE_API_TIMEOUT_MS }
    )
    files.push(...(response.data.files ?? []))
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)
  return files
}

async function findLegalFolderIds(drive: drive_v3.Drive) {
  const folderIds = new Set<string>()
  for (const term of DEFAULT_LEGAL_FOLDER_NAME_TERMS) {
    const folders = await listAllFiles(
      drive,
      `mimeType='application/vnd.google-apps.folder' and trashed=false and name contains '${term}'`
    )
    for (const folder of folders) {
      if (folder.id) folderIds.add(folder.id)
    }
  }
  return [...folderIds]
}

async function collectFolderCandidates(
  drive: drive_v3.Drive,
  folderIds: string[],
  limit: number
) {
  const candidates: DriveCandidate[] = []
  const queue = folderIds.map((id) => ({ id, path: "Drive Legal Folder" }))
  const visitedFolders = new Set<string>()

  while (queue.length && candidates.length < limit) {
    const folder = queue.shift()
    if (!folder || visitedFolders.has(folder.id)) continue
    visitedFolders.add(folder.id)

    const children = await listAllFiles(drive, `'${folder.id}' in parents and trashed=false`)
    for (const child of children) {
      if (!child.id || !child.name || !child.mimeType) continue
      const childPath = `${folder.path}/${child.name}`

      if (child.mimeType === "application/vnd.google-apps.folder") {
        queue.push({ id: child.id, path: childPath })
        continue
      }

      if (child.mimeType === "application/vnd.google-apps.shortcut" && child.shortcutDetails?.targetId) {
        try {
          const target = await drive.files.get(
            {
              fileId: child.shortcutDetails.targetId,
              supportsAllDrives: true,
              fields: "id,name,mimeType,size,modifiedTime,webViewLink,parents",
            },
            { timeout: GOOGLE_API_TIMEOUT_MS }
          )
          if (target.data.id && target.data.name && target.data.mimeType) {
            const candidate = toCandidate(target.data, childPath)
            if (candidate && isDownloadableLegalFile(candidate)) candidates.push(candidate)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown shortcut error"
          console.warn(JSON.stringify({
            action: "skip-shortcut",
            shortcutId: child.id,
            shortcutName: child.name,
            targetId: child.shortcutDetails.targetId,
            reason: message,
          }))
        }
        continue
      }

      const candidate = toCandidate(child, folder.path)
      if (candidate && isDownloadableLegalFile(candidate)) candidates.push(candidate)
      if (candidates.length >= limit) break
    }
  }

  return candidates.slice(0, limit)
}

function toCandidate(file: drive_v3.Schema$File, parentPath: string): DriveCandidate | null {
  if (!file.id || !file.name || !file.mimeType) return null
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: Number(file.size ?? 0),
    modifiedTime: file.modifiedTime ?? "",
    webViewLink: file.webViewLink ?? "",
    parentPath,
  }
}

async function downloadDriveFile(
  auth: GoogleAuth,
  file: DriveCandidate
): Promise<Buffer> {
  const client = await auth.getClient()
  const accessToken = await client.getAccessToken()
  const token = typeof accessToken === "string" ? accessToken : accessToken?.token
  if (!token) throw new Error("Could not get Drive access token")

  const url =
    file.mimeType === GOOGLE_DOC_MIME
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(GOOGLE_DOCX_EXPORT_MIME)}`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Drive download failed for ${file.id}: ${response.status} ${response.statusText}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

function extractSourceHash(notes: string | null): string | null {
  return notes?.match(/sourceHash:([a-f0-9]{64})/)?.[1] ?? null
}

function extractDriveFileId(notes: string | null): string | null {
  return notes?.match(/source:drive:([^\s]+)/)?.[1] ?? null
}

async function buildExistingIndex(prisma: ImportedModules["prisma"]): Promise<ExistingIndex> {
  const documents = await prisma.legalDocument.findMany({
    select: { id: true, title: true, notes: true, file_url: true },
  })
  const index: ExistingIndex = {
    byDriveId: new Map(),
    byHash: new Map(),
    byTitle: new Map(),
  }

  for (const document of documents) {
    const driveFileId = extractDriveFileId(document.notes)
    if (driveFileId) index.byDriveId.set(driveFileId, document)

    const sourceHash = extractSourceHash(document.notes)
    if (sourceHash) index.byHash.set(sourceHash, document)

    if (document.file_url) index.byTitle.set(normalizeText(document.title), document)
  }

  return index
}

function sourceAlreadyImported(
  existingIndex: ExistingIndex,
  sourceHash: string,
  driveFileId: string,
  title: string
) {
  return (
    existingIndex.byDriveId.get(driveFileId) ??
    existingIndex.byHash.get(sourceHash) ??
    existingIndex.byTitle.get(normalizeText(title)) ??
    null
  )
}

function rememberImported(
  existingIndex: ExistingIndex,
  document: ExistingDocument,
  sourceHash: string,
  driveFileId: string
) {
  existingIndex.byDriveId.set(driveFileId, document)
  existingIndex.byHash.set(sourceHash, document)
  existingIndex.byTitle.set(normalizeText(document.title), document)
}

async function importCandidate(
  modules: ImportedModules,
  drive: drive_v3.Drive,
  auth: GoogleAuth,
  ownerId: string,
  candidate: DriveCandidate,
  apply: boolean,
  seenHashes: Set<string>,
  existingIndex: ExistingIndex
) {
  const sourceFilename = filenameFor(candidate)
  const title = cleanTitle(sourceFilename)

  const existingByDriveOrTitle =
    existingIndex.byDriveId.get(candidate.id) ?? existingIndex.byTitle.get(normalizeText(title))
  if (existingByDriveOrTitle) {
    return { action: "skip", title, reason: `already imported as ${existingByDriveOrTitle.id}` }
  }

  const context = `${candidate.name} ${candidate.parentPath}`
  const entity = inferEntity(context)
  const category = inferCategory(context)
  const lifecycleStatus = inferStatus(context)

  if (!apply) {
    return { action: "would-import", title, entity, category, lifecycleStatus, bytes: candidate.size }
  }

  const buffer = await downloadDriveFile(auth, candidate)
  const sourceHash = createHash("sha256").update(buffer).digest("hex")
  if (seenHashes.has(sourceHash)) {
    return { action: "skip", title, reason: "duplicate file hash in this import run" }
  }
  const existing = sourceAlreadyImported(existingIndex, sourceHash, candidate.id, title)
  if (existing) {
    return { action: "skip", title, reason: `already imported as ${existing.id}` }
  }
  seenHashes.add(sourceHash)

  const contentType = contentTypeFor(candidate)

  const key = modules.getS3Key(entity, category, sourceFilename)
  const fileUrl = await modules.uploadBufferToS3(buffer, key, contentType)
  const file = new File([bufferToArrayBuffer(buffer)], sourceFilename, { type: contentType })
  const extractedText = await modules.extractTextFromFile(file)
  const sourceMarker = [`source:drive:${candidate.id}`, `sourceHash:${sourceHash}`].join("\n")
  const notes = [
    sourceMarker,
    "Imported from Google Drive",
    `Drive path: ${candidate.parentPath}`,
    `Drive link: ${candidate.webViewLink}`,
    `Drive modified: ${candidate.modifiedTime}`,
    extractedText ? `Extracted preview:\n${extractedText.slice(0, 4000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  const { document, versionId } = await modules.prisma.$transaction(async (tx) => {
    const created = await tx.legalDocument.create({
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

    const version = await tx.documentVersion.create({
      data: {
        document_id: created.id,
        version_number: 1,
        file_url: fileUrl,
        change_summary: "Initial Google Drive import",
        created_by: ownerId,
      },
    })

    await tx.lifecycleEvent.create({
      data: {
        document_id: created.id,
        from_status: "DRAFT",
        to_status: lifecycleStatus as never,
        transitioned_by: ownerId,
        notes: `Imported from Google Drive file: ${candidate.name}`,
      },
    })

    return { document: created, versionId: version.id }
  })

  const analysisContent = extractedText.trim() || notes
  if (analysisContent.trim()) {
    await modules.runAgent("agreement-analyzer", {
      documentId: document.id,
      versionId,
      sourceType: "drive_import",
      sourceLabel: candidate.name,
      content: analysisContent,
    })
  }
  rememberImported(existingIndex, document, sourceHash, candidate.id)

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
  const existingIndex = await buildExistingIndex(modules.prisma)

  const { drive, auth } = await driveClient()
  const folderIds = args.allLegalFolders ? await findLegalFolderIds(drive) : args.folderIds
  console.log(JSON.stringify({ legalFolderCount: folderIds.length, folderIds }))

  const allCandidates = await collectFolderCandidates(drive, folderIds, args.limit + args.offset)
  const candidates = allCandidates.slice(args.offset, args.offset + args.limit)
  console.log(`${candidates.length} Drive legal document candidate(s) from offset ${args.offset}`)

  let imported = 0
  let skipped = 0
  let wouldImport = 0
  const seenHashes = new Set<string>()

  for (const candidate of candidates) {
    let result
    try {
      result = await withRetry(
        `import:${candidate.id}:${candidate.name}`,
        () => importCandidate(modules, drive, auth, owner.id, candidate, args.apply, seenHashes, existingIndex)
      )
    } catch (error) {
      skipped += 1
      console.error(JSON.stringify({
        driveFileId: candidate.id,
        filename: candidate.name,
        path: candidate.parentPath,
        action: "error",
        reason: error instanceof Error ? error.message : String(error),
      }))
      continue
    }
    if (result.action === "import") imported += 1
    if (result.action === "skip") skipped += 1
    if (result.action === "would-import") wouldImport += 1
    console.log(JSON.stringify({
      driveFileId: candidate.id,
      filename: candidate.name,
      path: candidate.parentPath,
      ...result,
    }))
  }

  console.log(JSON.stringify({ apply: args.apply, candidates: candidates.length, imported, skipped, wouldImport }))
  await modules.prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
