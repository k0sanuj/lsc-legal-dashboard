/** Shared access decisions for dashboard and Slack, with scoped grants and audit receipts. */
import { prisma } from '@/lib/prisma'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import type { SessionPayload } from '@/lib/session'

export async function listDocumentAccessRequests(actor: SessionPayload) {
  await requireGlobalDocumentAccess(actor)
  return prisma.documentAccessRequest.findMany({ where: { status: 'PENDING' }, orderBy: { created_at: 'asc' }, take: 30 })
}

export async function decideDocumentAccess(actor: SessionPayload, id: string, approve: boolean, documentId: string, expires: Date) {
  await requireGlobalDocumentAccess(actor)
  if (approve && (!documentId || !Number.isFinite(expires.getTime()) || expires <= new Date())) throw new Error('Choose a document and future expiry.')
  await prisma.$transaction(async tx => {
    const request = await tx.documentAccessRequest.findUniqueOrThrow({ where: { id } })
    if (request.status !== 'PENDING') throw new Error('This request has already been decided.')
    if (approve) {
      await tx.legalDocument.findUniqueOrThrow({ where: { id: documentId }, select: { id: true } })
      await tx.documentAccessGrant.upsert({ where: { user_id_document_id: { user_id: request.requester_id, document_id: documentId } }, create: { user_id: request.requester_id, document_id: documentId, granted_by: actor.userId, expires_at: expires }, update: { granted_by: actor.userId, granted_at: new Date(), expires_at: expires, revoked_at: null } })
    }
    const changed = await tx.documentAccessRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: approve ? 'APPROVED' : 'DENIED', document_id: approve ? documentId : null, decided_by: actor.userId, decided_at: new Date() } })
    if (changed.count !== 1) throw new Error('This request has already been decided.')
    await tx.authAccessEvent.create({ data: { app_user_id: actor.userId, event_type: 'document_access_decision', event_status: 'success', metadata: { requestId: id, requesterId: request.requester_id, approved: approve, documentId: approve ? documentId : null } } })
  })
}

export async function revokeDocumentGrant(actor: SessionPayload, id: string) {
  await requireGlobalDocumentAccess(actor)
  await prisma.$transaction([
    prisma.documentAccessGrant.update({ where: { id }, data: { revoked_at: new Date() } }),
    prisma.authAccessEvent.create({ data: { app_user_id: actor.userId, event_type: 'document_access_revoked', event_status: 'success', metadata: { grantId: id } } }),
  ])
}
