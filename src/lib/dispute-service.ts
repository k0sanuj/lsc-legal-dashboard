/** Shared matter mutations atomically persist history and exact exposure outbox events. */
import { Prisma, type Entity, type Jurisdiction, type LitigationStatus } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { requireEntityWriter } from '@/lib/entity-service'
import { deliverFinanceEvent, queueFinanceEvent } from '@/lib/finance-webhook'
import { buildDisputeExposurePayload, DISPUTE_KINDS, DISPUTE_STATUSES, type DisputeKind } from '@/lib/dispute-rules'
import type { SessionPayload } from '@/lib/session'

export type DisputeInput = {
  id?: string; revision?: number; case_name: string; case_number: string | null;
  entity: Entity; jurisdiction: Jurisdiction; dispute_kind: DisputeKind;
  claim_type: string; court_tribunal: string | null; plaintiff: string; defendant: string;
  estimated_liability: Prisma.Decimal | null; currency: string;
  exposure_basis: string | null; exposure_as_of: Date | null; notes: string | null;
}

export async function listDisputes(session: SessionPayload, kind?: DisputeKind) {
  await requireGlobalDocumentAccess(session)
  if (kind && !DISPUTE_KINDS.includes(kind)) throw new Error('Unknown dispute kind.')
  const rows = await prisma.litigationCase.findMany({ where: kind ? { dispute_kind: kind } : {}, orderBy: { updated_at: 'desc' }, take: 100 })
  return rows.map((row) => ({ ...row, estimated_liability: row.estimated_liability?.toFixed() ?? null, legal_fees_to_date: row.legal_fees_to_date?.toFixed() ?? null, projected_total_cost: row.projected_total_cost?.toFixed() ?? null }))
}

async function deliverDispute(eventId: string, caseId: string, revision: number) {
  let result: { ok: boolean; error?: string }
  try { result = await deliverFinanceEvent(eventId, 'dispute.exposure.updated') }
  catch { result = { ok: false, error: 'Delivery attempt failed. The durable outbox will retry.' } }
  const status = result.ok ? 'synced' : process.env.FINANCE_DISPUTE_CONTRACT_VERSION === '1' ? 'failed' : 'pending_contract'
  await prisma.litigationCase.updateMany({ where: { id: caseId, exposure_revision: revision }, data: { finance_post_status: status, last_finance_post_at: new Date(), last_finance_post_error: result.error ?? null } }).catch(() => undefined)
  return { status, error: result.error }
}

export async function saveDispute(session: SessionPayload, input: DisputeInput) {
  const actor = await requireEntityWriter(session)
  if (input.estimated_liability !== null && (!input.exposure_basis || !input.exposure_as_of)) throw new Error('Known exposure requires an assessment basis and as-of date.')
  if (input.id && (!Number.isInteger(input.revision) || input.revision! < 0)) throw new Error('Matter revision is required. Refresh the page.')
  const result = await prisma.$transaction(async (tx) => {
    const { id, revision, ...data } = input
    if (id) {
      const updated = await tx.litigationCase.updateMany({ where: { id, exposure_revision: revision }, data: { ...data, exposure_revision: { increment: 1 }, finance_post_status: 'pending' } })
      if (!updated.count) throw new Error('The matter changed. Refresh before saving.')
    }
    const record = id ? await tx.litigationCase.findUniqueOrThrow({ where: { id } }) : await tx.litigationCase.create({ data: { ...data, assigned_to: actor.userId, exposure_revision: 1, finance_post_status: 'pending' } })
    await tx.litigationEvent.create({ data: { case_id: record.id, event_type: id ? 'matter_updated' : 'matter_created', title: id ? 'Matter and exposure updated' : 'Matter recorded', event_date: new Date(), created_by: actor.userId } })
    const queued = await queueFinanceEvent('dispute.exposure.updated', buildDisputeExposurePayload(record, id ? 'updated' : 'created'), { entityType: 'LitigationCase', entityId: record.id }, tx)
    return { record, eventId: queued.id }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  const delivery = await deliverDispute(result.eventId, result.record.id, result.record.exposure_revision)
  return { success: true, caseId: result.record.id, financeStatus: delivery.status }
}

export async function setDisputeStatus(session: SessionPayload, id: string, status: LitigationStatus) {
  const actor = await requireEntityWriter(session)
  if (!DISPUTE_STATUSES.includes(status)) throw new Error('Invalid matter status.')
  const result = await prisma.$transaction(async (tx) => {
    const previous = await tx.litigationCase.findUniqueOrThrow({ where: { id } })
    if (previous.status === status) return null
    const record = await tx.litigationCase.update({ where: { id }, data: { status, exposure_revision: { increment: 1 }, finance_post_status: 'pending' } })
    await tx.litigationEvent.create({ data: { case_id: id, event_type: 'status_change', title: `Status changed to ${status}`, event_date: new Date(), created_by: actor.userId } })
    const queued = await queueFinanceEvent('dispute.exposure.updated', buildDisputeExposurePayload(record, status === 'CLOSED' || status === 'SETTLED' ? 'closed' : 'updated'), { entityType: 'LitigationCase', entityId: id }, tx)
    return { revision: record.exposure_revision, eventId: queued.id }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  if (result) await deliverDispute(result.eventId, id, result.revision)
  return { success: true }
}
