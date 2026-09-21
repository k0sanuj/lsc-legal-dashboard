/** Idempotent historical artifact backfill. Dry-run by default; --apply requires a durable local manifest path. */
import { createHash, randomUUID } from "node:crypto"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { prisma } from "../src/lib/prisma"
import { artifactResponse, boundedArtifactBytes, recordArtifact } from "../src/lib/document-artifacts"
import { isReconstructedTemplate } from "../src/lib/artifact-provenance"
import { MAX_DOCUMENT_FILE_BYTES } from "../src/lib/export-limits"
import { getS3KeyFromUrl, uploadBufferToS3 } from "../src/lib/s3"

interface Receipt { parent: "document" | "template"; parentId: string; source: string | null; stage: string; status: "planned" | "recorded" | "missing" | "failed" | "existing"; artifactId?: string; sha256?: string; detail?: string }
const args = process.argv.slice(2)
const apply = args.includes("--apply")
const manifestArg = args.indexOf("--manifest")
const manifestPath = manifestArg >= 0 && args[manifestArg + 1] ? resolve(args[manifestArg + 1]) : null
const runId = randomUUID()
const receipts: Receipt[] = []
const reportKey = `backfills/document-artifacts/${runId}/manifest.json`
const startedAt = new Date().toISOString()

async function persistReport(finished = false) {
  const body = JSON.stringify({ runId, startedAt, updatedAt: new Date().toISOString(), finished, mode: apply ? "apply" : "dry-run", reportKey: apply ? reportKey : null, receipts }, null, 2)
  if (manifestPath) {
    await mkdir(dirname(manifestPath), { recursive: true })
    await writeFile(`${manifestPath}.tmp`, body, { mode: 0o600 })
    await rename(`${manifestPath}.tmp`, manifestPath)
  }
  // Each completed source has a private GCS receipt. If receipt persistence fails,
  // stop; deterministic artifact IDs make a later rerun safe.
  if (apply) {
    // GCS limits repeated replacement of one object. Each checkpoint is immutable;
    // the final manifest is written once after every source has a durable receipt.
    const key = finished ? reportKey : reportKey.replace("manifest.json", `checkpoints/${receipts.length}.json`)
    await uploadBufferToS3(Buffer.from(body), key, "application/json")
  }
}

function originalName(url: string, fallback: string) {
  try { return decodeURIComponent(new URL(url).pathname.split("/").pop() || fallback) }
  catch { return fallback }
}

async function main() {
  if (apply && !manifestPath) throw new Error("--apply requires --manifest /durable/path/manifest.json")
  if (apply && (!process.env.GCS_BUCKET_NAME || !process.env.GCS_HMAC_ACCESS_ID || !process.env.GCS_HMAC_SECRET)) throw new Error("Configured private GCS storage is required for files and the durable receipt")
  const documents = await prisma.legalDocument.findMany({ include: { versions: true } })
  const templates = await prisma.contractTemplate.findMany({ include: { artifacts: true } })
  await persistReport()
  for (const document of documents) {
    const sources = new Map<string, { stage: "populated" | "signed"; evidence: string }>()
    for (const version of document.versions) {
      if (!version.file_url) continue
      const signed = version.created_by === "opensign" && document.signature_status === "SIGNED" && Boolean(document.signature_completed_at)
      const existing = sources.get(version.file_url)
      if (!existing || signed) sources.set(version.file_url, { stage: signed ? "signed" : "populated", evidence: signed ? `OpenSign-authored version ${version.id} and document completion timestamp` : `Historical version ${version.id}; signature provenance not established` })
    }
    if (document.file_url && !sources.has(document.file_url)) sources.set(document.file_url, { stage: "populated", evidence: "Existing document file; signature provenance not established" })
    if (!sources.size) {
      receipts.push({ parent: "document", parentId: document.id, source: null, stage: "populated", status: "missing", detail: "No existing file URL; no original bytes reconstructed" })
      await persistReport()
    }
    for (const [url, source] of sources) {
      const receipt: Receipt = { parent: "document", parentId: document.id, source: url, stage: source.stage, status: "planned", detail: source.evidence }
      if (!getS3KeyFromUrl(url)) { receipt.status = "missing"; receipt.detail = "Outside configured GCS, including retired AWS files; source recovery required" }
      else if (apply) {
        try {
          const response = await artifactResponse(url)
          const bytes = await boundedArtifactBytes(response)
          const artifact = await recordArtifact({ documentId: document.id, stage: source.stage, fileUrl: url, originalName: originalName(url, `${document.id}.bin`), mimeType: response.headers.get("content-type") ?? "application/octet-stream", bytes, actorId: "system:legacy-artifact-backfill", provenance: { kind: "legacy_original_bytes", preservesOriginal: true, evidence: source.evidence }, finalized: source.stage === "signed", ...(source.stage === "signed" && document.signature_source_artifact_id ? { sourceArtifactId: document.signature_source_artifact_id } : {}) })
          Object.assign(receipt, { status: "recorded", artifactId: artifact.id, sha256: artifact.sha256 })
        } catch (error) { receipt.status = "failed"; receipt.detail = error instanceof Error ? error.message : "Backfill failed" }
      }
      receipts.push(receipt)
      await persistReport()
    }
  }
  for (const template of templates) {
    const existingOriginal = template.artifacts.some((artifact) => !isReconstructedTemplate(artifact.naming_metadata))
    if (existingOriginal) { receipts.push({ parent: "template", parentId: template.id, source: null, stage: "template", status: "existing", detail: "Template already has an uploaded original artifact" }); await persistReport(); continue }
    const receipt: Receipt = { parent: "template", parentId: template.id, source: "ContractTemplate.content", stage: "template", status: "planned", detail: "Reconstructed UTF-8 text only; original binary and formatting are unavailable. Not finalized." }
    if (!template.content) { receipt.status = "missing"; receipt.detail = "No saved template content or original binary" }
    else if (apply) {
      try {
        const bytes = Buffer.from(template.content, "utf8")
        if (bytes.length > MAX_DOCUMENT_FILE_BYTES) throw new Error("Template text exceeds the 25 MiB worker limit")
        const hash = createHash("sha256").update(bytes).digest("hex")
        const name = `template-content-${template.id}.txt`
        const url = await uploadBufferToS3(bytes, `templates/legacy/${template.id}/${hash}/${name}`, "text/plain; charset=utf-8")
        const artifact = await recordArtifact({ templateId: template.id, stage: "template", fileUrl: url, originalName: name, mimeType: "text/plain; charset=utf-8", bytes, actorId: "system:legacy-artifact-backfill", provenance: { kind: "legacy_template_text_reconstruction", preservesOriginal: false, source: "ContractTemplate.content", templateVersion: template.version } })
        Object.assign(receipt, { status: "recorded", artifactId: artifact.id, sha256: artifact.sha256 })
      } catch (error) { receipt.status = "failed"; receipt.detail = error instanceof Error ? error.message : "Template reconstruction failed" }
    }
    receipts.push(receipt)
    await persistReport()
  }
  await persistReport(true)
  const counts = Object.fromEntries(["planned", "recorded", "missing", "failed", "existing"].map((status) => [status, receipts.filter((receipt) => receipt.status === status).length]))
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", counts, manifestPath, privateReportKey: apply ? reportKey : null }))
  if (receipts.some((receipt) => receipt.status === "failed")) process.exitCode = 2
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Artifact backfill failed"); process.exitCode = 1 }).finally(() => prisma.$disconnect())
