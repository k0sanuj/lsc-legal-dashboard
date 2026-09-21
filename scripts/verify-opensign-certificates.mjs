/** Executes actual provider parsing and certificate preservation with synthetic bytes and no external I/O. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as crypto from 'node:crypto'
import ts from 'typescript'

function load(path, imports, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  runInNewContext(compiled, { exports, require: name => { assert.ok(name in imports, `Unexpected ${name}`); return imports[name] }, Buffer, URL, Response, AbortSignal, console, ...globals })
  return exports
}
const providerStatus = { objectId: 'request-1', isCompleted: true, isDeclined: false, certificateUrl: 'https://sign.synthetic.test/certificate.pdf' }
const client = load('src/lib/opensign.ts', { 'node:crypto': crypto }, {
  process: { env: { OPENSIGN_BASE_URL: 'https://sign.synthetic.test/app', OPENSIGN_APP_ID: 'synthetic', OPENSIGN_MASTER_KEY: 'synthetic', OPENSIGN_USER_EMAIL: 'synthetic@example.test' } },
  fetch: async url => new Response(JSON.stringify(String(url).includes('/users?') ? { results: [{ objectId: 'user-1' }] } : String(url).endsWith('/loginAs') ? { sessionToken: 'synthetic-session' } : { result: { IsCompleted: true, CertificateUrl: providerStatus.certificateUrl, SignedUrl: 'https://sign.synthetic.test/signed.pdf', AuditTrail: [] } })),
})
assert.equal((await client.fetchOpenSignDocument('request-1')).certificateUrl, providerStatus.certificateUrl)

async function fixture(mode = 'available') {
  const doc = { id: 'doc-1', title: 'Synthetic agreement', entity: 'LSC', signature_provider: 'opensign', signature_provider_request_id: 'request-1', signature_status: 'SIGNED', signature_completed_at: new Date(), signature_certificate_checked_at: null }
  const records = []; let downloads = 0; let uploads = 0; let overlapStatus; let clockOffset = 0
  class TestDate extends Date { constructor(...args) { if (args.length) super(...args); else super(Date.now() + clockOffset) } static now() { return Date.now() + clockOffset } }
  const prisma = {
    legalDocument: { findUnique: async () => ({ ...doc }), updateMany: async ({ where, data }) => {
      if (where.signature_provider_request_id !== doc.signature_provider_request_id || ('signature_certificate_checked_at' in where && where.signature_certificate_checked_at !== doc.signature_certificate_checked_at)) return { count: 0 }
      Object.assign(doc, data); return { count: 1 }
    } },
    documentArtifact: { findFirst: async ({ where }) => where.stage === 'certificate' ? records[0] ?? null : { id: 'signed-1' } },
  }
  prisma.$transaction = async callback => callback(prisma)
  const subject = load('src/lib/opensign-certificates.ts', {
    '@/lib/prisma': { prisma }, '@/lib/opensign': { fetchOpenSignDocument: async () => providerStatus },
    '@/lib/document-artifacts': { artifactResponse: async () => { throw new Error('Unexpected managed GCS read') }, boundedArtifactBytes: async response => Buffer.from(await response.arrayBuffer()), recordArtifact: async value => { records.push({ id: 'certificate-1', ...value }); return records.at(-1) } },
    '@/lib/s3': { getS3Key: () => 'certificate/synthetic.pdf', getS3KeyFromUrl: () => null, uploadBufferToS3: async () => { uploads++; return 'https://storage.synthetic.test/certificate.pdf' } },
  }, { Date: TestDate, process: { env: { OPENSIGN_BASE_URL: 'https://sign.synthetic.test/app' } }, fetch: async (_url, options) => {
    downloads++; assert.equal(options.redirect, 'error')
    if (mode === 'overlap' && downloads === 1) overlapStatus = (await subject.preserveOpenSignCertificate(doc.id, providerStatus)).status
    if (mode === 'expired-failure' && downloads === 1) {
      clockOffset = 11 * 60000
      assert.equal((await subject.preserveOpenSignCertificate(doc.id, providerStatus)).status, 'stored')
      return new Response('Old attempt failed after retry succeeded', { status: 404 })
    }
    if (mode === 'replaced') doc.signature_provider_request_id = 'request-other'
    return new Response(mode === 'invalid' ? 'Not a PDF' : '%PDF-1.7\nSynthetic certificate bytes', { status: mode === 'unavailable' ? 404 : 200 })
  } })
  const status = { ...providerStatus, ...(mode === 'absent' ? { certificateUrl: null } : mode === 'external' ? { certificateUrl: 'https://unapproved.synthetic.test/certificate.pdf' } : {}) }
  const result = await subject.preserveOpenSignCertificate(doc.id, status)
  return { doc, records, downloads, uploads, result, subject, overlapStatus }
}
const stored = await fixture()
assert.equal(stored.result.status, 'stored')
assert.equal(stored.records[0].stage, 'certificate')
assert.equal(stored.records[0].sourceArtifactId, 'signed-1')
assert.equal(stored.records[0].bytes.toString(), '%PDF-1.7\nSynthetic certificate bytes')
assert.equal(stored.doc.signature_certificate_status, 'stored')
await stored.subject.preserveOpenSignCertificate(stored.doc.id, providerStatus)
assert.equal(stored.records.length, 1)
const absent = await fixture('absent')
assert.equal(absent.result.status, 'unavailable')
assert.equal(absent.downloads, 0)
assert.equal(absent.records.length, 0)
assert.match(absent.doc.signature_certificate_error, /CertificateUrl/)
for (const mode of ['external', 'invalid', 'unavailable', 'replaced']) {
  const denied = await fixture(mode)
  assert.equal(denied.result.status, 'failed')
  assert.equal(denied.records.length, 0)
  if (mode === 'external') assert.equal(denied.downloads, 0)
}
const overlap = await fixture('overlap')
assert.equal(overlap.overlapStatus, 'checking')
assert.equal(overlap.downloads, 1)
const staleFailure = await fixture('expired-failure')
assert.equal(staleFailure.doc.signature_certificate_status, 'stored')
assert.equal(staleFailure.doc.signature_certificate_error, null)
assert.equal(staleFailure.records.length, 1)
console.log('PASS actual provider CertificateUrl parsing, PDF byte preservation, signed-artifact lineage, idempotency, explicit absence, untrusted-origin/invalid-PDF/download failure, stale-binding denial, duplicate in-flight prevention and old-failure/new-success receipt isolation')
