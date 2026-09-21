/** Independent actual-source/installed-SDK wire proof; localhost and synthetic credentials only. */
import assert from 'node:assert/strict'
import { readFileSync, createReadStream } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import * as crypto from 'node:crypto'

const repo = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(repo, 'package.json'))
const sdk = require('@aws-sdk/client-s3'), ts = require('typescript')
const directory = await mkdtemp(join(tmpdir(), 'legal-gcs-wire-'))
const path = join(directory, 'synthetic.tar.gz')
const bytes = crypto.randomBytes(512 * 1024 + 123)
await writeFile(path, bytes)
let captured, rejectUpload = false
const server = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  captured = { headers: request.headers, bytes: Buffer.concat(chunks) }
  response.setHeader('content-type', 'application/xml')
  if (rejectUpload || request.headers['content-encoding']?.includes('aws-chunked')) {
    response.statusCode = 400
    response.end('<Error><Code>InvalidArgument</Code><Message>Synthetic rejection</Message></Error>')
  } else { response.setHeader('etag', '"synthetic"'); response.end('') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const clients = [], streams = []
class LocalS3Client extends sdk.S3Client {
  constructor(config) {
    super({ ...config, endpoint: `http://127.0.0.1:${server.address().port}`, maxAttempts: 1 })
    clients.push(this)
  }
}
const imports = {
  'node:crypto': crypto,
  'node:fs': { createReadStream: (...args) => { const stream = createReadStream(...args); streams.push(stream); return stream } },
  'node:fs/promises': await import('node:fs/promises'),
  '@aws-sdk/client-s3': { ...sdk, S3Client: LocalS3Client },
  '@aws-sdk/s3-request-presigner': require('@aws-sdk/s3-request-presigner'),
}
const record = { exports: {} }
runInNewContext(ts.transpileModule(readFileSync(join(repo, 'src/lib/s3.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: record, exports: record.exports, Buffer,
  process: { env: { GCS_BUCKET_NAME: 'synthetic', GCS_HMAC_ACCESS_ID: 'synthetic-id', GCS_HMAC_SECRET: 'synthetic-secret' } },
  require: name => { assert.ok(Object.hasOwn(imports, name)); return imports[name] },
})
function verifyRequest() {
  assert.equal(captured.headers['content-encoding'], undefined)
  assert.equal(captured.headers['x-amz-trailer'], undefined)
  assert.equal(captured.headers['content-length'], String(bytes.length))
  assert.equal(captured.headers['content-md5'], crypto.createHash('md5').update(bytes).digest('base64'))
  assert.deepEqual(captured.bytes, bytes)
  assert.ok(streams.every(stream => stream.destroyed))
}
try {
  const result = await record.exports.uploadLocalFileToS3(path, 'synthetic.tar.gz', 'application/gzip')
  assert.equal(result, 'https://storage.googleapis.com/synthetic/synthetic.tar.gz')
  verifyRequest()
  assert.equal(streams.length, 2)
  rejectUpload = true
  await assert.rejects(record.exports.uploadLocalFileToS3(path, 'synthetic.tar.gz', 'application/gzip'), /Synthetic rejection/)
  verifyRequest()
  assert.equal(streams.length, 4)
  console.log(`PASS actual source + installed SDK: ${bytes.length} exact streamed bytes, matching Content-MD5 and Content-Length, no AWS chunked checksum trailers, rejection propagated, and streams closed. Localhost only.`)
} finally {
  clients.forEach(client => client.destroy())
  await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
