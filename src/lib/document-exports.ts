/** Durable, permission-scoped document exports. A separate worker performs file I/O, never the request. */
import { createHash, randomUUID } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdtemp, open, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { createGzip } from "node:zlib"
import { prisma } from "@/lib/prisma"
import { isReconstructedTemplate } from "@/lib/artifact-provenance"
import { artifactResponse } from "@/lib/document-artifacts"
import { documentScope, isGlobalDocumentUser } from "@/lib/document-access"
import { uploadLocalFileToS3 } from "@/lib/s3"
import { MAX_DOCUMENT_FILE_BYTES, MAX_EXPORT_TAR_BYTES, EXPORT_MANIFEST_RESERVE_BYTES, MAX_EXPORT_ITEMS } from "@/lib/export-limits"
import { appendTarFile, appendTarText, finishTar } from "@/lib/tar-archive"
import type { SessionPayload } from "@/lib/session"

interface ExportItem { id: string; documentId: string | null; stage: string; name: string; url: string | null; sha256: string | null; content?: string; missingReason?: string }
interface Snapshot { at: string; global: boolean; documents: string[]; items: ExportItem[] }
interface ExportEntry { id: string; stage: string; name: string; path: string | null; sha256: string | null; bytes: number | null; error: string | null }
export interface ExportIO {
  read: typeof artifactResponse
  upload: typeof uploadLocalFileToS3
}
const defaultIO: ExportIO = { read: artifactResponse, upload: uploadLocalFileToS3 }

function snapshotFrom(value: unknown): Snapshot {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items) || !("documents" in value) || !Array.isArray(value.documents)) throw new Error("Invalid export snapshot")
  return value as Snapshot
}

export async function queueDocumentExport(session: SessionPayload) {
  const scope = await documentScope(session)
  const global = await isGlobalDocumentUser(session)
  const documents = await prisma.legalDocument.findMany({ where: scope, include: { versions: true, artifacts: true } })
  const items: ExportItem[] = []
  for (const doc of documents) {
    const urls = new Set<string>()
    if (doc.signature_provider === "opensign" && doc.signature_status === "SIGNED" && doc.signature_completed_at && !doc.artifacts.some((artifact) => artifact.stage === "certificate")) items.push({ id: `certificate-${doc.id}`, documentId: doc.id, stage: "certificate", name: `${doc.title} completion certificate`, url: null, sha256: null, missingReason: doc.signature_certificate_error ?? "OpenSign completion certificate has not been preserved; provider availability is unverified" })
    for (const artifact of doc.artifacts) {
      urls.add(artifact.file_url)
      items.push({ id: artifact.id, documentId: doc.id, stage: artifact.stage, name: artifact.approved_name ?? artifact.original_name, url: artifact.file_url, sha256: artifact.sha256 })
    }
    for (const version of doc.versions) {
      if (version.file_url && urls.has(version.file_url)) continue
      if (version.file_url) urls.add(version.file_url)
      items.push({ id: version.id, documentId: doc.id, stage: "history", name: `${doc.title} (internal version ${version.version_number})`, url: version.file_url, sha256: null })
    }
    if (!doc.file_url || !urls.has(doc.file_url)) items.push({ id: doc.id, documentId: doc.id, stage: "legacy", name: doc.title, url: doc.file_url, sha256: null })
    items.push({ id: `metadata-${doc.id}`, documentId: doc.id, stage: "metadata", name: `${doc.title} metadata`, url: null, sha256: null, content: JSON.stringify({ id: doc.id, title: doc.title, entity: doc.entity, category: doc.category, status: doc.lifecycle_status, value: doc.value?.toString() ?? null, currency: doc.currency, notes: doc.notes, counterparty: doc.counterparty, createdAt: doc.created_at.toISOString() }, null, 2) })
  }
  if (global) {
    const templates = await prisma.contractTemplate.findMany({ include: { artifacts: true } })
    for (const template of templates) {
      for (const artifact of template.artifacts) items.push({ id: artifact.id, documentId: null, stage: "template", name: artifact.approved_name ?? artifact.original_name, url: artifact.file_url, sha256: artifact.sha256 })
      if (!template.artifacts.some((artifact) => !isReconstructedTemplate(artifact.naming_metadata))) items.push({ id: template.id, documentId: null, stage: "template", name: template.name, url: null, sha256: null })
      items.push({ id: `text-${template.id}`, documentId: null, stage: "metadata", name: `${template.name} text and variables`, url: null, sha256: null, content: JSON.stringify({ id: template.id, name: template.name, content: template.content, variables: template.variables, version: template.version }, null, 2) })
    }
    const [kyc, matters, policies, auditFiles] = await Promise.all([
      prisma.kycDocument.findMany({ where: { file_url: { not: null } }, select: { id: true, document_name: true, file_url: true } }),
      prisma.litigationDocument.findMany({ where: { file_url: { not: null } }, select: { id: true, title: true, file_url: true } }),
      prisma.policyDocument.findMany({ where: { file_url: { not: null } }, select: { id: true, title: true, file_url: true } }),
      prisma.auditDocument.findMany({ select: { id: true, file_type: true, file_url: true } }),
    ])
    for (const file of kyc) items.push({ id: file.id, documentId: null, stage: "kyc", name: file.document_name, url: file.file_url, sha256: null })
    for (const file of matters) items.push({ id: file.id, documentId: null, stage: "matters", name: file.title, url: file.file_url, sha256: null })
    for (const file of policies) items.push({ id: file.id, documentId: null, stage: "policies", name: file.title, url: file.file_url, sha256: null })
    for (const file of auditFiles) items.push({ id: file.id, documentId: null, stage: "audit", name: file.file_type, url: file.file_url, sha256: null })
  }
  if (items.length > MAX_EXPORT_ITEMS) throw new Error("Export inventory exceeds 10,000 files; request a scoped export")
  const snapshot: Snapshot = { at: new Date().toISOString(), global, documents: documents.map((doc) => doc.id), items }
  return prisma.documentExport.create({ data: { requested_by: session.userId, snapshot: JSON.parse(JSON.stringify(snapshot)) } })
}

export async function listDocumentExports(session: SessionPayload) {
  return prisma.documentExport.findMany({ where: { requested_by: session.userId }, orderBy: { created_at: "desc" }, take: 24 })
}

/** Month-level verification is queried independently of the recent-jobs display limit. */
export async function monthlyExportReceipt(session: SessionPayload, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return prisma.documentExport.findFirst({ where: { requested_by: session.userId, status: "complete", created_at: { gte: start, lt: end }, verified_at: { gte: start, lt: end } }, orderBy: { verified_at: "desc" } })
}

export async function requireExportAccess(session: SessionPayload, snapshotValue: unknown) {
  const snapshot = snapshotFrom(snapshotValue)
  if (snapshot.global && !await isGlobalDocumentUser(session)) throw new Error("Global export access was revoked")
  const scope = await documentScope(session)
  const accessible = await prisma.legalDocument.count({ where: { AND: [scope, { id: { in: snapshot.documents } }] } })
  if (accessible !== snapshot.documents.length) throw new Error("Document access changed; request a fresh export")
  return snapshot
}

async function processExport(id: string, io: ExportIO) {
  const job = await prisma.documentExport.findUniqueOrThrow({ where: { id } })
  const user = await prisma.appUser.findUnique({ where: { id: job.requested_by } })
  if (!user?.is_active) throw new Error("Requester is inactive")
  const session: SessionPayload = { userId: user.id, email: user.email, fullName: user.full_name, role: user.role, exp: Date.now() + 3600000 }
  const snapshot = await requireExportAccess(session, job.snapshot)
  if (snapshot.items.length > MAX_EXPORT_ITEMS) throw new Error("Export inventory exceeds 10,000 files")
  const directory = await mkdtemp(join(tmpdir(), "legal-export-"))
  const tarPath = join(directory, "documents.tar")
  const archive = await open(tarPath, "w")
  const entries: ExportEntry[] = []
  let tarBytes = 0
  try {
    for (const item of snapshot.items) {
      const entry: ExportEntry = { id: item.id, stage: item.stage, name: item.name, path: null, sha256: null, bytes: null, error: null }
      const local = join(directory, randomUUID())
      try {
        const hash = createHash("sha256")
        const available = Math.min(MAX_DOCUMENT_FILE_BYTES, MAX_EXPORT_TAR_BYTES - EXPORT_MANIFEST_RESERVE_BYTES - tarBytes - 1024)
        if (available <= 0) throw new Error("Archive reached the 512 MiB resource limit; remaining files require a scoped export")
        if (item.content !== undefined) {
          if (Buffer.byteLength(item.content) > available) throw new Error("Metadata exceeds the export resource budget")
          await writeFile(local, item.content)
          hash.update(item.content)
        } else {
          if (!item.url) throw new Error(item.missingReason ?? "Source file missing; metadata alone is not a complete backup")
          const response = await io.read(item.url)
          if (Number(response.headers.get("content-length") ?? 0) > available) { await response.body?.cancel(); throw new Error("Source exceeds the 25 MiB file or 512 MiB archive limit") }
          if (!response.body) throw new Error("Source response has no bytes")
          let received = 0
          const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
            received += chunk.length
            if (received > available) { callback(new Error("Source exceeds the 25 MiB file or 512 MiB archive limit")); return }
            hash.update(chunk); callback(null, chunk)
          } })
          await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), limit, createWriteStream(local))
        }
        entry.sha256 = hash.digest("hex")
        if (item.sha256 && item.sha256 !== entry.sha256) throw new Error("Stored file hash differs from the snapshot")
        entry.bytes = (await stat(local)).size
        const sourceExtension = (item.name.includes(".") ? item.name : item.url ? new URL(item.url).pathname : "").split(".").pop()?.toLowerCase()
        const extension = sourceExtension && /^[a-z0-9]{1,10}$/.test(sourceExtension) ? sourceExtension : "bin"
        entry.path = `${item.stage}/${item.id}.${item.content !== undefined ? "json" : extension}`
        await appendTarFile(archive, entry.path, local, entry.bytes, new Date(snapshot.at))
        tarBytes += 512 + Math.ceil(entry.bytes / 512) * 512
      } catch (error) {
        entry.path = null
        entry.error = error instanceof Error ? error.message : "File export failed"
      } finally { await rm(local, { force: true }) }
      entries.push(entry)
      await prisma.documentExport.update({ where: { id }, data: { lease_until: new Date(Date.now() + 10 * 60000) } })
    }
    const failures = entries.filter((entry) => entry.error).length
    const manifest = { snapshotAt: snapshot.at, expected: snapshot.items.length, exported: entries.length - failures, missing: failures, entries }
    const manifestText = JSON.stringify(manifest, null, 2)
    if (Buffer.byteLength(manifestText) + 2048 > EXPORT_MANIFEST_RESERVE_BYTES) throw new Error("Manifest exceeds the export resource budget")
    await appendTarText(archive, "manifest.json", manifestText, new Date(snapshot.at))
    await finishTar(archive)
    await archive.close()
    const gzipPath = join(directory, "documents.tar.gz")
    await pipeline(createReadStream(tarPath), createGzip(), createWriteStream(gzipPath))
    // Re-check grants after slow I/O and before publishing the result.
    await requireExportAccess(session, job.snapshot)
    const url = await io.upload(gzipPath, `exports/${job.requested_by}/${id}.tar.gz`, "application/gzip")
    await prisma.documentExport.update({ where: { id }, data: { status: failures ? "partial" : "complete", manifest: JSON.parse(JSON.stringify(manifest)), archive_url: url, completed_at: failures ? null : new Date(), expires_at: new Date(Date.now() + 86400000), lease_until: null, error: failures ? `${failures} source file(s) unavailable; export is incomplete` : null } })
  } finally {
    await archive.close().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
}

/** Worker claims with compare-and-set. Expired leases are retryable after process interruption. */
export async function runPendingDocumentExports(limit = 2, io: ExportIO = defaultIO, onlyJobId?: string) {
  const now = new Date()
  const jobs = await prisma.documentExport.findMany({ where: { ...(onlyJobId ? { id: onlyJobId } : {}), OR: [{ status: "queued" }, { status: "processing", lease_until: { lt: now } }] }, orderBy: { created_at: "asc" }, take: limit })
  for (const job of jobs) {
    const claimed = await prisma.documentExport.updateMany({ where: { id: job.id, status: job.status, lease_until: job.lease_until }, data: { status: "processing", lease_until: new Date(Date.now() + 10 * 60000), error: null } })
    if (!claimed.count) continue
    try { await processExport(job.id, io) }
    catch (error) { await prisma.documentExport.update({ where: { id: job.id }, data: { status: "failed", lease_until: null, error: error instanceof Error ? error.message : "Export failed" } }) }
  }
  return jobs.length
}
