/** Policy downloads retain the same global legal access boundary as the register. */
import { getOptionalSession } from '@/lib/auth'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { prisma } from '@/lib/prisma'
import { streamEntityFile } from '@/lib/entity-file'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try { await requireGlobalDocumentAccess(session) } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }) }
  const { id } = await params
  const file = await prisma.policyDocument.findUnique({ where: { id }, select: { file_url: true, title: true } })
  if (!file?.file_url) return Response.json({ error: 'File not found' }, { status: 404 })
  return streamEntityFile(file.file_url, file.title)
}
