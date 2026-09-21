/** Runs the real worker wrapper against a local fake CLI and local app protocol. No ChatGPT account is used. */
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

const sandbox = await mkdtemp(join(tmpdir(), 'legal-worker-proof-'))
const executable = join(sandbox, 'fake-codex')
const fake = `#!/usr/bin/env node
const { randomUUID } = require('node:crypto');
if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY || process.env.CODEX_ACCESS_TOKEN || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY || process.env.LEGAL_GENERATION_WORKER_TOKEN) { process.exit(90); }
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('synthetic-cli'); process.exit(0); }
if (args.join(' ') === 'login status') { console.error('Logged in using ChatGPT'); process.exit(0); }
for (const required of ['--ignore-user-config','--ignore-rules','--ephemeral','--sandbox','--output-schema']) if (!args.includes(required)) process.exit(91);
for (const feature of ['shell_tool','unified_exec','apps','plugins','multi_agent','image_generation','view_image']) if (!args.includes(feature) || args[args.indexOf(feature)-1] !== '--disable') process.exit(92);
require('node:fs').appendFileSync(require('node:path').join(process.env.HOME,'inferences.log'), 'inference\\n');
let stdin=''; process.stdin.on('data', data=>stdin+=data); process.stdin.on('end',()=>{
  const input=JSON.parse(stdin); const schema=JSON.parse(require('node:fs').readFileSync(args[args.indexOf('--output-schema')+1], 'utf8'));
  if (input.matter?.causeFailure) { process.exit(93); }
  if (input.matter?.causeCancellation) {
    require('node:fs').writeFileSync(require('node:path').join(process.env.HOME,'cancelled.pid'), String(process.pid));
    process.on('SIGTERM', ()=>{});
    setInterval(()=>{},1000);
    return;
  }
  const structured_output = schema.properties.ready ? {ready:true,skillVersion:input.skillVersion} : schema.properties.draft ? {draft:'Each party protects confidential information.'} : {draftHash:input.draftHash,pass:true,findings:[]};
  require('node:fs').writeFileSync(args[args.indexOf('--output-last-message')+1], JSON.stringify(structured_output));
  console.log(JSON.stringify({type:'thread.started',thread_id:randomUUID()})); console.log(JSON.stringify({type:'turn.completed'}));
});
`
await writeFile(executable, fake, { mode: 0o700 })
let fail = false
let noJob = false
let cancel = false
let actions = []
let completion = null
const server = createServer(async (request, response) => {
  assert.equal(request.headers.authorization, 'Bearer synthetic-app-token')
  assert.equal(request.headers['x-legal-worker-id'], 'synthetic-worker')
  let body = ''; for await (const chunk of request) body += chunk
  const value = JSON.parse(body)
  actions.push(value.action)
  response.setHeader('content-type', 'application/json')
  if (value.action === 'heartbeat') {
    completion = { skillHash: value.skillHash }
    response.end(JSON.stringify({ ready: true }))
  } else if (value.action === 'claim') {
    response.end(JSON.stringify({ job: noJob ? null : { id: 'synthetic-job', kind: 'DRAFT', input: { causeFailure: fail, causeCancellation: cancel }, leaseToken: 'synthetic-lease', skillHash: completion.skillHash } }))
  } else if (value.action === 'progress') response.end(JSON.stringify({ active: !cancel }))
  else if (value.action === 'complete') { completion = value.result; response.end(JSON.stringify({ accepted: true })) }
  else if (value.action === 'fail') response.end(JSON.stringify({ accepted: true }))
  else { response.statusCode = 400; response.end('{}') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
const origin = `http://127.0.0.1:${address.port}`
async function run(model = 'synthetic-model') {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [resolvePath('node_modules/tsx/dist/cli.mjs'), resolvePath('ops/generation-worker/run.ts')], {
      cwd: resolvePath('.'), env: { PATH: process.env.PATH, HOME: sandbox, TMPDIR: sandbox, NODE_ENV: 'test', LEGAL_APP_ORIGIN: origin, LEGAL_GENERATION_WORKER_ID: 'synthetic-worker', LEGAL_GENERATION_WORKER_TOKEN: 'synthetic-app-token', LEGAL_GENERATION_OWNER_EMAIL: 'synthetic@example.invalid', LEGAL_GENERATION_MODEL: model, CODEX_BIN: executable, OPENAI_API_KEY: 'must-be-stripped', CODEX_API_KEY: 'must-be-stripped', CODEX_ACCESS_TOKEN: 'must-be-stripped', ANTHROPIC_API_KEY: 'must-be-stripped', GOOGLE_API_KEY: 'must-be-stripped' }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data)
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Synthetic worker timed out')) }, 30000)
    child.on('error', reject)
    child.on('close', code => { clearTimeout(timeout); resolve({ code, output }) })
  })
}
function resolvePath(value) { return resolve(new URL('..', import.meta.url).pathname, value) }
try {
  const success = await run()
  assert.equal(success.code, 0, success.output)
  assert.deepEqual(actions.filter(action => action !== 'progress'), ['heartbeat', 'claim', 'complete'])
  assert.equal(completion.draftHash, createHash('sha256').update(completion.draft).digest('hex'))
  assert.equal(new Set(completion.sessionIds).size, 3)
  assert.equal(completion.substantive.pass, true)
  assert.equal(completion.references.pass, true)
  fail = true; actions = []; completion = null
  const failure = await run()
  assert.equal(failure.code, 1, failure.output)
  assert.deepEqual(actions.filter(action => action !== 'progress'), ['heartbeat', 'claim', 'fail'])
  assert.match(failure.output, /no API fallback/)
  const inferenceCount = async () => (await readFile(join(sandbox, 'inferences.log'), 'utf8')).split('inference').length - 1
  assert.equal(await inferenceCount(), 5, 'The second invocation must reuse its readiness proof')
  noJob = true; actions = []
  const idle = await run()
  assert.equal(idle.code, 0, idle.output)
  assert.equal(await inferenceCount(), 5, 'Idle polls must not consume inference quota')
  const changedModel = await run('different-model')
  assert.equal(changedModel.code, 0, changedModel.output)
  assert.equal(await inferenceCount(), 6, 'Model changes must invalidate cached readiness')
  noJob = false; fail = false; cancel = true; actions = []
  const cancelled = await run('different-model')
  assert.equal(cancelled.code, 1, cancelled.output)
  assert.deepEqual(actions.filter(action => action !== 'progress'), ['heartbeat', 'claim', 'fail'])
  const cancelledPid = Number(await readFile(join(sandbox, 'cancelled.pid'), 'utf8'))
  assert.throws(() => process.kill(cancelledPid, 0), { code: 'ESRCH' }, 'A cancelled CLI ignoring SIGTERM must be dead before the worker exits')
  console.log('Real worker wrapper passed synthetic execution: sanitized credentials, empty tools/MCP isolation, three independent inference sessions, hash-bound completion, explicit failure with no fallback, and SIGKILL escalation for a cancelled child ignoring SIGTERM. This is not live Codex acceptance.')
} finally {
  await new Promise(resolve => server.close(resolve))
  await rm(sandbox, { recursive: true, force: true })
}
