/** Executes the actual TypeScript signing modules with synthetic state and no external I/O. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function loadModule(path, modules, globals = {}) {
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  runInNewContext(output, { exports, require(name) { if (!(name in modules)) throw new Error(`Unexpected import: ${name}`); return modules[name] }, Buffer, Response, File, FormData, AbortSignal, console, setTimeout, ...globals }, { filename: path })
  return exports
}
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key])
    if (value && typeof value === 'object' && 'not' in value) return row[key] !== value.not
    if (value instanceof Date) return row[key]?.getTime() === value.getTime()
    return row[key] === value
  })
}
function fixture() {
  const signer = { id: 'signer-A', document_id: 'doc-1', signatory_name: 'Synthetic Signer', signatory_email: 'synthetic@example.test', status: 'SENT', signed_at: null, viewed_at: null, sent_at: new Date('2026-09-21T00:00:00Z') }
  const state = { doc: { id: 'doc-1', title: 'Synthetic agreement', entity: 'LSC', file_url: 'https://synthetic.test/source-A', signature_provider: 'opensign', signature_provider_request_id: 'request-A', signature_source_artifact_id: 'artifact-A', signature_status: 'SENT', signature_completed_at: null, signature_sent_at: signer.sent_at, lifecycle_status: 'AWAITING_SIGNATURE', signature_requests: [signer] }, versions: [], artifacts: [], events: [], outbox: [], finance: 0 }
  const prisma = {
    legalDocument: {
      findUnique: async () => structuredClone(state.doc),
      update: async ({ data }) => Object.assign(state.doc, data),
      updateMany: async ({ where, data }) => { if (!matches(state.doc, where)) return { count: 0 }; Object.assign(state.doc, data); return { count: 1 } },
    },
    documentArtifact: { findFirst: async () => ({ id: 'artifact-A', stage: 'populated', signer_scope: ['synthetic@example.test'] }) },
    documentVersion: { findFirst: async () => state.versions.at(-1) ?? null, create: async ({ data }) => { const row = { id: `version-${state.versions.length}`, ...data }; state.versions.push(row); return row } },
    signatureRequest: {
      update: async ({ data }) => Object.assign(signer, data),
      updateMany: async ({ where, data }) => { if (!matches(signer, where)) return { count: 0 }; Object.assign(signer, data); return { count: 1 } },
    },
    lifecycleEvent: { create: async ({ data }) => { state.events.push(data); return data } },
  }
  prisma.$transaction = async (callback) => { const before = structuredClone(state); try { return typeof callback === 'function' ? await callback(prisma) : await Promise.all(callback) } catch (error) { Object.assign(state, before); Object.assign(signer, before.doc.signature_requests[0]); state.doc.signature_requests = [signer]; throw error } }
  return { state, prisma }
}
const status = { objectId: 'request-A', isCompleted: true, isDeclined: false, signedUrl: 'https://synthetic.test/signed-A', signedEmails: [], viewedEmails: [], raw: {}, declinedReason: null }
async function completion(replaceDuringDownload, failQueue = false, failDelivery = false) {
  const { state, prisma } = fixture()
  const modules = {
    'next/server': { after() {} }, '@/lib/prisma': { prisma }, '@/lib/opensign': { fetchOpenSignDocument: async () => status },
    '@/lib/s3': { getS3Key: () => 'signed/synthetic-A.pdf', uploadBufferToS3: async () => 'https://synthetic.test/stored-signed-A' },
    '@/lib/extract-text': { extractTextFromFile: async () => '' }, '@/lib/agents/orchestrator': { runAgent: async () => {} },
    '@/lib/finance-webhook': { queueFinanceEvent: async () => { if (failQueue) throw new Error('Synthetic outbox write failed'); const row = { id: 'finance-event' }; state.outbox.push(row); return row }, deliverFinanceEvent: async () => { state.finance++; if (failDelivery) throw new Error('Synthetic delivery failed'); return { ok: true } } }, '@/lib/review-service': { notifyDocumentReviewChange: async () => ({ created: 0 }) }, '@/lib/finance-payloads': { buildContractPayload: () => ({}) },
    '@/lib/document-artifacts': { recordArtifact: async (input) => { state.artifacts.push(input); return { id: 'signed-A' } }, artifactResponse: async () => new Response('signed A'), boundedArtifactBytes: async (response) => Buffer.from(await response.arrayBuffer()) },
  }
  const loaded = loadModule('src/lib/opensign-sync.ts', modules, { fetch: async () => {
    if (replaceDuringDownload) Object.assign(state.doc, { signature_provider_request_id: 'request-B', signature_source_artifact_id: 'artifact-B', file_url: 'https://synthetic.test/source-B' })
    return new Response('signed A')
  } })
  let result; let error
  try { result = await loaded.applyOpenSignStatus('doc-1', status) } catch (caught) { error = caught }
  if (error && !failQueue) throw error
  return { state, result, loaded, error }
}
if (process.argv.includes('--expect-vulnerable')) {
  const { state } = await completion(true)
  assert.equal(state.doc.signature_provider_request_id, 'request-B')
  assert.equal(state.doc.signature_status, 'SIGNED')
  assert.equal(state.versions.length, 1)
  console.log('REPRODUCED: stale request A completion marks newer request B signed and files signed A')
} else {
  const stale = await completion(true)
  assert.equal(stale.state.doc.signature_status, 'SENT')
  assert.equal(stale.state.doc.file_url, 'https://synthetic.test/source-B')
  assert.equal(stale.state.versions.length, 0)
  assert.equal(stale.state.artifacts.length, 0)
  assert.equal(stale.state.finance, 0)
  const current = await completion(false)
  assert.equal(current.state.doc.signature_status, 'SIGNED')
  assert.equal(current.state.versions.length, 1)
  assert.equal(current.state.artifacts[0].sourceArtifactId, 'artifact-A')
  await current.loaded.applyOpenSignStatus('doc-1', status)
  assert.equal(current.state.versions.length, 1)
  assert.equal(current.state.finance, 1)
  const queueFailure = await completion(false, true)
  assert.match(queueFailure.error.message, /outbox write failed/)
  assert.equal(queueFailure.state.doc.signature_status, 'SENT')
  assert.equal(queueFailure.state.versions.length, 0)
  const deliveryFailure = await completion(false, false, true)
  assert.equal(deliveryFailure.state.doc.signature_status, 'SIGNED')
  assert.equal(deliveryFailure.state.outbox.length, 1)
  assert.equal(deliveryFailure.state.doc.finance_post_status, 'failed')
  console.log('PASS actual-module stale-request CAS, source binding, single version/Finance dispatch, outbox enqueue rollback and durable delivery retry')
}

if (!process.argv.includes('--expect-vulnerable')) {
  const { randomUUID } = await import('node:crypto')
  async function sendFixture(uncertain = false) {
    const { state, prisma } = fixture()
    Object.assign(state.doc, { signature_provider: null, signature_provider_request_id: null, signature_source_artifact_id: null, signature_status: null, lifecycle_status: 'DRAFT' })
    state.doc.signature_requests[0].status = 'PENDING'
    let created = 0
    let reachedProvider
    let finishProvider
    const reached = new Promise((resolve) => { reachedProvider = resolve })
    const finish = new Promise((resolve) => { finishProvider = resolve })
    const action = loadModule('src/actions/opensign.ts', {
      'node:crypto': { randomUUID }, '@/lib/document-access': { requireGlobalDocumentAccess: async () => ({ userId: 'actor' }) },
      '@/lib/app-url': { getAppBaseUrl: () => 'https://synthetic.test' }, '@/lib/auth': { requireRole: async () => ({ userId: 'actor', email: 'synthetic-legal@example.test' }) },
      '@/lib/document-artifacts': { recordArtifact: async () => ({ id: 'source-captured' }) }, '@/lib/prisma': { prisma },
      '@/lib/legal-tracker': { emitLegalTrackerEvent: async () => ({ ok: true }) }, '@/lib/legal-tracker-payloads': { buildAgreementSentMessage: () => ({}) },
      '@/lib/opensign': { createOpenSignDocument: async () => { created++; reachedProvider(); await finish; if (uncertain) throw new Error('Synthetic connection lost after submission'); return { providerDocumentId: 'request-new', signingLinks: {} } } },
      '@/lib/s3': { getPresignedUrl: async (url) => url, getS3KeyFromUrl: () => null }, 'next/cache': { revalidatePath() {} }, 'next/server': { after() {} },
      'pdf-lib': { PDFDocument: { load: async () => ({ getPages: () => [{ getSize: () => ({ width: 600, height: 800 }), getCropBox: () => ({ width: 600, height: 800 }), getRotation: () => ({ angle: 0 }) }] }) } },
    }, { fetch: async () => new Response('synthetic PDF'), console: { ...console, error() {} } })
    const form = new FormData(); form.set('documentId', 'doc-1')
    const first = action.createOpenSignSignatureRequest(form)
    await reached
    const duplicate = await action.createOpenSignSignatureRequest(form)
    assert.equal(duplicate.success, false)
    assert.equal(created, 1)
    finishProvider()
    const result = await first
    assert.equal(result.success, !uncertain)
    if (uncertain) {
      assert.equal(state.doc.signature_status, 'SEND_UNCERTAIN')
      const retry = await action.createOpenSignSignatureRequest(form)
      assert.equal(retry.success, false)
      assert.equal(created, 1)
      assert.match(state.events[0].notes, /requires reconciliation/)
    } else {
      assert.equal(state.doc.signature_provider_request_id, 'request-new')
      assert.equal(state.doc.signature_source_artifact_id, 'source-captured')
      assert.equal(state.doc.signature_status, 'SENT')
    }
  }
  await sendFixture(false)
  await sendFixture(true)
  let providerReads = 0
  let applied = 0
  const logs = []
  const route = loadModule('src/app/api/webhooks/opensign/route.ts', {
    'next/server': {}, '@/generated/prisma/client': {},
    '@/lib/prisma': { prisma: {
      legalDocument: { findFirst: async ({ where }) => where.signature_provider_request_id === 'request-current' ? { id: 'doc-1' } : null },
      webhookEventLog: { findUnique: async () => null, upsert: async ({ create }) => ({ id: 'log', ...create }), update: async ({ data }) => { logs.push(data); return data } },
    } },
    '@/lib/opensign': { hashOpenSignWebhookEvent: (body) => createHash('sha256').update(body).digest('hex'), verifyOpenSignWebhookSignature: () => true, fetchOpenSignDocument: async (id) => { providerReads++; return { ...status, objectId: id } } },
    '@/lib/opensign-sync': { applyOpenSignStatus: async (id, current) => { assert.equal(id, 'doc-1'); assert.equal(current.objectId, 'request-current'); applied++; return { status: 'completed' } } },
  })
  await route.POST(new Request('https://synthetic.test/webhook', { method: 'POST', body: JSON.stringify({ objectId: 'request-old', metadata: { documentId: 'doc-1' }, event: 'completed' }) }))
  assert.equal(logs.at(-1).processing_status, 'ignored')
  assert.equal(providerReads, 0)
  assert.equal(applied, 0)
  await route.POST(new Request('https://synthetic.test/webhook', { method: 'POST', body: JSON.stringify({ objectId: 'request-current', metadata: { documentId: 'doc-1' }, event: 'completed' }) }))
  assert.equal(applied, 1)
  console.log('PASS actual-module duplicate-send prevention, uncertain-send hold, stale-webhook denial and shared trusted reconciliation')
}
