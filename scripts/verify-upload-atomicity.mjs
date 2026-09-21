/** Actual upload actions with isolated transaction state and injected failures, no network or database. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const actor = { userId: 'synthetic', email: 'legal@futureofsports.io', role: 'LEGAL_ADMIN' }
let state, fail, key = 0
const background = []
function database(records) {
  return {
    legalDocument: {
      create: async ({ data }) => { const record = { id: 'doc', ...data }; records.docs.push(record); return record },
      update: async ({ data }) => Object.assign(records.docs[0], data),
      findUnique: async () => records.docs[0],
    },
    documentVersion: {
      findFirst: async () => null,
      create: async ({ data }) => { if (fail === 'version') throw new Error('Injected version failure'); const record = { id: 'version', ...data }; records.versions.push(record); return record },
    },
    lifecycleEvent: { create: async ({ data }) => { if (fail === 'lifecycle') throw new Error('Injected lifecycle failure'); const record = { id: 'event', ...data }; records.events.push(record); return record } },
    contractTemplate: { create: async ({ data }) => { const record = { id: 'template', ...data }; records.templates.push(record); return record } },
    policyDocument: { update: async ({ data }) => Object.assign(records.policies[0], data) },
  }
}
const prisma = new Proxy({}, { get(_target, property) {
  if (property === '$transaction') return async (work) => {
    const draft = structuredClone(state)
    const transaction = { ...database(draft), artifacts: draft.artifacts, reviews: draft.reviews }
    const result = await work(transaction)
    state = draft
    return result
  }
  return database(state)[property]
} })
async function notifyChange(_id, reference, transaction) {
  assert.ok(transaction?.reviews, 'Review trigger must use the same transaction client')
  if (fail === 'hook') throw new Error('Injected review trigger failure')
  transaction.reviews.push(reference)
}
const modules = {
  '@/lib/document-access': { requireGlobalDocumentAccess: async () => actor },
  '@/lib/auth': { requireSession: async () => actor, requireRole: async () => actor },
  '@/lib/document-artifacts': { recordArtifact: async (input, transaction) => {
    assert.ok(transaction?.artifacts, 'Artifact must use the same transaction client')
    if (fail === 'artifact') throw new Error('Injected artifact failure')
    transaction.artifacts.push(input)
    return { id: 'artifact' }
  } },
  '@/lib/review-service': { notifyDocumentReviewChange: notifyChange, notifyPolicyReviewChange: notifyChange },
  '@/lib/prisma': { prisma },
  '@/lib/s3': { getS3Key: () => `synthetic-${++key}`, uploadToS3: async () => `managed-${key}`, uploadBufferToS3: async () => `managed-${key}` },
  '@/lib/extract-text': { extractTextFromFile: async () => { if (fail === 'extraction') throw new Error('Injected extraction failure'); return '' } },
  '@/lib/agents/orchestrator': { runAgent: async () => {} },
  'next/server': { after: (work) => { if (fail === 'background') throw new Error('Injected scheduling failure'); background.push(work) } },
  'next/cache': { revalidatePath: () => {} },
  '@/generated/prisma/client': { Prisma: { Decimal: class {} } },
  '@/lib/constants': { VALID_TRANSITIONS: { DRAFT: ['IN_REVIEW'] }, ENTITIES: [] },
  '@/lib/finance-webhook': {}, '@/lib/finance-payloads': {}, '@/lib/finance-mapping': {},
  '@anthropic-ai/sdk': { default: class {} },
}
function load(path) {
  const record = { exports: {} }
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  runInNewContext(output, { module: record, exports: record.exports, require(name) { if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name] }, Date, Buffer, File, console: { error() {} }, process: { env: {} } })
  return record.exports
}
const files = load('../src/actions/files.ts')
const documents = load('../src/actions/documents.ts')
const templates = load('../src/actions/templates.ts')
const form = new FormData()
for (const [name, value] of Object.entries({ documentId: 'doc', policyId: 'policy', title: 'Synthetic', name: 'Synthetic', category: 'NDA', entity: 'FSP', content: 'Synthetic text' })) form.set(name, value)
form.set('file', new File(['synthetic'], 'a.txt'))
function reset(existing = true) {
  state = { docs: existing ? [{ id: 'doc', title: 'Synthetic', file_url: 'original', lifecycle_status: 'DRAFT' }] : [], versions: [], events: [], artifacts: [], templates: [], policies: [{ id: 'policy', file_url: 'original' }], reviews: [] }
  background.length = 0
}
for (const [action, mode, existing] of [
  [files.uploadDocumentFile, 'artifact', true], [files.uploadDocumentFile, 'hook', true],
  [files.uploadVersionFile, 'version', true], [files.uploadVersionFile, 'hook', true],
  [files.uploadPolicyFile, 'hook', true], [documents.createDocument, 'lifecycle', false],
  [templates.createTemplate, 'artifact', false],
  [() => documents.transitionDocument('doc', 'IN_REVIEW'), 'hook', true],
]) {
  reset(existing); fail = mode
  const snapshot = structuredClone(state)
  try { await action(form) } catch { /* Template API throws, other actions return failure. */ }
  assert.deepEqual(state, snapshot, `Partial database state after ${mode}`)
}
for (const action of [files.uploadDocumentFile, files.uploadVersionFile]) {
  for (const mode of ['extraction', 'background']) {
    reset(); fail = mode
    const result = await action(form)
    assert.equal(result.success, true, `${mode} must not turn a saved upload into failure`)
    assert.equal(state.artifacts.length, 1)
    assert.equal(state.reviews.length, 1)
    for (const work of background) await work()
  }
}
console.log('PASS upload atomicity: injected artifact/version/lifecycle/review failures roll back together; post-save extraction or scheduling failures preserve honest success. Actual actions, no live network/database.')
