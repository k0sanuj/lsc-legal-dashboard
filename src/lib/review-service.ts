/** Durable review occurrences and sourced dependency triggers, shared with Slack. */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { requireEntityWriter } from '@/lib/entity-service'
import type { SessionPayload } from '@/lib/session'
import { Prisma, type ReviewSchedule } from '@/generated/prisma/client'
import { reviewDueDates, utcDay } from '@/lib/review-rules'

/** Call within the schedule mutation transaction so a stale cron cannot restore an old cadence. */
export async function materializeScheduleTasks(db: Prisma.TransactionClient, schedule: ReviewSchedule, now: Date) {
  if (!schedule.active) return 0
  const result = await db.reviewTask.createMany({ data: reviewDueDates(schedule, now)
    .filter(due => !schedule.cadence_effective_from || due > schedule.cadence_effective_from)
    .map((due) => ({
      schedule_id: schedule.id,
      task_key: `scheduled:${schedule.id}:${due.toISOString().slice(0, 10)}`,
      due_date: due,
      trigger_kind: 'SCHEDULE',
      trigger_reference: schedule.source_reference,
    })), skipDuplicates: true })
  return result.count
}

export async function materializeReviewTasks(now = new Date()) {
  const schedules = await prisma.reviewSchedule.findMany({ where: { active: true }, select: { id: true } })
  let created = 0
  for (const schedule of schedules) {
    created += await prisma.$transaction(async tx => {
      const current = await tx.reviewSchedule.findUnique({ where: { id: schedule.id } })
      return current ? materializeScheduleTasks(tx, current, now) : 0
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
  return { schedules: schedules.length, created }
}

export async function listReviewSchedules(session: SessionPayload) {
  await requireGlobalDocumentAccess(session)
  return prisma.reviewSchedule.findMany({ orderBy: { title: 'asc' } })
}

export async function listReviewTasks(session: SessionPayload) {
  await requireGlobalDocumentAccess(session)
  return prisma.reviewTask.findMany({ where: { status: 'OPEN', schedule: { active: true } }, include: { schedule: { select: { title: true, kind: true, owner_id: true } } }, orderBy: { due_date: 'asc' }, take: 100 })
}

export async function completeReviewTask(session: SessionPayload, taskId: string, evidence: string) {
  const actor = await requireEntityWriter(session)
  if (!evidence.trim() || evidence.length > 4000) throw new Error('Completion evidence is required, up to 4000 characters.')
  const task = await prisma.reviewTask.findUnique({ where: { id: taskId } })
  if (!task) throw new Error('Review task not found.')
  if (task.status === 'COMPLETED') return { success: true, alreadyCompleted: true }
  const result = await prisma.reviewTask.updateMany({ where: { id: taskId, status: 'OPEN' }, data: { status: 'COMPLETED', completed_by: actor.userId, completed_at: new Date(), evidence: evidence.trim() } })
  if (result.count === 1) return { success: true, alreadyCompleted: false }
  const current = await prisma.reviewTask.findUnique({ where: { id: taskId }, select: { status: true } })
  if (current?.status === 'COMPLETED') return { success: true, alreadyCompleted: true }
  throw new Error('This review changed or was replaced by a schedule edit. Refresh before recording completion.')
}

async function triggerDependencies(scheduleId: string, changeReference: string, db: Prisma.TransactionClient = prisma) {
  const dependencies = await db.reviewDependency.findMany({ where: { source_schedule_id: scheduleId, source: { active: true }, target: { active: true } } })
  const eventHash = createHash('sha256').update(changeReference).digest('hex')
  const result = await db.reviewTask.createMany({ data: dependencies.map((dependency) => ({
    schedule_id: dependency.target_schedule_id,
    task_key: `dependency:${dependency.id}:${eventHash}`,
    due_date: utcDay(new Date()),
    trigger_kind: 'DEPENDENCY',
    trigger_reference: `${changeReference}\nRule source: ${dependency.source_reference}`,
  })), skipDuplicates: true })
  return { created: result.count }
}

export async function signalReviewChange(session: SessionPayload, scheduleId: string, changeReference: string) {
  await requireEntityWriter(session)
  if (!changeReference.trim() || changeReference.length > 2000) throw new Error('A stable source change reference is required.')
  if (!await prisma.reviewSchedule.findUnique({ where: { id: scheduleId }, select: { id: true } })) throw new Error('Source review schedule not found.')
  return triggerDependencies(scheduleId, changeReference.trim())
}

/** Internal hook: call only after a durable document/version change, with its ID. */
export async function notifyDocumentReviewChange(documentId: string, changeReference: string, db: Prisma.TransactionClient = prisma) {
  if (!changeReference.trim()) throw new Error('Document change reference is required.')
  const schedules = await db.reviewSchedule.findMany({ where: { document_id: documentId, active: true }, select: { id: true } })
  let created = 0
  for (const schedule of schedules) created += (await triggerDependencies(schedule.id, `document:${documentId}:${changeReference}`, db)).created
  return { created }
}

/** Internal hook: policy file/content changes share the same dependency rules as public documents. */
export async function notifyPolicyReviewChange(policyId: string, changeReference: string, db: Prisma.TransactionClient = prisma) {
  if (!changeReference.trim()) throw new Error('Policy change reference is required.')
  const schedules = await db.reviewSchedule.findMany({ where: { policy_id: policyId, active: true }, select: { id: true } })
  let created = 0
  for (const schedule of schedules) created += (await triggerDependencies(schedule.id, `policy:${policyId}:${changeReference}`, db)).created
  return { created }
}
