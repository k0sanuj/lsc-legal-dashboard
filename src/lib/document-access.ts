/** Central document entitlement. Role alone never grants global document access. */
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { SessionPayload } from '@/lib/session'
import type { Prisma } from '@/generated/prisma/client'

export const GLOBAL_DOCUMENT_EMAILS = [
  'legal@futureofsports.io',
  'ak@futureofsports.io',
  'arvind@futureofsports.io',
  'adi@futureofsports.io',
] as const

export class DocumentAccessDenied extends Error {
  constructor() { super('Document access is not available. Request access from Legal.'); this.name = 'DocumentAccessDenied' }
}

export async function isGlobalDocumentUser(session: SessionPayload): Promise<boolean> {
  const user = await prisma.appUser.findUnique({ where: { id: session.userId }, select: { email: true, is_active: true } })
  return !!user?.is_active && user.email.toLowerCase() === session.email.toLowerCase()
    && GLOBAL_DOCUMENT_EMAILS.some(email => email === user.email.toLowerCase())
}

export async function requireGlobalDocumentAccess(session?: SessionPayload): Promise<SessionPayload> {
  const actor = session ?? await requireSession()
  if (!await isGlobalDocumentUser(actor)) redirect('/legal/access')
  const user = await prisma.appUser.findUniqueOrThrow({ where: { id: actor.userId }, select: { role: true, full_name: true } })
  return { ...actor, role: user.role, fullName: user.full_name }
}

/** A revoked/expired grant immediately disappears across web, downloads and Slack. */
export async function documentScope(session: SessionPayload): Promise<Prisma.LegalDocumentWhereInput> {
  if (await isGlobalDocumentUser(session)) return {}
  const user = await prisma.appUser.findUnique({ where: { id: session.userId }, select: { email: true, is_active: true } })
  if (!user?.is_active || user.email.toLowerCase() !== session.email.toLowerCase()) return { id: { in: [] } }
  return { access_grants: { some: { user_id: session.userId, revoked_at: null, expires_at: { gt: new Date() } } } }
}

export async function requireDocumentAccess(session: SessionPayload, documentId: string): Promise<void> {
  const allowed = await prisma.legalDocument.findFirst({ where: { AND: [{ id: documentId }, await documentScope(session)] }, select: { id: true } })
  if (!allowed) throw new DocumentAccessDenied()
}

/** Requests accept a user-supplied reference without resolving titles or revealing existence. */
export async function requestDocumentAccess(session: SessionPayload, reference: string, reason: string) {
  const cleanReference = reference.trim(), cleanReason = reason.trim()
  if (!cleanReference || cleanReference.length > 500 || !cleanReason || cleanReason.length > 2000) throw new Error('Provide a document reference and a reason, up to 500 and 2000 characters.')
  const user = await prisma.appUser.findUnique({ where: { id: session.userId }, select: { email: true, is_active: true } })
  if (!user?.is_active || user.email.toLowerCase() !== session.email.toLowerCase()) throw new DocumentAccessDenied()
  const pending = await prisma.documentAccessRequest.findFirst({ where: { requester_id: session.userId, reference: cleanReference, status: 'PENDING' } })
  return pending ?? prisma.documentAccessRequest.create({ data: { requester_id: session.userId, reference: cleanReference, reason: cleanReason } })
}
