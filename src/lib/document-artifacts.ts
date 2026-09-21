/** Immutable document bytes and explicit template/populated/signed lineage. */
import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
import { MAX_DOCUMENT_FILE_BYTES } from "@/lib/export-limits"
import { getPresignedUrl, getS3KeyFromUrl } from "@/lib/s3"

export interface RecordArtifactInput {
  documentId?: string
  templateId?: string
  sourceArtifactId?: string
  stage: "template" | "populated" | "signed" | "certificate"
  fileUrl: string
  originalName: string
  mimeType: string
  bytes: Buffer
  actorId: string
  signerScope?: string[]
  deliverableScope?: string
  finalized?: boolean
  provenance?: Prisma.InputJsonObject
}

export async function recordArtifact(input: RecordArtifactInput, db: Prisma.TransactionClient = prisma) {
  if (Boolean(input.documentId) === Boolean(input.templateId)) throw new Error("Artifact requires exactly one document or template parent")
  if (input.stage === "template" && !input.templateId) throw new Error("Template artifact requires a template")
  if (input.stage !== "template" && !input.documentId) throw new Error("Agreement artifact requires a document")
  if (input.sourceArtifactId) {
    const source = await db.documentArtifact.findUniqueOrThrow({ where: { id: input.sourceArtifactId } })
    if (input.stage === "populated" && source.stage !== "template") throw new Error("Populated source must be a template")
    if (input.stage === "certificate" && (source.stage !== "signed" || source.document_id !== input.documentId)) throw new Error("Certificate source must be this agreement's signed artifact")
    if (input.stage === "signed" && (source.stage !== "populated" || source.document_id !== input.documentId)) throw new Error("Signed source must be this agreement's populated artifact")
  }
  if (input.stage === "signed" || input.stage === "certificate") {
    const doc = await db.legalDocument.findUniqueOrThrow({ where: { id: input.documentId } })
    if (!doc.signature_completed_at || doc.signature_status !== "SIGNED") throw new Error("Completed signature evidence is required")
  }
  const hash = createHash("sha256").update(input.bytes).digest("hex")
  const signerScope = input.signerScope ? [...new Set(input.signerScope.map((value) => value.trim()).filter(Boolean))].sort() : null
  const identity = createHash("sha256").update(JSON.stringify({
    parent: input.documentId ?? input.templateId, stage: input.stage,
    source: input.sourceArtifactId ?? null, hash, signerScope,
    deliverableScope: input.deliverableScope ?? null, provenance: input.provenance ?? null,
  })).digest("hex")
  const id = `${identity.slice(0, 8)}-${identity.slice(8, 12)}-${identity.slice(12, 16)}-${identity.slice(16, 20)}-${identity.slice(20, 32)}`
  return db.documentArtifact.upsert({ where: { id }, update: {}, create: {
    id,
    document_id: input.documentId,
    template_id: input.templateId,
    source_artifact_id: input.sourceArtifactId,
    stage: input.stage,
    file_url: input.fileUrl,
    original_name: input.originalName,
    mime_type: input.mimeType || "application/octet-stream",
    sha256: hash,
    signer_scope: signerScope ?? undefined,
    deliverable_scope: input.deliverableScope,
    created_by: input.actorId,
    naming_metadata: input.provenance ? { provenance: input.provenance } : undefined,
    finalized_at: input.finalized ? new Date() : null,
    finalized_by: input.finalized ? input.actorId : null,
  } })
}

/** Only our configured storage is fetchable. Legacy remote URLs remain explicit missing artifacts. */
export async function artifactResponse(fileUrl: string) {
  const key = getS3KeyFromUrl(fileUrl)
  if (!key) throw new Error("File is outside configured GCS storage; migration or source verification is required")
  const response = await fetch(await getPresignedUrl(key), { signal: AbortSignal.timeout(60000), redirect: "error" })
  if (!response.ok || !response.body) throw new Error(`Stored file unavailable (${response.status})`)
  return response
}

/** Read a worker's small file with an enforced streaming limit, including unknown content length. */
export async function boundedArtifactBytes(response: Response, maxBytes = MAX_DOCUMENT_FILE_BYTES): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? 0)
  if (declared > maxBytes) { await response.body?.cancel(); throw new Error("Source exceeds the 25 MiB per-file worker limit") }
  if (!response.body) throw new Error("Source response has no bytes")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maxBytes) throw new Error("Source exceeds the 25 MiB per-file worker limit")
      chunks.push(chunk.value)
    }
    return Buffer.concat(chunks, size)
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
