/** Version bytes follow the same current entitlement as their parent document. */
import { getOptionalSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireDocumentAccess, DocumentAccessDenied } from '@/lib/document-access'
import { artifactResponse } from '@/lib/document-artifacts'
import { PRIVATE_FILE_HEADERS } from '@/lib/file-response'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getOptionalSession()
  if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const version = await prisma.documentVersion.findUnique({ where: { id }, select: { document_id: true, file_url: true } })
  if (!version) return Response.json({ error: 'File not found' }, { status: 404 })
  try {
    await requireDocumentAccess(actor, version.document_id)
    if (!version.file_url) return Response.json({ error: 'File not found' }, { status: 404 })
    const upstream = await artifactResponse(version.file_url)
    return new Response(upstream.body, { headers: { ...PRIVATE_FILE_HEADERS, 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream' } })
  } catch (error) {
    if (error instanceof DocumentAccessDenied) return Response.json({ error: 'File not found' }, { status: 404 })
    return Response.json({ error: 'Stored file is unavailable' }, { status: 502 })
  }
}
