/** Permission-aware Drive discovery. Scoped users can inspect only explicitly linked granted artifacts. */
import { prisma } from "@/lib/prisma"
import { documentScope, isGlobalDocumentUser } from "@/lib/document-access"
import { getApprovedDriveFolderIds, getLegalDriveClient } from "@/lib/drive-documents"
import type { SessionPayload } from "@/lib/session"

const escapeQuery = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")

async function authorizedDriveIds(actor: SessionPayload): Promise<Set<string> | null> {
  if (await isGlobalDocumentUser(actor)) return null
  const artifacts = await prisma.documentArtifact.findMany({ where: { drive_file_id: { not: null }, document: await documentScope(actor) }, select: { drive_file_id: true } })
  return new Set(artifacts.flatMap((artifact) => artifact.drive_file_id ? [artifact.drive_file_id] : []))
}

/** Walk ancestors without trusting caller-supplied folder names or shortcut targets. */
async function inApprovedFolders(fileId: string): Promise<boolean> {
  const approved = new Set(getApprovedDriveFolderIds())
  if (approved.size === 0) return false
  const drive = getLegalDriveClient()
  const queue = [fileId]
  const seen = new Set<string>()
  while (queue.length && seen.size < 100) {
    const id = queue.shift()!
    if (approved.has(id)) return true
    if (seen.has(id)) continue
    seen.add(id)
    const file = await drive.files.get({ fileId: id, fields: "id,parents,trashed,mimeType", supportsAllDrives: true })
    if (file.data.trashed || file.data.mimeType === "application/vnd.google-apps.shortcut") continue
    queue.push(...(file.data.parents ?? []))
  }
  return false
}

export async function requireDriveFileAccess(actor: SessionPayload, fileId: string) {
  if (!/^[\w-]{5,200}$/.test(fileId)) throw new Error("Document is unavailable")
  const allowed = await authorizedDriveIds(actor)
  if ((allowed !== null && !allowed.has(fileId)) || !await inApprovedFolders(fileId)) throw new Error("Document is unavailable. Request scoped access from Legal.")
}

export async function searchLegalDrive(actor: SessionPayload, query: string) {
  if (!query.trim() || query.length > 200) throw new Error("Enter a search of at most 200 characters")
  const allowed = await authorizedDriveIds(actor)
  if (allowed?.size === 0) return { files: [], partial: false }
  const roots = getApprovedDriveFolderIds()
  if (!roots.length) throw new Error("Approved Drive source folders have not been configured")
  const drive = getLegalDriveClient()
  const fields = "id,name,mimeType,modifiedTime,version"
  const files: { id: string; name: string; modifiedAt: string | null; version: string | null }[] = []
  let partial = false
  if (allowed) {
    for (const id of Array.from(allowed).slice(0, 100)) {
      if (!await inApprovedFolders(id)) continue
      const file = await drive.files.get({ fileId: id, fields, supportsAllDrives: true })
      if (file.data.name?.toLowerCase().includes(query.toLowerCase())) files.push({ id, name: file.data.name, modifiedAt: file.data.modifiedTime ?? null, version: file.data.version ?? null })
      if (files.length === 20) { partial = true; break }
    }
    partial ||= allowed.size > 100
  } else {
    const queue = [...roots]
    const visited = new Set<string>()
    while (queue.length && visited.size < 100 && files.length < 20) {
      const folder = queue.shift()!
      if (visited.has(folder)) continue
      visited.add(folder)
      let pageToken: string | undefined
      do {
        const response = await drive.files.list({ q: `'${escapeQuery(folder)}' in parents and trashed=false and (mimeType='application/vnd.google-apps.folder' or name contains '${escapeQuery(query)}')`, fields: `nextPageToken,files(${fields})`, pageSize: 100, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true })
        for (const file of response.data.files ?? []) {
          if (!file.id || !file.name || file.mimeType === "application/vnd.google-apps.shortcut") continue
          if (file.mimeType === "application/vnd.google-apps.folder") queue.push(file.id)
          else if (files.length < 20) files.push({ id: file.id, name: file.name, modifiedAt: file.modifiedTime ?? null, version: file.version ?? null })
          else partial = true
        }
        pageToken = response.data.nextPageToken ?? undefined
      } while (pageToken && files.length < 20)
      partial ||= Boolean(pageToken)
    }
    partial ||= queue.length > 0
  }
  await prisma.authAccessEvent.create({ data: { app_user_id: actor.userId, event_type: "drive_search", event_status: "success", metadata: { fileIds: files.map((file) => file.id), partial } } })
  return { files, partial }
}

export async function fetchLegalDriveFile(actor: SessionPayload, id: string) {
  await requireDriveFileAccess(actor, id)
  const drive = getLegalDriveClient()
  const metadata = await drive.files.get({ fileId: id, fields: "name,mimeType,size,version", supportsAllDrives: true })
  if (Number(metadata.data.size ?? 0) > 25 * 1024 * 1024) throw new Error("File exceeds the 25 MB retrieval limit")
  const native = metadata.data.mimeType === "application/vnd.google-apps.document"
  const response = native
    ? await drive.files.export({ fileId: id, mimeType: "application/pdf" }, { responseType: "arraybuffer" })
    : await drive.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" })
  const bytes = Buffer.from(response.data as ArrayBuffer)
  if (bytes.length > 25 * 1024 * 1024) throw new Error("File exceeds the 25 MB retrieval limit")
  await prisma.authAccessEvent.create({ data: { app_user_id: actor.userId, event_type: "drive_download", event_status: "success", metadata: { fileId: id, version: metadata.data.version ?? null } } })
  return { bytes, name: metadata.data.name ?? "document", contentType: native ? "application/pdf" : metadata.data.mimeType ?? "application/octet-stream" }
}
