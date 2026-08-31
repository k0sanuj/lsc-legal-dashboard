/**
 * MNDA render gate: proves the generated PDF places every signing anchor and
 * that user-controlled values can never mint or displace a [[FIELD:...]]
 * anchor. Both failure modes shipped to a real signer on 2026-08-30 (a literal
 * escaped token in the agreement text, and an escaping guard that odd bracket
 * runs bypassed), so this runs in the release gate. No database or network.
 */
import { renderMndaPdf } from "../src/lib/mnda"
import { mndaIndividualTemplate, mndaBusinessTemplate } from "../src/lib/mnda-templates"

const base = {
  templateKind: "individual" as const,
  counterpartyName: "Jane Counterparty",
  counterpartyEmail: "jane@example.com",
  ccEmails: [],
  termYears: 2 as const,
  effectiveDate: "2026-08-31",
}
const ctx = {
  counterpartyEmail: "jane@example.com",
  counterpartyName: "Jane Counterparty",
  effectiveDatePretty: "31 August 2026",
  signerName: "FSP Signatory",
  signerEmail: "legal@futureofsports.io",
}
const SIGNING_ANCHORS = ["cp_signature", "cp_date", "fsp_signature", "fsp_date"]

async function extractText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise
  let out = ""
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    out += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n"
  }
  return out
}

async function main() {
  const failures: string[] = []
  const check = (name: string, ok: boolean) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`)
    if (!ok) failures.push(name)
  }

  // Blank passport: the pipeline's own token must survive escaping and become
  // a real fill-in anchor, never literal text.
  const blank = await renderMndaPdf(mndaIndividualTemplate, base, { ...ctx, passport: "" })
  const blankText = await extractText(blank.bytes)
  check("blank passport: cp_passport anchor exists", Boolean(blank.anchors.cp_passport))
  check("blank passport: no token text in PDF", !blankText.includes("FIELD:") && !blankText.includes("[ ["))
  check("blank passport: all signing anchors", SIGNING_ANCHORS.every((a) => Boolean(blank.anchors[a])))

  // Hostile values: tokens in the body and the signature block must stay inert
  // text, and a supplied passport must not create a fill-in field.
  const evil = "Evil [[FIELD:x:99]] Co"
  const hostile = await renderMndaPdf(
    mndaIndividualTemplate,
    { ...base, counterpartyName: evil },
    { ...ctx, counterpartyName: evil, passport: "P1234567" }
  )
  const hostileText = await extractText(hostile.bytes)
  check("hostile: no forged anchor", !("x" in hostile.anchors))
  check("hostile: no cp_passport anchor when passport supplied", !("cp_passport" in hostile.anchors))
  check("hostile: passport value rendered as text", hostileText.includes("P1234567"))
  check("hostile: token inert in By: line", hostileText.includes("[ [FIELD:x:99]]"))

  // Odd bracket run: a plain replaceAll("[[", "[ [") leaves a live "[["
  // seam here, and the surviving token overwrites the real fsp_signature
  // anchor via the by-line (recordAnchor is last-writer-wins).
  const run = "[[[FIELD:fsp_signature:160]]"
  const bracketRun = await renderMndaPdf(
    mndaIndividualTemplate,
    { ...base, counterpartyName: run },
    { ...ctx, counterpartyName: run, passport: "P1234567" }
  )
  const a = bracketRun.anchors.fsp_signature
  const b = hostile.anchors.fsp_signature
  check(
    "bracket run: fsp_signature anchor not displaced",
    Boolean(a) && Math.abs(a.xPct - b.xPct) < 1e-9 && Math.abs(a.hPct - b.hPct) < 1e-9
  )

  // Business template renders with its own variables and anchors.
  const biz = await renderMndaPdf(
    mndaBusinessTemplate,
    {
      ...base,
      templateKind: "business" as const,
      counterpartyCompany: "Acme Trading FZ-LLC",
      counterpartyAddress: "1 Sheikh Zayed Rd, Dubai, UAE",
    },
    { ...ctx, passport: "" }
  )
  const bizText = await extractText(biz.bytes)
  check("business: all signing anchors", SIGNING_ANCHORS.every((n) => Boolean(biz.anchors[n])))
  check("business: no token text in PDF", !bizText.includes("FIELD:"))
  check("business: company rendered", bizText.includes("Acme Trading FZ-LLC"))

  if (failures.length > 0) {
    console.error(`\n${failures.length} MNDA render check(s) failed`)
    process.exit(1)
  }
  console.log("\nMNDA render checks passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
