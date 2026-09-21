/** Executes the actual sender against a synthetic receipt receiver and in-memory outbox. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { webcrypto, createHmac } from 'node:crypto'
import ts from 'typescript'

const env = { FINANCE_WEBHOOK_URL: 'https://synthetic.invalid/finance', FINANCE_WEBHOOK_KEY: 'synthetic', FINANCE_WEBHOOK_SECRET: 'synthetic-secret' }
const rows = new Map()
let requests = 0, mode = 'accept'
const prisma = { crossModuleEvent: {
  async create({ data }) { const row = { ...data, id: `event-${rows.size + 1}`, created_at: new Date('2026-09-21T00:00:00.000Z') }; rows.set(row.id, row); return row },
  async findUniqueOrThrow({ where }) { assert.ok(rows.has(where.id)); return rows.get(where.id) },
  async update({ where, data }) { Object.assign(rows.get(where.id), data); return rows.get(where.id) },
} }
const source = readFileSync(new URL('../src/lib/finance-webhook.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const moduleRecord = { exports: {} }
runInNewContext(output, { module: moduleRecord, exports: moduleRecord.exports, process: { env }, Buffer, TextEncoder, crypto: webcrypto, AbortSignal, Date, console,
  require(name) { if (name === './prisma') return { prisma }; if (name === '@/generated/prisma/client') return {}; throw new Error(`Unexpected import ${name}`) },
  async fetch(url, options) {
    requests++
    assert.equal(url, env.FINANCE_WEBHOOK_URL)
    const envelope = JSON.parse(options.body)
    const auth = options.headers.Authorization
    const tsValue = /ts=(\d+)/.exec(auth)[1]
    const signature = createHmac('sha256', env.FINANCE_WEBHOOK_SECRET).update(`${tsValue}.${options.body}`).digest('base64')
    assert.ok(auth.endsWith(`sig=${signature}`))
    assert.equal(envelope.payload.estimatedLiability, '9007199254740993.12345678')
    assert.equal(typeof envelope.payload.estimatedLiability, 'string')
    assert.equal('_last_attempt' in envelope.payload, false)
    return { ok: mode !== 'fail', status: mode === 'fail' ? 503 : 200, async text() { return 'synthetic failure' }, async json() { return { accepted: true, eventId: mode === 'wrong-id' ? 'other-event' : envelope.eventId } } }
  },
})
const payload = { schemaVersion: 1, estimatedLiability: '9007199254740993.12345678', currency: 'USD', revision: 1 }
const queued = await moduleRecord.exports.queueFinanceEvent('dispute.exposure.updated', payload, { entityType: 'LitigationCase', entityId: 'synthetic-case' })
let result = await moduleRecord.exports.deliverFinanceEvent(queued.id, 'dispute.exposure.updated')
assert.equal(result.ok, false); assert.equal(requests, 0); assert.equal(rows.get(queued.id).processed, false)
env.FINANCE_DISPUTE_CONTRACT_VERSION = '1'
mode = 'wrong-id'; result = await moduleRecord.exports.deliverFinanceEvent(queued.id, 'dispute.exposure.updated')
assert.equal(result.ok, false); assert.match(result.error, /acknowledge/); assert.equal(rows.get(queued.id).processed, false)
mode = 'fail'; result = await moduleRecord.exports.deliverFinanceEvent(queued.id, 'dispute.exposure.updated')
assert.equal(result.ok, false); assert.equal(rows.get(queued.id).processed, false)
mode = 'accept'; result = await moduleRecord.exports.deliverFinanceEvent(queued.id, 'dispute.exposure.updated')
assert.equal(result.ok, true); assert.equal(rows.get(queued.id).processed, true)
const count = requests
await moduleRecord.exports.deliverFinanceEvent(queued.id, 'dispute.exposure.updated')
assert.equal(requests, count)
console.log('Dispute Finance checks passed: exact HMAC/decimal payload, configured-contract gate, receipt ID validation, failure retention and idempotent accepted-event replay. No live network or database.')
