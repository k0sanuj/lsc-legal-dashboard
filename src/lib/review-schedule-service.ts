/** Authenticated review scheduling, completions and provenance-preserving imports. */
import { Prisma } from '@/generated/prisma/client'
import { requireEntityWriter } from '@/lib/entity-service'
import { dateField, enumField, evidenceReference, requiredText, textField } from '@/lib/entity-input'
import { prisma } from '@/lib/prisma'
import { completeReviewTask, materializeReviewTasks, signalReviewChange } from '@/lib/review-service'
import { parseDependencyImport, validateDependencies, validateReviewRule } from '@/lib/review-rules'

import type { SessionPayload } from '@/lib/session'

export async function createReviewScheduleForSession(session: SessionPayload, form: FormData) {
  const actor = await requireEntityWriter(session)
  const kind = enumField(form, 'kind', ['PUBLIC', 'INTERNAL'] as const)
  const startDate = dateField(form, 'start_date', true)!
  const interval = textField(form, 'interval_months')
  const steady = textField(form, 'steady_interval_months')
  const rule = { kind, start_date: startDate, interval_months: kind === 'INTERNAL' && interval ? Number(interval) : null, steady_interval_months: kind === 'PUBLIC' && steady ? Number(steady) : null }
  validateReviewRule(rule)
  const documentId = textField(form, 'document_id')
  const policyId = textField(form, 'policy_id')
  if (documentId && policyId) throw new Error('Link one document or one policy, not both.')
  if (kind === 'INTERNAL' && !policyId) throw new Error('Internal schedules must link a policy.')
  if (kind === 'PUBLIC' && !documentId) throw new Error('Public schedules must link a document.')
  const ownerId = requiredText(form, 'owner_id')
  if (!await prisma.appUser.findFirst({ where: { id: ownerId, is_active: true }, select: { id: true } })) throw new Error('Choose an active review owner.')
  const schedule = await prisma.reviewSchedule.create({ data: { ...rule, title: requiredText(form, 'title', 300), document_id: documentId, policy_id: policyId, owner_id: ownerId, source_reference: evidenceReference(form, 'source_reference', true), created_by: actor.userId } })
  await materializeReviewTasks()
  return { success: true, id: schedule.id }
}

export async function finishReviewForSession(session: SessionPayload, form: FormData) {
  const result = await completeReviewTask(session, requiredText(form, 'task_id'), requiredText(form, 'evidence'))
  return result
}

export async function refreshReviewTasksForSession(session: SessionPayload) {
  await requireEntityWriter(session)
  const result = await materializeReviewTasks()
  return result
}

export async function importReviewDependenciesForSession(session: SessionPayload, form: FormData) {
  await requireEntityWriter(session)
  const incoming = parseDependencyImport(requiredText(form, 'rows', 150000))
  const sourceReference = evidenceReference(form, 'source_reference', true)!
  const result = await prisma.$transaction(async (tx) => {
    const [schedules, existing] = await Promise.all([tx.reviewSchedule.findMany({ select: { id: true } }), tx.reviewDependency.findMany()])
    validateDependencies([...existing, ...incoming], new Set(schedules.map((schedule) => schedule.id)))
    return tx.reviewDependency.createMany({ data: incoming.map((edge) => ({ ...edge, source_reference: sourceReference })), skipDuplicates: true })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  return { success: true, imported: result.count }
}

export async function recordReviewChangeForSession(session: SessionPayload, form: FormData) {
  const result = await signalReviewChange(session, requiredText(form, 'schedule_id'), requiredText(form, 'change_reference', 2000))
  return { success: true, ...result }
}

export async function setReviewScheduleActiveForSession(session: SessionPayload, form: FormData) {
  await requireEntityWriter(session)
  const active = enumField(form, 'active', ['true', 'false'] as const) === 'true'
  await prisma.reviewSchedule.update({ where: { id: requiredText(form, 'schedule_id') }, data: { active } })
  return { success: true }
}

export async function createInternalPolicyForSession(session: SessionPayload, form: FormData) {
  await requireEntityWriter(session)
  const policy = await prisma.policyDocument.create({ data: {
    title: requiredText(form, 'title', 300), category: 'INTERNAL_POLICIES_PROCEDURES',
    effective_date: dateField(form, 'effective_date', true)!,
    content: requiredText(form, 'content', 100000), acknowledgment_required: form.get('acknowledgment_required') === 'on',
  } })
  return { success: true, id: policy.id }
}
