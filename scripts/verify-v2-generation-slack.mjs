/** Executes production protocol, queue, Slack identity and scoped retrieval with controlled boundaries. */
import assert from 'node:assert/strict'
import * as crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function load(path, imports, env = {}, fetch = () => { throw new Error('Unexpected network') }) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
  const moduleRecord = { exports: {} }
  runInNewContext(compiled.outputText, { module: moduleRecord, exports: moduleRecord.exports, Buffer, Headers, URL, AbortSignal, FormData, console, process: { env }, fetch, require(name) { assert.ok(Object.hasOwn(imports, name), `Unapproved import ${path}: ${name}`); return imports[name] } }, { filename: path, timeout: 1000 })
  return moduleRecord.exports
}
const protocol = load('src/lib/contract-generation-protocol.ts', { 'node:crypto': crypto })
const content = '1. Each party protects the other party’s confidential information.'
const hash = protocol.hashDraft(content)
const result = { draft: content, draftHash: hash, substantive: { draftHash: hash, pass: true, findings: [] }, references: { draftHash: hash, pass: true, findings: [] }, model: 'synthetic', sessionIds: ['draft-session', 'review-session', 'reference-session'], skillHash: protocol.GENERATION_SKILL_HASH }
assert.equal(protocol.resultPassesReviews(protocol.parseGenerationResult(result)), true)
for (const mutate of [
  value => { value.draft += ' changed' },
  value => { value.substantive.draftHash = 'stale' },
  value => { value.references.pass = true; value.references.findings = [{ severity: 'blocker', issue: 'Missing clause', excerpt: 'Each party' }] },
  value => { value.skillHash = 'stale-skill' },
  value => { value.sessionIds[1] = value.sessionIds[0] },
  value => { value.references.findings = [{ severity: 'warning', issue: 'Invented excerpt', excerpt: 'Not in this draft' }] },
]) { const changed = structuredClone(result); mutate(changed); assert.throws(() => protocol.parseGenerationResult(changed)) }
const actor = { userId: 'legal-user', email: 'legal@example.invalid', role: 'LEGAL_ADMIN', fullName: 'Test Legal' }
let entitled = true
let workerReady = true
let documentQueries = 0
let status = 'QUEUED'
let output = null
const job = { id: 'owned-job', actor_user_id: actor.userId, worker_id: 'worker', kind: 'DRAFT', input: {}, skill_hash: protocol.GENERATION_SKILL_HASH, lease_token: 'lease', document_id: null }
const access = { async requireGlobalDocumentAccess(value) { if (!entitled || value.userId !== actor.userId) throw new Error('Access denied'); return value } }
const prisma = {
  appUser: { async findMany(query) { return query.where.email.in.includes(actor.email) ? [{ id: actor.userId, email: actor.email, role: actor.role, full_name: actor.fullName, is_active: true }] : [] }, async findUnique() { return { id: actor.userId, email: actor.email, role: actor.role, full_name: actor.fullName, is_active: true } } },
  contractGenerationWorker: { async findFirst(query) { if (query.where.id) assert.equal(query.where.id, 'worker'); return workerReady ? { id: 'worker' } : null } },
  contractGenerationJob: {
    async upsert(query) { documentQueries++; assert.equal(query.where.request_key, `${actor.userId}:request-123`); return { ...job, ...query.create } },
    async findFirst(query) { documentQueries++; if (query.where.actor_user_id !== actor.userId || (query.where.id && query.where.id !== job.id) || (query.where.status && query.where.status !== status)) return null; return { ...job, status, output_text: output?.draft, output_hash: output?.draftHash, reviews: output } },
    async updateMany(query) {
      documentQueries++
      if (query.where.id !== job.id || (query.where.actor_user_id?.in ? !query.where.actor_user_id.in.includes(actor.userId) : query.where.actor_user_id !== actor.userId) || query.where.worker_id !== 'worker' || query.where.lease_token !== 'lease' || query.where.status !== status) return { count: 0 }
      assert.ok(Number.isFinite(query.where.lease_expires_at.gte.getTime()))
      status = query.data.status
      if (query.data.reviews) output = query.data.reviews
      return { count: 1 }
    },
  },
}
function queue(enabled = true) {
  return load('src/lib/contract-generation-queue.ts', { 'node:crypto': crypto, '@/lib/prisma': { prisma }, '@/lib/document-access': access, './contract-generation': { CONTRACT_GENERATION_PAUSED: !enabled, CONTRACT_GENERATION_PAUSED_MESSAGE: 'Paused' }, './contract-generation-protocol': protocol, '@/generated/prisma/client': { Entity: { FSP: 'FSP' } } }, { LEGAL_GENERATION_WORKERS: JSON.stringify({ worker: { token: 'a'.repeat(40), ownerEmail: actor.email, actorEmails: [actor.email] } }) })
}
const q = queue()
assert.equal(q.authenticateGenerationWorker(new Headers({ 'x-legal-worker-id': 'worker', authorization: `Bearer ${'a'.repeat(40)}` })).id, 'worker')
assert.equal(q.authenticateGenerationWorker(new Headers({ 'x-legal-worker-id': 'worker', authorization: 'Bearer wrong' })), null)
const reads = documentQueries
entitled = false
await assert.rejects(() => q.queueGeneration(actor, 'DRAFT', {}, 'request-123'), /Access denied/)
assert.equal(documentQueries, reads)
entitled = true
workerReady = false
assert.equal((await q.generationAvailability(actor)).ready, false)
await assert.rejects(() => q.queueGeneration(actor, 'DRAFT', {}, 'request-123'), /paused/)
workerReady = true
assert.equal((await q.queueGeneration(actor, 'DRAFT', {}, 'request-123')).request_key, `${actor.userId}:request-123`)
status = 'RUNNING'
assert.equal((await q.handleGenerationWorker({ id: 'worker', ownerEmail: actor.email, actorEmails: [actor.email] }, { action: 'complete', jobId: job.id, leaseToken: 'lease', result })).accepted, true)
assert.equal(status, 'READY')
assert.equal((await q.requireReviewedGeneration(actor, job.id, content)).id, job.id)
await assert.rejects(() => q.requireReviewedGeneration(actor, job.id, `${content} changed`), /changed/)
await assert.rejects(() => q.requireReviewedGeneration(actor, 'someone-elses-job', content), /changed/)
status = 'CANCELLED'
assert.equal((await q.handleGenerationWorker({ id: 'worker', ownerEmail: actor.email, actorEmails: [actor.email] }, { action: 'complete', jobId: job.id, leaseToken: 'lease', result })).accepted, false)
assert.equal(status, 'CANCELLED')
status = 'RUNNING'
assert.equal((await q.handleGenerationWorker({ id: 'worker', ownerEmail: actor.email, actorEmails: ['outsider@example.invalid'] }, { action: 'complete', jobId: job.id, leaseToken: 'lease', result })).accepted, false, 'Worker cannot finish for a requester outside its allowlist')
status = 'RUNNING'
const blocked = structuredClone(result); blocked.references.pass = false; blocked.references.findings = [{ severity: 'blocker', issue: 'Clause mismatch', excerpt: 'Each party' }]
assert.equal((await q.handleGenerationWorker({ id: 'worker', ownerEmail: actor.email, actorEmails: [actor.email] }, { action: 'complete', jobId: job.id, leaseToken: 'lease', result: blocked })).accepted, true)
assert.equal(status, 'REVIEW_REQUIRED')
await assert.rejects(() => q.requireReviewedGeneration(actor, job.id, content), /changed/)
assert.equal((await queue(false).handleGenerationWorker({ id: 'worker', ownerEmail: actor.email, actorEmails: [actor.email] }, { action: 'complete', jobId: job.id, leaseToken: 'lease', result })).accepted, false)

let slackEmail = 'unknown@example.invalid'
let active = true
let profileCalls = 0
const slackPrisma = { appUser: { async findUnique(query) { return query.where.email === actor.email ? { id: actor.userId, email: actor.email, full_name: actor.fullName, role: actor.role, is_active: active } : null } } }
function slack(links = {}) {
  return load('src/lib/slack.ts', { 'node:crypto': crypto, './prisma': { prisma: slackPrisma } }, { SLACK_BOT_TOKEN: 'synthetic-token', SLACK_LEGAL_ADMINS: JSON.stringify({ UTEST: actor.email }), SLACK_LEGAL_IDENTITY_LINKS: JSON.stringify(links) }, async () => { profileCalls++; return { ok: true, async json() { return { ok: true, user: { id: 'UTEST', profile: { email: slackEmail } } } } } })
}
assert.equal(await slack().resolveSlackActor('UTEST'), null, 'Legacy admin mapping cannot impersonate an email')
slackEmail = actor.email
assert.equal((await slack().resolveSlackActor('UTEST')).userId, actor.userId)
active = false
assert.equal(await slack().resolveSlackActor('UTEST'), null)
active = true
slackEmail = 'legacy@example.invalid'
assert.equal((await slack({ UTEST: { verifiedEmail: slackEmail, appEmail: actor.email } }).resolveSlackActor('UTEST')).userId, actor.userId)
slackEmail = 'reassigned@example.invalid'
assert.equal(await slack({ UTEST: { verifiedEmail: 'legacy@example.invalid', appEmail: actor.email } }).resolveSlackActor('UTEST'), null)
assert.equal(profileCalls, 5, 'Every identity check must fetch current Slack profile')
let driveCalls = 0
const drive = load('src/lib/drive-retrieval.ts', {
  '@/lib/prisma': { prisma: { documentArtifact: { async findMany(query) { assert.equal(query.where.document.id, 'granted-only'); return [] } } } },
  '@/lib/document-access': { async isGlobalDocumentUser() { return false }, async documentScope() { return { id: 'granted-only' } } },
  '@/lib/drive-documents': { getApprovedDriveFolderIds() { return ['approved-folder'] }, getLegalDriveClient() { driveCalls++; throw new Error('Drive must not be called') } },
})
assert.equal((await drive.searchLegalDrive(actor, 'secret')).files.length, 0)
await assert.rejects(() => drive.requireDriveFileAccess(actor, 'unguessed-file-id'), /unavailable/)
assert.equal(driveCalls, 0)
console.log('CLI and Slack security checks passed: six malformed/stale review denials; current per-user readiness; ownership, cancellation and kill-switch gates; no API imports; fresh Slack identity and explicit alias checks; zero Drive reads for ungranted users. No live credentials, database, CLI or network used.')

// Exercise the actual command adapter across the newly shared write services.
const dispatches = []
const boundary = (name) => async (who, form) => {
  if (who.userId !== actor.userId) throw new Error('Access denied')
  dispatches.push({ name, actor: who.userId, values: Object.fromEntries(form.entries()) })
  return { success: true, id: 'synthetic-record' }
}
const opImports = {
  '@/lib/prisma': { prisma: {} }, '@/generated/prisma/client': { KycDocStatus: {}, LitigationStatus: {} },
  '@/lib/document-access': access, '@/lib/document-access-management': {},
  '@/lib/entity-service': { async listEntityProfiles(who) { await access.requireGlobalDocumentAccess(who); return [{ id: 'entity-id', legal_name: 'Synthetic Entity', _count: { filings: 0, kyc_documents: 0 }, owned_by: [{ id: 'ownership-id', owner_entity_id: null, owner_name: 'Synthetic Owner', percentage: '37.1234', effective_date: null, source_reference: 'Exact ownership source' }] }] } },
  '@/lib/review-service': { async listReviewSchedules(who) { await access.requireGlobalDocumentAccess(who); return [{ id: 'schedule-id', title: 'Synthetic review', kind: 'PUBLIC', active: true, start_date: new Date('2026-09-21T00:00:00Z'), updated_at: new Date('2026-09-21T01:02:03.456Z'), owner_id: 'owner-id', document_id: 'document-id', policy_id: null, interval_months: null, steady_interval_months: 6, source_reference: 'Exact review source' }] } },
  '@/lib/dispute-service': {}, '@/lib/document-exports': {}, '@/lib/drive-retrieval': {}, '@/lib/contract-generation-queue': {}, '@/lib/contract-generation-protocol': protocol,
  '@/lib/template-service': {},
  '@/lib/entity-record-service': Object.fromEntries(['saveEntityProfileForSession','saveEntityFilingForSession','saveEntityOwnershipForSession','linkKycToEntityForSession'].map(name => [name,boundary(name)])),
  '@/lib/review-schedule-service': Object.fromEntries(['createReviewScheduleForSession','saveReviewScheduleForSession','importReviewDependenciesForSession','setReviewScheduleActiveForSession','createInternalPolicyForSession'].map(name => [name,boundary(name)])),
  '@/lib/repository-service': Object.fromEntries(['proposeArtifactNameForActor','approveArtifactNameForActor','finalizeArtifactForActor','publishArtifactForActor','updateArtifactLineageForActor','updateNativeAmountForActor'].map(name => [name,boundary(name)])),
}
const operations = load('src/lib/slack-operations.ts', opImports)
for (const command of ['entity-save','filing-save','ownership-save','kyc-link','schedule-create','schedule-save','schedule-active','dependencies','policy-create','name-propose','name-approve','artifact-finalize','artifact-publish','artifact-lineage','amount']) {
  await operations.executeSlackOperation(actor, command, ' -- {"value":"100000000000000000.12","reference":"Exact  spacing\\nnext line","expected_updated_at":"2026-09-21T01:02:03.456Z"}', 'request')
}
assert.equal(dispatches.length, 15)
assert.ok(dispatches.every(call => call.values.value === '100000000000000000.12' && call.values.reference === 'Exact  spacing\nnext line' && call.actor === actor.userId))
await assert.rejects(() => operations.executeSlackOperation(actor, 'amount', ' -- {"value":100000000000000000.12}', 'request'), /decimal string/)
await assert.rejects(() => operations.executeSlackOperation(actor, 'amount', ' -- {"currency":"USD"}', 'request'), /Provide value/)
await assert.rejects(() => operations.executeSlackOperation({ ...actor, userId: 'outsider' }, 'entity-save', ' -- {"legal_name":"Not allowed"}', 'request'), /Access denied/)
assert.equal(dispatches.length, 15)
assert.equal(dispatches.find(call => call.name === 'saveReviewScheduleForSession').values.expected_updated_at, '2026-09-21T01:02:03.456Z')
assert.match(await operations.executeSlackOperation(actor, 'entities', '', 'read'), /Ownership IDs: ownership-id/)
const ownership = JSON.parse(await operations.executeSlackOperation(actor, 'entities', 'entity-id', 'read')).ownership[0]
assert.equal(ownership.id, 'ownership-id')
assert.equal(ownership.percentage, '37.1234')
assert.equal(ownership.source_reference, 'Exact ownership source')
assert.match(await operations.executeSlackOperation(actor, 'schedules', '', 'read'), /schedule-id.*revision 2026-09-21T01:02:03.456Z/)
const schedule = JSON.parse(await operations.executeSlackOperation(actor, 'schedules', 'schedule-id', 'read'))
assert.equal(schedule.expected_updated_at, '2026-09-21T01:02:03.456Z')
assert.equal(schedule.start_date, '2026-09-21')
assert.equal(schedule.document_id, 'document-id')
for (const command of ['entities', 'schedules']) await assert.rejects(() => operations.executeSlackOperation({ ...actor, userId: 'outsider' }, command, '', 'read'), /Access denied/)
assert.equal(operations.SLACK_OPERATION_INVENTORY.filter(item => item.mode !== 'dashboard').length, 17)
console.log('Slack adapter checks passed: 15 write service dispatches retain caller identity and exact decimal/text/revision fields; ownership IDs and editable schedule revisions are discoverable; numeric amounts, omitted amount and unauthorized callers rejected. 17 of 18 inventory workflows have commands, live completion remains a separate acceptance gate.')
