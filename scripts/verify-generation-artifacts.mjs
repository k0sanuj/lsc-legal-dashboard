/** Executes real MNDA/generation saves and artifact hashing with transactional, storage and signer boundaries. */
import assert from 'node:assert/strict'
import * as crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function load(path, imports, env = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
  const record = { exports: {} }
  runInNewContext(compiled.outputText, {
    module: record, exports: record.exports, Buffer, crypto, process: { env },
    console: { error() {}, log() {} }, fetch() { throw new Error('Unexpected network') },
    require(name) { assert.ok(Object.hasOwn(imports, name), `Unexpected import ${path}: ${name}`); return imports[name] },
  }, { filename: path, timeout: 1000 })
  return record.exports
}
const actor = { userId: 'legal-user', email: 'legal@example.invalid', role: 'LEGAL_ADMIN', display: 'Synthetic Legal', fullName: 'Synthetic Legal' }
const protocol = load('src/lib/contract-generation-protocol.ts', { 'node:crypto': crypto })
const templates = load('src/lib/mnda-templates.ts', {})
const original = 'SYNTHETIC MNDA\nExact UTF-8 source: café.\n{{counterparty_name}} keeps confidential material.\n<<SIGNATURE_BLOCK>>'
const pdf = Buffer.from('synthetic PDF bytes')
const params = { templateKind: 'individual', counterpartyName: 'Synthetic Person', counterpartyEmail: 'person@example.invalid', ccEmails: [], termYears: 2, effectiveDate: '2026-09-21' }

function fixture({ fallback = false, failArtifact = '', failReceipt = false, failUpload = false, invalidReview = false } = {}) {
  let committed = { documents: [], artifacts: [], templates: [], versions: [], events: [], job: null }
  const uploads = []
  let providerCalls = 0
  let providerSawSource = false
  const db = (state, lazy = false) => {
    const operation = fn => lazy ? { execute: next => fn(next) } : Promise.resolve().then(() => fn(state))
    return {
      contractTemplate: {
        findFirst: async () => fallback ? null : { id: 'db-template', content: original },
        upsert: query => operation(next => { const row = next.templates.find(item => item.id === query.where.id); if (row) return row; next.templates.push(query.create); return query.create }),
        create: query => operation(next => { next.templates.push(query.data); return query.data }),
        update: query => operation(() => ({ id: query.where.id })),
      },
      legalDocument: {
        create: query => operation(next => {
          const row = { id: 'document-id', ...query.data, signature_requests: (query.data.signature_requests?.create ?? []).map((signer, index) => ({ ...signer, id: `signer-${index}` })) }
          next.documents.push(row); return row
        }),
        update: query => operation(next => {
          if (failReceipt && query.data.lifecycle_status === 'AWAITING_SIGNATURE') throw new Error('Synthetic receipt failure')
          const row = next.documents.find(item => item.id === query.where.id); assert.ok(row); Object.assign(row, query.data); return row
        }),
      },
      documentArtifact: {
        findUniqueOrThrow: query => operation(next => { const row = next.artifacts.find(item => item.id === query.where.id); assert.ok(row); return row }),
        upsert: query => operation(next => {
          if (query.create.stage === failArtifact) throw new Error('Synthetic artifact failure')
          const row = next.artifacts.find(item => item.id === query.where.id); if (row) return row
          next.artifacts.push(query.create); return query.create
        }),
      },
      documentVersion: { create: query => operation(next => { next.versions.push(query.data); return query.data }) },
      contractGenerationJob: { updateMany: query => operation(next => { next.job = query.data; return { count: 1 } }) },
      lifecycleEvent: { create: query => operation(next => { next.events.push(query.data); return query.data }) },
      authAccessEvent: { create: query => operation(next => { next.events.push(query.data); return query.data }) },
      signatureRequest: { update: query => operation(() => ({ id: query.where.id, ...query.data })) },
    }
  }
  const prisma = {
    ...db(null, true),
    async $transaction(work) {
      const next = structuredClone(committed)
      const result = typeof work === 'function' ? await work(db(next)) : await Promise.all(work.map(item => item.execute(next)))
      committed = next
      return result
    },
  }
  const storage = {
    getS3Key: (...parts) => parts.join('/'),
    async uploadBufferToS3(bytes, key, mime) {
      if (failUpload) throw new Error('Synthetic upload failure')
      uploads.push({ bytes: Buffer.from(bytes), key, mime })
      return `https://storage.invalid/private/${key}`
    },
  }
  const artifacts = load('src/lib/document-artifacts.ts', {
    'node:crypto': crypto, '@/lib/prisma': { prisma }, '@/lib/export-limits': { MAX_DOCUMENT_FILE_BYTES: 26214400 }, '@/lib/s3': storage,
  })
  const anchors = Object.fromEntries(['cp_signature', 'cp_date', 'fsp_signature', 'fsp_date'].map(name => [name, { page: 1, xPct: 10, yPct: 10, wPct: 10, hPct: 10 }]))
  const mnda = load('src/lib/mnda.ts', {
    'node:crypto': crypto, 'next/server': { after() {} }, '@/lib/prisma': { prisma }, '@/lib/s3': storage,
    '@/lib/opensign': { async createOpenSignDocument(input) {
      providerCalls++
      const doc = committed.documents[0]
      const populated = committed.artifacts.find(item => item.id === doc.signature_source_artifact_id)
      const source = committed.artifacts.find(item => item.id === populated.source_artifact_id)
      providerSawSource = source.stage === 'template' && populated.sha256 === crypto.createHash('sha256').update(input.fileBytes).digest('hex')
      return { providerDocumentId: 'synthetic-provider-document', signingLinks: {} }
    } },
    '@/lib/pdf/contract-pdf': { async renderContractPdf() { return { bytes: pdf, pages: 1, anchors } } },
    '@/lib/mnda-templates': templates,
    '@/lib/legal-tracker': { emitLegalTrackerEvent() { throw new Error('Notifications must stay deferred') } },
    '@/lib/legal-tracker-payloads': { buildAgreementSentMessage: value => value },
    '@/lib/app-url': { getAppBaseUrl: () => 'https://app.example.invalid' }, '@/lib/document-artifacts': artifacts,
  }, { MNDA_FSP_SIGNER_NAME: 'Synthetic FSP Signer', MNDA_FSP_SIGNER_EMAIL: 'signer@example.invalid' })
  const access = { async requireGlobalDocumentAccess(session) { assert.equal(session, actor); return actor } }
  const enums = { Entity: { FSP: 'FSP' }, DocumentCategory: { NDA: 'NDA' }, Prisma: { Decimal: class { constructor(value) { this.value = value } } } }
  const templateService = load('src/lib/template-service.ts', {
    'node:crypto': crypto, '@/lib/prisma': { prisma }, '@/generated/prisma/client': enums, '@/lib/document-access': access,
    '@/lib/document-artifacts': artifacts, '@/lib/s3': storage, '@/lib/contract-generation-protocol': protocol,
  })
  const generatedContent = 'Both parties protect confidential information.'
  const source = { templateId: 'db-template', template: original, entity: 'FSP', category: 'NDA', variables: {} }
  const actions = load('src/actions/generate.ts', {
    'node:crypto': crypto, '@/lib/auth': { requireRole: async () => actor }, '@/lib/prisma': { prisma },
    '@/lib/contract-generation': { CONTRACT_GENERATION_PAUSED: true, CONTRACT_GENERATION_PAUSED_MESSAGE: 'Paused' },
    'next/cache': { revalidatePath() {} }, '@/generated/prisma/client': enums, '@/lib/document-access': access,
    '@/lib/contract-generation-queue': { async requireReviewedGeneration(session, id, content) {
      assert.equal(session, actor); assert.equal(id, 'reviewed-job'); assert.equal(content, generatedContent)
      if (invalidReview) throw new Error('Synthetic blocked review')
      return { id, kind: 'DRAFT', input: source, output_hash: protocol.hashDraft(content), document_id: null }
    } },
    '@/lib/s3': storage, '@/lib/document-artifacts': artifacts, '@/lib/contract-generation-protocol': protocol, '@/lib/template-service': templateService,
  })
  return { mnda, actions, generatedContent, uploads, state: () => committed, providerCalls: () => providerCalls, providerSawSource: () => providerSawSource }
}

for (const fallback of [false, true]) {
  const f = fixture({ fallback })
  assert.equal((await f.mnda.sendMnda(params, actor)).success, true)
  assert.equal(f.providerCalls(), 1)
  assert.equal(f.providerSawSource(), true, 'Exact populated artifact and its template source must be committed before signing')
  const source = f.state().artifacts.find(item => item.stage === 'template')
  const sourceBytes = Buffer.from(fallback ? templates.mndaIndividualTemplate : original)
  assert.equal(source.sha256, crypto.createHash('sha256').update(sourceBytes).digest('hex'))
  assert.deepEqual(f.uploads.find(item => item.key.includes('mnda-source')).bytes, sourceBytes)
  assert.equal(source.naming_metadata.provenance.source, fallback ? 'checked-in-mnda-fallback' : 'database-template-snapshot')
  assert.equal(source.finalized_at, null, 'Recording source does not invent approval')
  if (fallback) { assert.equal(f.state().templates[0].is_active, false); assert.equal(f.state().templates[0].content, templates.mndaIndividualTemplate) }
}
for (const options of [{ failArtifact: 'template' }, { failArtifact: 'populated' }, { failUpload: true }]) {
  const f = fixture(options)
  const result = await f.mnda.sendMnda(params, actor)
  assert.equal(result.success, false)
  assert.match(result.error, /before a send was attempted/)
  assert.equal(f.providerCalls(), 0)
  assert.equal(f.state().documents.length, 0)
  assert.equal(f.state().artifacts.length, 0)
}
const uncertain = fixture({ failReceipt: true })
assert.match((await uncertain.mnda.sendMnda(params, actor)).error, /could not be confirmed/)
assert.equal(uncertain.providerCalls(), 1)
assert.equal(uncertain.state().documents[0].lifecycle_status, 'DRAFT')
assert.ok(uncertain.state().documents[0].signature_source_artifact_id)

for (const saveTemplate of [false, true]) {
  for (const failArtifact of ['', saveTemplate ? 'template' : 'populated']) {
    const f = fixture({ failArtifact })
    const result = saveTemplate
      ? await f.actions.saveAsTemplate('Synthetic reviewed template', 'NDA', 'FSP', f.generatedContent, [], 'reviewed-job')
      : await f.actions.saveGeneratedDocument('Synthetic draft', 'FSP', 'NDA', f.generatedContent, {}, undefined, 'reviewed-job')
    assert.equal(result.success, !failArtifact)
    if (failArtifact) {
      assert.equal(f.state().documents.length + f.state().templates.length + f.state().artifacts.length + f.state().versions.length, 0, 'Artifact failure must roll back every related record')
    } else if (saveTemplate) {
      assert.equal(f.state().templates[0].content, f.generatedContent)
      assert.equal(f.state().artifacts[0].sha256, protocol.hashDraft(f.generatedContent))
    } else {
      const populated = f.state().artifacts.find(item => item.stage === 'populated')
      const source = f.state().artifacts.find(item => item.id === populated.source_artifact_id)
      assert.equal(source.sha256, protocol.hashDraft(original))
      assert.equal(populated.sha256, protocol.hashDraft(f.generatedContent))
      assert.equal(f.state().job.human_approved_by, actor.userId)
    }
  }
}
const blocked = fixture({ invalidReview: true })
assert.equal((await blocked.actions.saveAsTemplate('Blocked', 'NDA', 'FSP', blocked.generatedContent, [], 'reviewed-job')).success, false)
assert.equal(blocked.uploads.length, 0, 'Blocked reviews cannot publish template bytes')
console.log('MNDA and reviewed-generation artifacts passed: exact source bytes/hash/lineage, truthful fallback provenance, atomic rollback, zero signing calls before artifact commit, uncertainty after provider receipt failure, and source artifacts for saved templates. No real storage, signing or model calls.')
