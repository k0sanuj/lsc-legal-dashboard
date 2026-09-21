/** Final-only Drive publication preserves artifact bytes and records the actual provider receipt. */
import { Readable } from "node:stream"
import { createHash } from "node:crypto"
import { GoogleAuth } from "google-auth-library"
import { drive_v3 } from "googleapis/build/src/apis/drive/v3"
import { prisma } from "@/lib/prisma"
import { artifactResponse, boundedArtifactBytes } from "@/lib/document-artifacts"
import { requireGlobalDocumentAccess } from "@/lib/document-access"
import type { SessionPayload } from "@/lib/session"

export function getApprovedDriveFolderIds(): string[] {
  return (process.env.LEGAL_DRIVE_SOURCE_FOLDER_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean)
}

export function getLegalDriveClient(writable = false) {
  const auth = new GoogleAuth({
    ...(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? { credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) } : {}),
    scopes: [writable ? "https://www.googleapis.com/auth/drive" : "https://www.googleapis.com/auth/drive.readonly"],
  })
  return new drive_v3.Drive({ auth })
}

export function publicationFolder(stage: string): string | undefined {
  return stage === "template" ? process.env.LEGAL_DRIVE_TEMPLATE_FOLDER_ID : process.env.LEGAL_DRIVE_FINAL_FOLDER_ID
}

export async function publishArtifactToDrive(session: SessionPayload, artifactId: string) {
  await requireGlobalDocumentAccess(session)
  const artifact = await prisma.documentArtifact.findUniqueOrThrow({ where: { id: artifactId } })
  const folder = publicationFolder(artifact.stage)
  if (!folder) throw new Error(`${artifact.stage === "template" ? "Template" : "Final agreement"} Drive destination is not configured`)
  if (!artifact.finalized_at || !artifact.approved_name || !artifact.approved_by) throw new Error("Finalize the artifact and approve its filename before publishing")
  if (artifact.drive_file_id && artifact.published_at) return artifact
  const drive = getLegalDriveClient(true)
  try {
    // Provider-side idempotency survives a successful upload followed by a lost DB receipt.
    const existing = await drive.files.list({
      q: `'${folder.replace(/'/g, "\\'")}' in parents and trashed = false and appProperties has { key='legalArtifactId' and value='${artifact.id}' }`,
      fields: "files(id,name,appProperties)", supportsAllDrives: true, includeItemsFromAllDrives: true,
    })
    let fileId = existing.data.files?.find((file) => file.appProperties?.sha256 === artifact.sha256)?.id
    if (!fileId) {
      const collisions = await drive.files.list({
        q: `'${folder.replace(/'/g, "\\'")}' in parents and trashed = false and name = '${artifact.approved_name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
        fields: "files(id)", supportsAllDrives: true, includeItemsFromAllDrives: true,
      })
      if (collisions.data.files?.length) throw new Error("A different final file has this name; resolve the naming collision before publication")
      const response = await artifactResponse(artifact.file_url)
      const bytes = await boundedArtifactBytes(response)
      if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw new Error("Artifact bytes changed; publication refused")
      const created = await drive.files.create({
        requestBody: { name: artifact.approved_name, parents: [folder], appProperties: { legalArtifactId: artifact.id, sha256: artifact.sha256 } },
        media: { mimeType: artifact.mime_type, body: Readable.from(bytes) },
        fields: "id", supportsAllDrives: true,
      })
      fileId = created.data.id
    }
    if (!fileId) throw new Error("Drive returned no file receipt")
    return await prisma.documentArtifact.update({ where: { id: artifact.id }, data: { drive_file_id: fileId, published_at: new Date(), publish_error: null, publish_status: "published", publish_lease_until: null } })
  } catch (error) {
    await prisma.documentArtifact.update({ where: { id: artifact.id }, data: { publish_status: "failed", publish_lease_until: null, publish_error: error instanceof Error ? error.message : "Drive publication failed" } })
    throw error
  }
}

export async function runPendingDrivePublications(limit = 10) {
  const rows = await prisma.documentArtifact.findMany({ where: { OR: [{ publish_status: "queued" }, { publish_status: "publishing", publish_lease_until: { lt: new Date() } }] }, orderBy: { created_at: "asc" }, take: limit })
  for (const row of rows) {
    const claim = await prisma.documentArtifact.updateMany({ where: { id: row.id, publish_status: row.publish_status, publish_lease_until: row.publish_lease_until }, data: { publish_status: "publishing", publish_lease_until: new Date(Date.now() + 10 * 60000) } })
    if (!claim.count) continue
    try {
      const user = row.publish_requested_by ? await prisma.appUser.findUnique({ where: { id: row.publish_requested_by } }) : null
      if (!user?.is_active) throw new Error("Publication requester is inactive or unknown")
      await publishArtifactToDrive({ userId: user.id, email: user.email, fullName: user.full_name, role: user.role, exp: Date.now() + 3600000 }, row.id)
    } catch (error) {
      await prisma.documentArtifact.update({ where: { id: row.id }, data: { publish_status: "failed", publish_lease_until: null, publish_error: error instanceof Error ? error.message : "Drive publication failed" } })
    }
  }
  return rows.length
}
