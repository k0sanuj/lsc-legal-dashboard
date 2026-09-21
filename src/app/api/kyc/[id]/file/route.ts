import { getOptionalSession } from '@/lib/auth'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { streamEntityFile } from '@/lib/entity-file'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try { await requireGlobalDocumentAccess(session) } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }) }
  const record = await prisma.kycDocument.findUnique({ where: { id: (await params).id } })
  if (!record) return Response.json({ error: 'File unavailable' }, { status: 404 })
  return streamEntityFile(record.file_url, record.document_name)
}
