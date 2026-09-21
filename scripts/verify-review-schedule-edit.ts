/** Exercises actual review edits only in the disposable v2 verification database. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { createInternalPolicyForSession, createReviewScheduleForSession, saveReviewScheduleForSession } from '../src/lib/review-schedule-service'
import { completeReviewTask, materializeReviewTasks } from '../src/lib/review-service'
import { addCalendarMonths, utcDay } from '../src/lib/review-rules'
import type { SessionPayload } from '../src/lib/session'

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

async function main() {
  assert.equal(new URL(process.env.DATABASE_URL ?? '').pathname, '/legal_os_v2_verify_20260921', 'Refusing non-verification database')
  const tag = `SYNTHETIC-EDIT-${randomUUID()}`
  const actor = await prisma.appUser.upsert({ where: { email: 'arvind@futureofsports.io' }, update: {}, create: { email: 'arvind@futureofsports.io', full_name: 'Synthetic verification actor', role: 'LEGAL_ADMIN', password_hash: 'unusable-synthetic-test-hash' } })
  const session: SessionPayload = { userId: actor.id, email: actor.email, fullName: actor.full_name, role: actor.role, exp: Date.now() + 60000 }
  const today = utcDay(new Date())
  const start = addCalendarMonths(today, -12)
  let policyId: string | undefined, scheduleId: string | undefined, publicScheduleId: string | undefined, documentId: string | undefined
  try {
    const policy = await createInternalPolicyForSession(session, form({ title: tag, content: 'Synthetic policy for schedule editing', effective_date: start.toISOString().slice(0, 10) }))
    policyId = policy.id
    const fields = { title: tag, kind: 'INTERNAL', policy_id: policy.id, start_date: start.toISOString().slice(0, 10), interval_months: '4', owner_id: actor.id, source_reference: 'Synthetic confirmed review cadence' }
    const result = await createReviewScheduleForSession(session, form(fields))
    scheduleId = result.id
    const before = await prisma.reviewSchedule.findUniqueOrThrow({ where: { id: result.id } })
    const tasks = await prisma.reviewTask.findMany({ where: { schedule_id: result.id }, orderBy: { due_date: 'asc' } })
    const dueIds = tasks.filter(task => task.due_date <= today).map(task => task.id)
    const future = tasks.find(task => task.due_date > today)!
    assert.ok(dueIds.length >= 2)
    await completeReviewTask(session, dueIds[0], 'Synthetic immutable completed evidence')
    const preservedFuture = await prisma.reviewTask.create({ data: { schedule_id: result.id, task_key: `${tag}-future-completion`, trigger_kind: 'SCHEDULE', due_date: future.due_date, status: 'COMPLETED', completed_at: new Date(), completed_by: actor.id, evidence: 'Synthetic future completion' } })
    const dependent = await prisma.reviewTask.create({ data: { schedule_id: result.id, task_key: `${tag}-dependency`, trigger_kind: 'DEPENDENCY', due_date: future.due_date } })
    const edit = { ...fields, id: result.id, expected_updated_at: before.updated_at.toISOString(), interval_months: '5' }
    await saveReviewScheduleForSession(session, form(edit))
    const saved = await prisma.reviewSchedule.findUniqueOrThrow({ where: { id: result.id } })
    assert.equal(saved.interval_months, 5)
    assert.equal(saved.cadence_effective_from?.toISOString(), today.toISOString())
    assert.ok(saved.updated_at > before.updated_at)
    assert.equal(await prisma.reviewTask.count({ where: { id: { in: [...dueIds, preservedFuture.id, dependent.id] } } }), dueIds.length + 2)
    assert.equal((await prisma.reviewTask.findUniqueOrThrow({ where: { id: dueIds[0] } })).evidence, 'Synthetic immutable completed evidence')
    assert.equal(await prisma.reviewTask.count({ where: { id: future.id } }), 0, 'Only obsolete future open scheduled occurrence is removed')
    assert.equal(await prisma.reviewTask.count({ where: { schedule_id: result.id, status: 'OPEN', trigger_kind: 'SCHEDULE', due_date: addCalendarMonths(start, 15) } }), 1)
    const count = await prisma.reviewTask.count({ where: { schedule_id: result.id } })
    await materializeReviewTasks()
    await materializeReviewTasks()
    assert.equal(await prisma.reviewTask.count({ where: { schedule_id: result.id } }), count, 'Cron must neither restore obsolete future tasks nor create retrospective obligations')
    await assert.rejects(saveReviewScheduleForSession(session, form(edit)), /schedule changed/)
    await assert.rejects(saveReviewScheduleForSession(session, form({ ...edit, expected_updated_at: saved.updated_at.toISOString(), start_date: addCalendarMonths(start, -1).toISOString().slice(0, 10) })), /start date/)
    await assert.rejects(saveReviewScheduleForSession(session, form({ ...edit, expected_updated_at: saved.updated_at.toISOString(), interval_months: '3' })), /4, 5 or 6/)
    await saveReviewScheduleForSession(session, form({ ...edit, expected_updated_at: saved.updated_at.toISOString(), title: `${tag}-renamed` }))
    assert.equal(await prisma.reviewTask.count({ where: { schedule_id: result.id } }), count)
    const document = await prisma.legalDocument.create({ data: { title: tag, entity: 'FSP', category: 'TERMS_OF_SERVICE', owner_id: actor.id } })
    documentId = document.id
    const publicFields = { title: `${tag}-public`, kind: 'PUBLIC', document_id: document.id, start_date: start.toISOString().slice(0, 10), owner_id: actor.id, source_reference: 'Synthetic later confirmed monthly review' }
    const publicResult = await createReviewScheduleForSession(session, form(publicFields))
    publicScheduleId = publicResult.id
    const publicBefore = await prisma.reviewSchedule.findUniqueOrThrow({ where: { id: publicResult.id } })
    const publicDue = await prisma.reviewTask.count({ where: { schedule_id: publicResult.id, due_date: { lte: today } } })
    await saveReviewScheduleForSession(session, form({ ...publicFields, id: publicResult.id, expected_updated_at: publicBefore.updated_at.toISOString(), steady_interval_months: '1' }))
    await materializeReviewTasks()
    assert.equal(await prisma.reviewTask.count({ where: { schedule_id: publicResult.id, due_date: { lte: today } } }), publicDue, 'Late steady cadence must not invent missed steady reviews')
    assert.equal(await prisma.reviewTask.count({ where: { schedule_id: publicResult.id, due_date: { gt: today } } }), 1)
    console.log('Review edits passed: stale CAS and invalid edits rejected; cadence cutoff preserves due/completed/dependency history; replaces only future open scheduled work; repeated cron does not recreate obsolete or retrospective tasks; later public cadence creates only the next future review. Isolated database only.')
  } finally {
    if (publicScheduleId) await prisma.reviewSchedule.delete({ where: { id: publicScheduleId } })
    if (documentId) await prisma.legalDocument.delete({ where: { id: documentId } })
    if (scheduleId) await prisma.reviewSchedule.delete({ where: { id: scheduleId } })
    if (policyId) await prisma.policyDocument.delete({ where: { id: policyId } })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
