/** Entity/KYC operations shared by dashboard and Slack, with current access checks. */
import { prisma } from '@/lib/prisma'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import type { SessionPayload } from '@/lib/session'
import type { KycDocStatus } from '@/generated/prisma/client'

export async function requireEntityWriter(session: SessionPayload): Promise<SessionPayload> {
  const actor = await requireGlobalDocumentAccess(session)
  if (!['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'].includes(actor.role)) throw new Error('Legal editing access is required.')
  return actor
}

export async function listEntityProfiles(session: SessionPayload) {
  await requireGlobalDocumentAccess(session)
  return prisma.entityProfile.findMany({ orderBy: { legal_name: 'asc' }, include: { _count: { select: { filings: true, kyc_documents: true } }, owned_by: { include: { owner_entity: { select: { id: true, legal_name: true } } } } } })
}

export async function setKycVerification(session: SessionPayload, id: string, status: KycDocStatus) {
  const actor = await requireEntityWriter(session)
  if (!['COLLECTED', 'VERIFIED', 'EXPIRED', 'NEEDS_RENEWAL'].includes(status)) throw new Error('Invalid KYC status.')
  return prisma.kycDocument.update({ where: { id }, data: {
    status,
    verified_by: status === 'VERIFIED' ? actor.userId : undefined,
    verified_at: status === 'VERIFIED' ? new Date() : undefined,
  } })
}
