import { getOptionalSession } from "@/lib/auth"
import { requireDocumentAccess, requireGlobalDocumentAccess } from "@/lib/document-access"
import { prisma } from "@/lib/prisma"
import { artifactResponse } from "@/lib/document-artifacts"
import { PRIVATE_FILE_HEADERS } from "@/lib/file-response"

export const runtime = "nodejs"
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { id } = await params
    const artifact = await prisma.documentArtifact.findUniqueOrThrow({ where: { id } })
    if (artifact.document_id) await requireDocumentAccess(session, artifact.document_id)
    else await requireGlobalDocumentAccess(session)
    const response = await artifactResponse(artifact.file_url)
    const name = artifact.approved_name ?? artifact.original_name
    return new Response(response.body, { headers: { ...PRIVATE_FILE_HEADERS, "Content-Type": artifact.mime_type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name).replaceAll("'", "%27")}` } })
  } catch { return Response.json({ error: "File unavailable" }, { status: 404 }) }
}
