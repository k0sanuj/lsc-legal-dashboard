/** Explicitly isolated database integration. Refuses every database except the v2 verifier. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma } from '../src/generated/prisma/client'
import { prisma } from '../src/lib/prisma'
import { materializeReviewTasks, completeReviewTask, signalReviewChange, notifyDocumentReviewChange, notifyPolicyReviewChange } from '../src/lib/review-service'
import { setKycVerification } from '../src/lib/entity-service'
import { saveEntityProfileForSession, saveEntityFilingForSession, saveEntityOwnershipForSession } from '../src/lib/entity-record-service'
import { createReviewScheduleForSession, createInternalPolicyForSession, importReviewDependenciesForSession } from '../src/lib/review-schedule-service'
import { saveDispute, setDisputeStatus } from '../src/lib/dispute-service'
import type { SessionPayload } from '../src/lib/session'

function form(values: Record<string, string>) {
  const result = new FormData()
  for (const [key, value] of Object.entries(values)) result.set(key, value)
  return result
}

async function main() {
  assert.equal(new URL(process.env.DATABASE_URL ?? '').pathname, '/legal_os_v2_verify_20260921', 'Refusing non-verification database')
  assert.equal(process.env.FINANCE_WEBHOOK_URL, undefined, 'No external Finance receiver may be configured')
  const tag = `SYNTHETIC-V2-${randomUUID()}`
  const user = await prisma.appUser.upsert({ where: { email: 'arvind@futureofsports.io' }, update: {}, create: { email: 'arvind@futureofsports.io', full_name: 'Synthetic verification actor', role: 'LEGAL_ADMIN', password_hash: 'unusable-synthetic-test-hash' } })
  const session: SessionPayload = { userId: user.id, email: user.email, role: user.role, fullName: user.full_name, exp: Date.now() + 60000 }
  const createdCases: string[] = [], createdSchedules: string[] = [], createdProfiles: string[] = [], createdDocuments: string[] = [], createdKyc: string[] = [], createdPolicies: string[] = []
  try {
    const profile = await saveEntityProfileForSession(session, form({ legal_name: tag, jurisdiction: 'UAE', source_reference: 'Synthetic integration fixture only' })); createdProfiles.push(profile.id)
    await saveEntityFilingForSession(session, form({ entity_profile_id: profile.id, filing_type: 'ANNUAL_REPORT', filed_date: '2026-09-21', source_reference: 'Synthetic filing receipt' }))
    const holdingForm = { owned_entity_id: profile.id, owner_name: 'Synthetic shareholder', percentage: '75.1234', source_reference: 'Synthetic shareholding evidence' }
    const holding = await saveEntityOwnershipForSession(session, form(holdingForm))
    await saveEntityOwnershipForSession(session, form({ ...holdingForm, id: holding.id, percentage: '50.0001' }))
    assert.equal((await prisma.entityOwnership.findUniqueOrThrow({ where: { id: holding.id } })).percentage?.toFixed(), '50.0001')
    await assert.rejects(saveEntityOwnershipForSession(session, form(holdingForm)), /already listed/)
    const kyc = await prisma.kycDocument.create({ data: { entity: 'FSP', jurisdiction: 'UAE', document_type: 'Synthetic', document_name: tag, entity_profile_id: profile.id } }); createdKyc.push(kyc.id)
    const verified = await setKycVerification(session, kyc.id, 'VERIFIED')
    assert.equal(verified.verified_by, user.id)
    const expired = await setKycVerification(session, kyc.id, 'EXPIRED')
    assert.equal(expired.verified_at?.toISOString(), verified.verified_at?.toISOString(), 'Relocation/status must retain existing verifier metadata')
    const document = await prisma.legalDocument.create({ data: { title: tag, entity: 'FSP', category: 'TERMS_OF_SERVICE', owner_id: user.id } }); createdDocuments.push(document.id)
    const first = await prisma.reviewSchedule.create({ data: { title: `${tag}-source`, kind: 'PUBLIC', start_date: new Date('2026-01-31T00:00:00Z'), document_id: document.id, owner_id: user.id } }); createdSchedules.push(first.id)
    const second = await prisma.reviewSchedule.create({ data: { title: `${tag}-target`, kind: 'PUBLIC', start_date: new Date('2026-01-31T00:00:00Z'), owner_id: user.id } }); createdSchedules.push(second.id)
    await materializeReviewTasks(new Date('2026-06-01T00:00:00Z'))
    const before = await prisma.reviewTask.count({ where: { schedule_id: { in: createdSchedules } } })
    await materializeReviewTasks(new Date('2026-06-01T00:00:00Z'))
    assert.equal(await prisma.reviewTask.count({ where: { schedule_id: { in: createdSchedules } } }), before)
    await prisma.reviewDependency.create({ data: { source_schedule_id: first.id, target_schedule_id: second.id, source_reference: 'Synthetic Arvind-table fixture, not an actual dependency' } })
    assert.equal((await signalReviewChange(session, first.id, 'synthetic-revision-1')).created, 1)
    assert.equal((await signalReviewChange(session, first.id, 'synthetic-revision-1')).created, 0)
    assert.equal((await notifyDocumentReviewChange(document.id, 'synthetic-version-2')).created, 1)
    assert.equal((await notifyDocumentReviewChange(document.id, 'synthetic-version-2')).created, 0)
    const policy = await createInternalPolicyForSession(session, form({ title: tag, content: 'Synthetic policy content', effective_date: '2026-01-31' })); createdPolicies.push(policy.id)
    const internal = await createReviewScheduleForSession(session, form({ title: `${tag}-internal`, kind: 'INTERNAL', policy_id: policy.id, start_date: '2026-01-31', interval_months: '4', owner_id: user.id, source_reference: 'Synthetic confirmed cadence' })); createdSchedules.push(internal.id)
    await importReviewDependenciesForSession(session, form({ rows: JSON.stringify([{ source_schedule_id: internal.id, target_schedule_id: second.id }]), source_reference: 'Synthetic policy dependency' }))
    assert.equal((await notifyPolicyReviewChange(policy.id, 'file:synthetic-1')).created, 1)
    assert.equal((await notifyPolicyReviewChange(policy.id, 'file:synthetic-1')).created, 0)
    assert.equal((await notifyPolicyReviewChange(policy.id, 'file:synthetic-2')).created, 1)
    const reviewCount = await prisma.reviewTask.count({ where: { schedule_id: second.id } })
    await assert.rejects(prisma.$transaction(async tx => {
      await tx.legalDocument.update({ where: { id: document.id }, data: { file_url: 'https://synthetic.invalid/cancelled' } })
      await notifyDocumentReviewChange(document.id, 'atomic-cancelled', tx)
      await notifyPolicyReviewChange(policy.id, 'atomic-cancelled', tx)
      throw new Error('Synthetic rollback after both review hooks')
    }), /Synthetic rollback/)
    assert.equal((await prisma.legalDocument.findUniqueOrThrow({ where: { id: document.id } })).file_url, null)
    assert.equal(await prisma.reviewTask.count({ where: { schedule_id: second.id } }), reviewCount, 'Review triggers must roll back with source mutation')
    const task = await prisma.reviewTask.findFirstOrThrow({ where: { schedule_id: first.id }, orderBy: { due_date: 'asc' } })
    await completeReviewTask(session, task.id, 'Synthetic evidence for idempotency test')
    assert.equal((await completeReviewTask(session, task.id, 'Different text must not overwrite')).alreadyCompleted, true)
    const complete = await prisma.reviewTask.findUniqueOrThrow({ where: { id: task.id } })
    assert.equal(complete.evidence, 'Synthetic evidence for idempotency test')
    const exact = '9007199254740993.12345678'
    const input = { case_name: tag, case_number: null, entity: 'FSP' as const, jurisdiction: 'UAE' as const, dispute_kind: 'ARBITRATION' as const, claim_type: 'Synthetic claim', court_tribunal: 'Synthetic tribunal', plaintiff: 'Synthetic claimant', defendant: 'Synthetic respondent', estimated_liability: new Prisma.Decimal(exact), currency: 'USD', exposure_basis: 'Synthetic test basis', exposure_as_of: new Date('2026-09-21T00:00:00Z'), notes: 'Isolated verification only' }
    const created = await saveDispute(session, input); createdCases.push(created.caseId)
    assert.equal(created.financeStatus, 'pending_contract')
    const record = await prisma.litigationCase.findUniqueOrThrow({ where: { id: created.caseId } })
    assert.equal(record.estimated_liability?.toFixed(), exact)
    const event = await prisma.crossModuleEvent.findFirstOrThrow({ where: { entity_id: record.id, event_type: 'dispute.exposure.updated' } })
    assert.equal((event.payload as { estimatedLiability: string }).estimatedLiability, exact)
    assert.equal(event.processed, false)
    await saveDispute(session, { ...input, id: record.id, revision: 1, estimated_liability: new Prisma.Decimal('0') })
    await assert.rejects(() => saveDispute(session, { ...input, id: record.id, revision: 1 }), /changed/)
    await setDisputeStatus(session, record.id, 'CLOSED')
    await setDisputeStatus(session, record.id, 'CLOSED')
    assert.equal(await prisma.crossModuleEvent.count({ where: { entity_id: record.id } }), 3)
    const latest = await prisma.litigationCase.findUniqueOrThrow({ where: { id: record.id } })
    assert.equal(latest.exposure_revision, 3)
    assert.equal(latest.estimated_liability?.toFixed(), '0')
    assert.equal(latest.finance_post_status, 'pending_contract')
    console.log('Isolated integration passed: registry/KYC links and retained verification, idempotent scheduled/dependency tasks, immutable completion evidence, exact database/outbox money, stale-write rejection and closure delivery state. No production data or external Finance used.')
  } finally {
    await prisma.crossModuleEvent.deleteMany({ where: { entity_id: { in: createdCases } } })
    await prisma.litigationCase.deleteMany({ where: { id: { in: createdCases } } })
    await prisma.reviewSchedule.deleteMany({ where: { id: { in: createdSchedules } } })
    await prisma.policyDocument.deleteMany({ where: { id: { in: createdPolicies } } })
    await prisma.legalDocument.deleteMany({ where: { id: { in: createdDocuments } } })
    await prisma.kycDocument.deleteMany({ where: { id: { in: createdKyc } } })
    await prisma.entityProfile.deleteMany({ where: { id: { in: createdProfiles } } })
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Integration failed'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
