/** Runs the actual protected byte routes with synthetic active content and mocked authorized storage. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

let mime = 'text/html', allowed = true, storageReads = 0
const body = Buffer.from('<script>window.synthetic = true</script>')
class DocumentAccessDenied extends Error {}
const actor = { userId: 'synthetic' }
const row = { id: 'synthetic', document_id: 'document', file_url: 'managed-source', document_name: "Synthetic's file", title: 'Synthetic', original_name: 'synthetic.html', get mime_type() { return mime } }
const models = new Proxy({}, { get() { return { findUnique: async () => row, findUniqueOrThrow: async () => row } } })
models.documentExport = undefined
const prisma = new Proxy(models, { get(target, property) {
  if (property === 'documentExport') return {
    findFirst: async () => ({ id: 'job', snapshot: {}, archive_url: 'managed-export', created_at: new Date('2026-09-21T00:00:00Z'), expires_at: new Date(Date.now() + 60000) }),
    update: async () => ({}),
  }
  return target[property]
} })
async function entitlement() { if (!allowed) throw new DocumentAccessDenied(); return actor }
async function storageResponse() { storageReads++; return new Response(body, { headers: { 'Content-Type': mime } }) }
const modules = {
  '@/lib/auth': { getOptionalSession: async () => actor, requireSession: async () => actor },
  '@/lib/document-access': { requireDocumentAccess: entitlement, requireGlobalDocumentAccess: entitlement, DocumentAccessDenied },
  '@/lib/prisma': { prisma },
  '@/lib/document-artifacts': { artifactResponse: storageResponse },
  '@/lib/document-exports': { requireExportAccess: entitlement },
  '@/lib/drive-retrieval': { fetchLegalDriveFile: async () => { await entitlement(); return { bytes: body, contentType: mime, name: 'synthetic.html' } } },
  '@/lib/s3': { getS3KeyFromUrl: () => 'synthetic-key', getPresignedUrl: async () => 'https://synthetic.invalid/file' },
  'next/server': { NextResponse: Response },
}
function load(path) {
  const record = { exports: {} }
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  runInNewContext(output, { module: record, exports: record.exports, require(name) { if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name] }, Response, Uint8Array, Buffer, Date, AbortSignal, fetch: storageResponse, console })
  return record.exports
}
modules['@/lib/file-response'] = load('../src/lib/file-response.ts')
modules['@/lib/entity-file'] = load('../src/lib/entity-file.ts')
const routes = [
  '../src/app/api/documents/[id]/file/route.ts', '../src/app/api/document-versions/[id]/file/route.ts',
  '../src/app/api/artifacts/[id]/file/route.ts', '../src/app/api/kyc/[id]/file/route.ts',
  '../src/app/api/policies/[id]/file/route.ts', '../src/app/api/litigation-documents/[id]/file/route.ts',
  '../src/app/api/drive-documents/[id]/route.ts', '../src/app/api/document-exports/[id]/download/route.ts',
]
for (const path of routes) {
  const route = load(path)
  const context = { params: Promise.resolve({ id: 'synthetic' }) }
  const result = await route.GET(new Request('https://synthetic.invalid/file'), context)
  assert.equal(result.status, 200, path)
  assert.match(result.headers.get('content-disposition'), /^attachment(?:;|$)/, path)
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff', path)
  assert.match(result.headers.get('content-security-policy'), /^sandbox; default-src 'none'$/, path)
  assert.equal(result.headers.get('cache-control'), 'private, no-store', path)
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), body, `${path} must preserve download bytes`)
  allowed = false
  const before = storageReads
  const denied = await route.GET(new Request('https://synthetic.invalid/file'), context)
  assert.ok([403, 404].includes(denied.status), `${path} denied response`)
  assert.equal(storageReads, before, `${path} denial must occur before storage read`)
  allowed = true
}
mime = 'application/pdf'
const pdf = await load(routes[0]).GET(new Request('https://synthetic.invalid/file'), { params: Promise.resolve({ id: 'synthetic' }) })
assert.equal(pdf.headers.get('content-type'), 'application/pdf')
assert.deepEqual(Buffer.from(await pdf.arrayBuffer()), body, 'PDF fetch still receives original bytes')
console.log('PASS eight protected byte routes: attachment, sandbox CSP, nosniff, no-store, unchanged bytes, access denial before storage; PDF fetch preserved. No live network or database.')
