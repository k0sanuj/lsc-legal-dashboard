import { getOptionalSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireExportAccess } from "@/lib/document-exports"
import { artifactResponse } from "@/lib/document-artifacts"
import { PRIVATE_FILE_HEADERS } from "@/lib/file-response"

export const runtime = "nodejs"
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const job = await prisma.documentExport.findFirst({ where: { id, requested_by: session.userId } })
  if (!job?.archive_url || !job.expires_at || job.expires_at <= new Date()) return Response.json({ error: "Export not available" }, { status: 404 })
  try {
    await requireExportAccess(session, job.snapshot)
    const file = await artifactResponse(job.archive_url)
    // This records an authorized download initiation. Manual verification is a separate operator action.
    await prisma.documentExport.update({ where: { id }, data: { downloaded_at: new Date() } })
    return new Response(file.body, { headers: { ...PRIVATE_FILE_HEADERS, "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="legal-documents-${job.created_at.toISOString().slice(0, 10)}.tar.gz"` } })
  } catch { return Response.json({ error: "Export access or source file unavailable; request a fresh export" }, { status: 403 }) }
}
