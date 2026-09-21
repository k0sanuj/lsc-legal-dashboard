/** Executes actual completion code with a cadence edit interleaved before its write. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as crypto from 'node:crypto'
import ts from 'typescript'

function fixture(finalStatus) {
  let reads = 0
  const prisma = { reviewTask: {
    findUnique: async () => ++reads === 1 ? { id: 'synthetic-task', status: 'OPEN' } : finalStatus ? { status: finalStatus } : null,
    updateMany: async () => ({ count: 0 }),
  } }
  const imports = {
    'node:crypto': crypto,
    '@/lib/prisma': { prisma },
    '@/lib/document-access': {},
    '@/lib/entity-service': { requireEntityWriter: async () => ({ userId: 'synthetic-actor' }) },
    '@/generated/prisma/client': { Prisma: {} },
    '@/lib/review-rules': {},
  }
  const compiled = ts.transpileModule(readFileSync('src/lib/review-service.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  runInNewContext(compiled, { exports, require: name => { assert.ok(Object.hasOwn(imports, name), name); return imports[name] } })
  return exports
}

await assert.rejects(fixture(null).completeReviewTask({}, 'synthetic-task', 'Evidence that must not be discarded as success'), /changed or was replaced/)
await assert.rejects(fixture('OPEN').completeReviewTask({}, 'synthetic-task', 'Evidence pending a successful write'), /changed or was replaced/)
const completed = await fixture('COMPLETED').completeReviewTask({}, 'synthetic-task', 'Concurrent evidence must remain untouched')
assert.equal(completed.success, true)
assert.equal(completed.alreadyCompleted, true)
console.log('PASS completion after cadence deletion cannot report saved evidence; only a surviving completed row is an idempotent success. Actual source, no database or network.')
