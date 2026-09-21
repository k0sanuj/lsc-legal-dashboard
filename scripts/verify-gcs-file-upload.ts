/** Explicitly authorized synthetic GCS probe. Creates and removes only its own UUID-named object. */
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { appendTarText, finishTar } from "../src/lib/tar-archive"
import { deleteFromS3, getPresignedUrl, uploadLocalFileToS3 } from "../src/lib/s3"

async function main() {
  if (!process.argv.includes("--live-synthetic-probe") || process.env.LEGAL_V2_TARGET_PROJECT !== "fsp-legal-esign") throw new Error("Requires explicit live synthetic probe flag and selected GCP runtime")
  const directory = await mkdtemp(join(tmpdir(), "legal-gcs-probe-"))
  const key = `acceptance/v2/${randomUUID()}/synthetic.tar.gz`
  console.log(JSON.stringify({ event: "synthetic_probe_started", key }))
  let uploadAttempted = false
  try {
    const tarPath = join(directory, "synthetic.tar")
    const tar = await open(tarPath, "w")
    await appendTarText(tar, "synthetic.txt", "Legal OS synthetic file upload acceptance, no legal data.\n", new Date())
    await finishTar(tar)
    await tar.close()
    const expected = gzipSync(await readFile(tarPath))
    const path = join(directory, "synthetic.tar.gz")
    await writeFile(path, expected)
    uploadAttempted = true
    await uploadLocalFileToS3(path, key, "application/gzip")
    const response = await fetch(await getPresignedUrl(key))
    assert.equal(response.status, 200)
    const actual = Buffer.from(await response.arrayBuffer())
    assert.equal(createHash("sha256").update(actual).digest("hex"), createHash("sha256").update(expected).digest("hex"))
    console.log(JSON.stringify({ event: "synthetic_file_upload_verified", bytes: actual.length, exactHashMatch: true }))
  } catch (error) {
    if (error instanceof Error) {
      const fields = error as Error & { Code?: string; $metadata?: { httpStatusCode?: number } }
      console.error(JSON.stringify({ event: "synthetic_file_upload_failed", name: fields.name, message: fields.message, code: fields.Code, httpStatus: fields.$metadata?.httpStatusCode, fieldNames: Object.keys(error) }))
    }
    process.exitCode = 1
  } finally {
    try {
      if (uploadAttempted) {
        await deleteFromS3(key).catch((error: unknown) => {
          if (!(error instanceof Error) || !("$metadata" in error) || (error.$metadata as { httpStatusCode?: number }).httpStatusCode !== 404) throw error
        })
        const absent = await fetch(await getPresignedUrl(key))
        assert.equal(absent.status, 404)
        await absent.body?.cancel()
        console.log(JSON.stringify({ event: "synthetic_object_deleted", verifiedAbsent: true }))
      }
    } finally { await rm(directory, { recursive: true, force: true }) }
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Synthetic probe failed"); process.exitCode = 1 })
