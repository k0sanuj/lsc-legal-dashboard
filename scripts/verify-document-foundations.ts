/** Offline boundary checks for exact money, sourced FX, naming, and the actual tar archive format. */
import assert from "node:assert/strict"
import { mkdtemp, open, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { Prisma } from "../src/generated/prisma/client"
import { agreementMoney, decimalAmount, formatMoney, usdTotal } from "../src/lib/money"
import { parseEcbRates } from "../src/lib/fx-rates"
import { publishedFilename } from "../src/lib/file-names"
import { appendTarFile, appendTarText, tarHeader, finishTar } from "../src/lib/tar-archive"
import { boundedArtifactBytes } from "../src/lib/document-artifacts"
import { isReconstructedTemplate } from "../src/lib/artifact-provenance"
import { prisma } from "../src/lib/prisma"
import { getS3Key } from "../src/lib/s3"

async function main() {
  const clock = Date.now
  try {
    Date.now = () => 1789992000000
    assert.equal(new Set(Array.from({ length: 1000 }, () => getS3Key("FSP", "NDA", "same.pdf"))).size, 1000)
  } finally { Date.now = clock }
  assert.equal(formatMoney("9007199254740993.27", "USD"), "USD 9,007,199,254,740,993.27")
  assert.equal(formatMoney("0", "USD"), "USD 0.00")
  assert.equal(formatMoney(null, "USD"), "Unknown")
  assert.throws(() => decimalAmount("1e3"))
  const rates = new Map([["EUR", { rate: new Prisma.Decimal("1.23456789"), date: new Date("2026-09-21"), source: "https://example.test/synthetic" }]])
  assert.equal(agreementMoney("100.01", "EUR", rates), "EUR 100.01 (USD 123.47)")
  assert.equal(agreementMoney("25", "AED", rates), "AED 25.00 (USD unavailable)")
  const sum = usdTotal([...Array.from({ length: 101 }, () => ({ value: "0.1", currency: "USD" })), { value: null, currency: "USD" }, { value: "1", currency: "AED" }], rates)
  assert.equal(sum.total.toString(), "10.1")
  assert.equal(sum.missing, 2)
  const large = "99999999999999999999.99"
  assert.equal(usdTotal([{ value: large, currency: "USD" }], rates).total.toFixed(2), large)
  assert.equal(usdTotal([{ value: large, currency: "USD" }, { value: "0.01", currency: "USD" }], rates).total.toFixed(2), "100000000000000000000.00")
  assert.equal(usdTotal([{ value: large, currency: "USD" }, { value: "-99999999999999999999.98", currency: "USD" }], rates).total.toFixed(2), "0.01")
  const xml = `<Cube><Cube time='2026-09-21'><Cube currency='USD' rate='1.2'/><Cube currency='GBP' rate='0.8'/></Cube></Cube>`
  assert.equal(parseEcbRates(xml, new Date("2026-09-21T12:00:00Z")).find((row) => row.currency === "GBP")?.usd_rate.toString(), "1.5")
  assert.throws(() => parseEcbRates(xml, new Date("2026-09-30")), /stale/)
  assert.throws(() => parseEcbRates(xml.replace("currency='USD'", "currency='AUD'"), new Date("2026-09-21T12:00:00Z")), /USD quote/)
  const facts = { arena: "FSP", category: "NDA", counterparty: "Synthetic Counterparty Full Legal Name Limited", date: "2026-09-21", initials: "QA", extension: "docx" }
  assert.equal(publishedFilename(facts, ["NDA"]), "FSP_NDA_Synthetic Counterparty Full Legal Name Limited_21SEP2026_QA.docx")
  assert.throws(() => publishedFilename(facts, []), /lexicon/)
  assert.throws(() => publishedFilename({ ...facts, counterparty: "../path" }, ["NDA"]), /path/)
  assert.throws(() => publishedFilename({ ...facts, date: "2026-02-30" }, ["NDA"]), /date/)
  assert.throws(() => publishedFilename({ ...facts, initials: "" }, ["NDA"]), /initials/)
  assert.throws(() => tarHeader("../escape", 1, new Date()), /Unsafe/)
  assert.equal(isReconstructedTemplate({ provenance: { kind: "legacy_template_text_reconstruction" } }), true)
  assert.equal(isReconstructedTemplate(null), false)
  await assert.rejects(boundedArtifactBytes(new Response("12345"), 4), /per-file worker limit/)
  await assert.rejects(boundedArtifactBytes(new Response("123", { headers: { "content-length": "999" } }), 4), /per-file worker limit/)
  assert.equal((await boundedArtifactBytes(new Response("1234"), 4)).toString(), "1234")
  const directory = await mkdtemp(join(tmpdir(), "legal-tar-test-"))
  try {
    const path = join(directory, "archive.tar")
    const file = join(directory, "file")
    await writeFile(file, "synthetic exact bytes\n")
    const archive = await open(path, "w")
    await appendTarFile(archive, "populated/id.bin", file, 22, new Date("2026-09-21"))
    await appendTarText(archive, "manifest.json", '{"synthetic":true}', new Date("2026-09-21"))
    await finishTar(archive); await archive.close()
    assert.equal(execFileSync("tar", ["-xOf", path, "populated/id.bin"], { encoding: "utf8" }), "synthetic exact bytes\n")
    assert.equal(execFileSync("tar", ["-xOf", path, "manifest.json"], { encoding: "utf8" }), '{"synthetic":true}')
  } finally { await rm(directory, { recursive: true, force: true }) }
  console.log("PASS exact money, null/zero, 101-row totals, sourced FX parsing, stale/missing rates, full names, invalid paths/dates, and tar extraction")
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
