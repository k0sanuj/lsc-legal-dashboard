/** Isolated-DB integration test. Synthetic fixtures only, and all storage I/O is injected locally. */
import assert from "node:assert/strict"
import { randomUUID, createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { prisma } from "../src/lib/prisma"
import { recordArtifact } from "../src/lib/document-artifacts"
import { queueDocumentExport, requireExportAccess, runPendingDocumentExports, type ExportIO } from "../src/lib/document-exports"
import type { SessionPayload } from "../src/lib/session"

async function main() {
  if (!new URL(process.env.DATABASE_URL ?? "").pathname.includes("legal_os_v2_verify_")) throw new Error("Run only against the isolated verification database")
  const suffix = randomUUID()
  const user = await prisma.appUser.create({ data: { full_name: "Synthetic Export Verification", email: `synthetic-export-${suffix}@example.test`, role: "TEAM_MEMBER", password_hash: "not-a-real-password" } })
  const session: SessionPayload = { userId: user.id, email: user.email, fullName: user.full_name, role: user.role, exp: Date.now() + 600000 }
  const docIds: string[] = []
  const jobs: string[] = []
  try {
    const doc = await prisma.legalDocument.create({ data: { title: `Synthetic V2 export ${suffix}`, entity: "LSC", category: "NDA", owner_id: user.id, currency: "USD", value: "100.01", file_url: "https://storage.example.test/synthetic" } })
    docIds.push(doc.id)
    const denied = await queueDocumentExport(session); jobs.push(denied.id)
    assert.equal((denied.snapshot as { documents: string[] }).documents.length, 0)
    await prisma.documentAccessGrant.create({ data: { user_id: user.id, document_id: doc.id, granted_by: "synthetic-verifier", expires_at: new Date(Date.now() + 3600000) } })
    const bytes = Buffer.from("Synthetic agreement bytes")
    const artifact = await recordArtifact({ documentId: doc.id, stage: "populated", fileUrl: doc.file_url!, originalName: "synthetic.docx", mimeType: "application/octet-stream", bytes, actorId: user.id })
    const duplicate = await recordArtifact({ documentId: doc.id, stage: "populated", fileUrl: doc.file_url!, originalName: "synthetic.docx", mimeType: "application/octet-stream", bytes, actorId: user.id })
    assert.equal(artifact.id, duplicate.id)
    const signingSource = await recordArtifact({ documentId: doc.id, stage: "populated", fileUrl: doc.file_url!, originalName: "synthetic.docx", mimeType: "application/octet-stream", bytes, actorId: user.id, signerScope: ["synthetic-signer@example.test"], finalized: true })
    assert.notEqual(signingSource.id, artifact.id)
    assert.deepEqual(signingSource.signer_scope, ["synthetic-signer@example.test"])
    await assert.rejects(recordArtifact({ documentId: doc.id, sourceArtifactId: artifact.id, stage: "signed", fileUrl: doc.file_url!, originalName: "synthetic.pdf", mimeType: "application/pdf", bytes, actorId: user.id }), /Completed signature evidence/)
    const job = await queueDocumentExport(session); jobs.push(job.id)
    let manifest: { expected: number; exported: number; missing: number; entries: { stage: string; sha256: string | null }[] } | null = null
    const io: ExportIO = {
      read: async () => new Response(bytes),
      upload: async (path) => { manifest = JSON.parse(execFileSync("tar", ["-xzOf", path, "manifest.json"], { encoding: "utf8" })); return "https://storage.example.test/archive" },
    }
    await runPendingDocumentExports(1, io, job.id)
    const result = await prisma.documentExport.findUniqueOrThrow({ where: { id: job.id } })
    assert.equal(result.status, "complete")
    assert.ok(manifest)
    const checked = manifest as { missing: number; entries: { stage: string; sha256: string | null }[] }
    assert.equal(checked.missing, 0)
    assert.equal(checked.entries.find((entry) => entry.stage === "populated")?.sha256, createHash("sha256").update(bytes).digest("hex"))
    const partial = await queueDocumentExport(session); jobs.push(partial.id)
    await runPendingDocumentExports(1, { ...io, read: async () => { throw new Error("Synthetic source unavailable") } }, partial.id)
    const incomplete = await prisma.documentExport.findUniqueOrThrow({ where: { id: partial.id } })
    assert.equal(incomplete.status, "partial")
    assert.equal(incomplete.completed_at, null)
    const oversized = await queueDocumentExport(session); jobs.push(oversized.id)
    await runPendingDocumentExports(1, { ...io, read: async () => new Response(bytes, { headers: { "content-length": String(26 * 1024 * 1024) } }) }, oversized.id)
    const oversizedResult = await prisma.documentExport.findUniqueOrThrow({ where: { id: oversized.id } })
    assert.equal(oversizedResult.status, "partial")
    assert.match(JSON.stringify(oversizedResult.manifest), /25 MiB/)
    assert.equal(oversizedResult.completed_at, null)
    await prisma.documentAccessGrant.updateMany({ where: { user_id: user.id }, data: { revoked_at: new Date() } })
    await assert.rejects(requireExportAccess(session, job.snapshot), /access changed/)
    console.log("PASS isolated export scope, denial, grant, immutable artifact dedupe, unsigned rejection, actual archive manifest/hash, partial status, oversize refusal, signer-provenance dedupe and revoked-download denial")
  } finally {
    await prisma.documentExport.deleteMany({ where: { id: { in: jobs } } })
    await prisma.legalDocument.deleteMany({ where: { id: { in: docIds } } })
    await prisma.appUser.delete({ where: { id: user.id } })
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
