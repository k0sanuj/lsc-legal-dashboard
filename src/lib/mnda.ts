/**
 * MNDA send pipeline: template to signed-PDF-in-flight in one call.
 *
 * Owns: variable substitution for the two FSP MNDA templates, PDF generation
 * via the contract layout engine, S3 upload, the LegalDocument plus
 * SignatureRequest rows, the OpenSign send with exact field anchors, and the
 * legal tracker notification. Callers are the dashboard server action
 * (src/actions/mnda.ts) and the Slack route; BOTH authorise before calling,
 * this module never touches the session.
 *
 * Env:
 *   MNDA_FSP_SIGNER_NAME    FSP-side signatory. REQUIRED, no default
 *                           (the signatory on the source agreements)
 *   MNDA_FSP_SIGNER_EMAIL   REQUIRED, no default; a stale personal inbox
 *                           receiving countersignature requests is exactly the
 *                           failure a missing-env error prevents
 */
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { getS3Key, uploadBufferToS3 } from "@/lib/s3"
import { createOpenSignDocument, type OpenSignFieldPlacement } from "@/lib/opensign"
import {
  renderContractPdf,
  type FieldAnchor,
  type SignatureBlockSpec,
} from "@/lib/pdf/contract-pdf"
import {
  MNDA_TEMPLATE_NAMES,
  mndaBusinessTemplate,
  mndaIndividualTemplate,
} from "@/lib/mnda-templates"
import { emitLegalTrackerEvent } from "@/lib/legal-tracker"
import { buildAgreementSentMessage } from "@/lib/legal-tracker-payloads"
import { getAppBaseUrl } from "@/lib/app-url"

export interface MndaSendParams {
  templateKind: "individual" | "business"
  counterpartyName: string
  counterpartyEmail: string
  counterpartyCompany?: string
  counterpartyAddress?: string
  passportNumber?: string
  ccEmails: string[]
  termYears: 1 | 2 | 3 | 5
  effectiveDate: string
}

export interface MndaSendActor {
  userId: string
  email: string
  display: string
  /** Where the send came from, for the lifecycle note. Default "dashboard". */
  source?: string
}

/**
 * `safe` marks error text that may be shown outside the dashboard (Slack
 * channels included). Curated validation and configuration messages are safe;
 * anything thrown by infrastructure is not, because raw driver errors leak
 * hostnames, bucket names and internal addresses.
 */
export type MndaSendResult =
  | { success: true; documentId: string; counterpartySigningUrl: string | null }
  | { success: false; error: string; safe: boolean }

const TERM_WORDS: Record<1 | 2 | 3 | 5, string> = {
  1: "one",
  2: "two",
  3: "three",
  5: "five",
}

const ALLOWED_TERMS = [1, 2, 3, 5]

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** Width in points of the inline passport blank when it is left for signing. */
const PASSPORT_FIELD_WIDTH = 120

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fspSignerName(): string | null {
  return process.env.MNDA_FSP_SIGNER_NAME?.trim() || null
}

function fspSignerEmail(): string | null {
  return process.env.MNDA_FSP_SIGNER_EMAIL?.trim().toLowerCase() || null
}

/** "2026-08-05" to "5th August 2026". Returns null when unparseable. */
function formatEffectiveDate(iso: string): string | null {
  const parts = parseIsoDate(iso)
  if (!parts) return null
  const { year, month, day } = parts
  const remainder = day % 100
  const suffix =
    remainder >= 11 && remainder <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th"
  return `${day}${suffix} ${MONTH_NAMES[month - 1]} ${year}`
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return valid ? { year, month, day } : null
}

/**
 * The renderer treats [[FIELD:name:width]] as an anchor token. Values are user
 * input, so the token opener is broken up before substitution; otherwise a
 * counterparty name could inject a blank or displace a signature anchor on a
 * binding document.
 */
function escapeFieldTokens(value: string): string {
  return value.replaceAll("[[", "[ [")
}

function substituteVariables(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = values[key.toLowerCase()]
    return value != null ? escapeFieldTokens(value) : match
  })
}

/** Everything before <<SIGNATURE_BLOCK>>, split into heading line and body. */
function splitTemplate(content: string): { title: string; body: string } {
  const marker = "<<SIGNATURE_BLOCK>>"
  const markerIndex = content.indexOf(marker)
  const withoutBlock = markerIndex >= 0 ? content.slice(0, markerIndex) : content
  const lines = withoutBlock.split(/\r?\n/)
  const title = (lines[0] ?? "").trim() || "MUTUAL NON-DISCLOSURE AND NON-CIRCUMVENT AGREEMENT"
  const body = lines.slice(1).join("\n").trim()
  return { title, body }
}

/** Precise validation errors, one at a time, before anything is written. */
function validateParams(params: MndaSendParams, signerEmail: string): string | null {
  if (params.templateKind !== "individual" && params.templateKind !== "business") {
    return "Template kind must be individual or business."
  }
  if (!params.counterpartyName.trim()) {
    return "Counterparty name is required."
  }
  if (!EMAIL_PATTERN.test(params.counterpartyEmail.trim())) {
    return "Counterparty email is not a valid email address."
  }
  if (params.templateKind === "business" && !params.counterpartyCompany?.trim()) {
    return "Counterparty company is required for the business MNDA."
  }
  if (params.templateKind === "business" && !params.counterpartyAddress?.trim()) {
    return "Counterparty address is required for the business MNDA."
  }
  if (!ALLOWED_TERMS.includes(params.termYears)) {
    return "Term must be 1, 2, 3, or 5 years."
  }
  if (!parseIsoDate(params.effectiveDate)) {
    return "Effective date must be a valid YYYY-MM-DD date."
  }
  const invalidCc = params.ccEmails.find((cc) => !EMAIL_PATTERN.test(cc.trim()))
  if (invalidCc !== undefined) {
    return `CC address "${invalidCc}" is not a valid email address.`
  }
  if (params.counterpartyEmail.trim().toLowerCase() === signerEmail) {
    return "Counterparty email matches the FSP signer email; the two signers must differ."
  }
  return null
}

/** Loads the active ContractTemplate row, falling back to the constant. */
async function loadTemplateContent(
  kind: "individual" | "business"
): Promise<{ content: string; templateId: string | null }> {
  const fallback = kind === "individual" ? mndaIndividualTemplate : mndaBusinessTemplate
  const row = await prisma.contractTemplate.findFirst({
    where: { name: MNDA_TEMPLATE_NAMES[kind], is_active: true },
    orderBy: { version: "desc" },
    select: { id: true, content: true },
  })
  return { content: row?.content ?? fallback, templateId: row?.id ?? null }
}

function buildSignatureBlock(
  params: MndaSendParams,
  counterpartyEmail: string,
  signerName: string,
  signerEmail: string
): SignatureBlockSpec {
  return {
    left: {
      heading: "Future Of Sports Labs Inc.",
      lines: [
        "1401 Pennsylvania Ave, Ste. 105,",
        "Wilmington, Delaware, 19806, USA",
        `Email: ${signerEmail}`,
      ],
      signature: { name: "fsp_signature", label: "Signature:", widthPt: 160, heightPt: 50 },
      byLine: `By: ${signerName}`,
      designationLine: "Designation: Director",
      date: { name: "fsp_date", label: "Date:", widthPt: 100, heightPt: 18 },
    },
    right: {
      heading:
        params.templateKind === "business"
          ? params.counterpartyCompany!.trim()
          : params.counterpartyName.trim(),
      lines:
        params.templateKind === "business"
          ? [`Address: ${params.counterpartyAddress!.trim()}`, `Email: ${counterpartyEmail}`]
          : [`Email: ${counterpartyEmail}`],
      signature: { name: "cp_signature", label: "Signature:", widthPt: 160, heightPt: 50 },
      byLine: `By: ${params.counterpartyName.trim()}`,
      date: { name: "cp_date", label: "Date:", widthPt: 100, heightPt: 18 },
    },
  }
}

function placement(
  anchor: FieldAnchor,
  type: OpenSignFieldPlacement["type"]
): OpenSignFieldPlacement {
  return {
    page: anchor.page,
    xPct: anchor.xPct,
    yPct: anchor.yPct,
    wPct: anchor.wPct,
    hPct: anchor.hPct,
    type,
    required: true,
  }
}

/**
 * Generates the MNDA PDF, files it as a LegalDocument, and sends it through
 * OpenSign with the counterparty signing first and the FSP signatory second.
 * On an OpenSign failure the DRAFT document and its PENDING signers survive,
 * so the send can be retried from the document page.
 */
export async function sendMnda(params: MndaSendParams, actor: MndaSendActor): Promise<MndaSendResult> {
  const signerName = fspSignerName()
  const signerEmail = fspSignerEmail()
  if (!signerName || !signerEmail) {
    return {
      success: false,
      safe: true,
      error:
        "MNDA_FSP_SIGNER_NAME and MNDA_FSP_SIGNER_EMAIL must be configured; the FSP countersigner cannot default.",
    }
  }
  const validationError = validateParams(params, signerEmail)
  if (validationError) return { success: false, safe: true, error: validationError }

  const counterpartyEmail = params.counterpartyEmail.trim().toLowerCase()
  const counterpartyName = params.counterpartyName.trim()
  const display =
    params.templateKind === "business" ? params.counterpartyCompany!.trim() : counterpartyName
  const source = actor.source?.trim() || "dashboard"
  const effectiveDatePretty = formatEffectiveDate(params.effectiveDate)!
  const passport = params.passportNumber?.trim() ?? ""

  try {
    const { content, templateId } = await loadTemplateContent(params.templateKind)

    const substituted = substituteVariables(content, {
      effective_date: effectiveDatePretty,
      counterparty_name: counterpartyName,
      counterparty_company: params.counterpartyCompany?.trim() ?? "",
      counterparty_address: params.counterpartyAddress?.trim() ?? "",
      // Left blank, the passport number becomes a required fill-in field the
      // counterparty completes during signing.
      counterparty_passport_number: passport || `[[FIELD:cp_passport:${PASSPORT_FIELD_WIDTH}]]`,
      term_years: String(params.termYears),
      term_words: TERM_WORDS[params.termYears],
    })

    const { title: contractTitle, body } = splitTemplate(substituted)
    const rendered = await renderContractPdf({
      title: contractTitle,
      bodyText: body,
      signatureBlock: buildSignatureBlock(params, counterpartyEmail, signerName, signerEmail),
    })

    const requiredAnchors = ["cp_signature", "cp_date", "fsp_signature", "fsp_date"]
    const missingAnchor = requiredAnchors.find((name) => !rendered.anchors[name])
    if (missingAnchor) {
      console.error(`MNDA render did not produce the ${missingAnchor} anchor.`)
      return { success: false, safe: true, error: "MNDA PDF generation failed to place the signature fields." }
    }

    const documentTitle = `MNDA - ${display} - ${params.effectiveDate}`
    const { year, month, day } = parseIsoDate(params.effectiveDate)!
    const startDate = new Date(Date.UTC(year, month - 1, day))
    // Date.UTC overflows Feb 29 into Mar 1 in non-leap years; clamp back to
    // the last day of the intended month so the anniversary is conventional.
    let endDate = new Date(Date.UTC(year + params.termYears, month - 1, day))
    if (endDate.getUTCMonth() !== month - 1) {
      endDate = new Date(Date.UTC(year + params.termYears, month, 0))
    }

    const s3Key = getS3Key("FSP", "generated", `${documentTitle}.pdf`)
    const fileUrl = await uploadBufferToS3(rendered.bytes, s3Key, "application/pdf")

    const document = await prisma.legalDocument.create({
      data: {
        title: documentTitle,
        category: "NDA",
        entity: "FSP",
        lifecycle_status: "DRAFT",
        owner_id: actor.userId,
        counterparty: display,
        contract_start_date: startDate,
        contract_end_date: endDate,
        expiry_date: endDate,
        file_url: fileUrl,
        notes: `MNDA (${params.templateKind}) generated from template and sent by ${actor.display} (${actor.email}) via ${source}. Term: ${TERM_WORDS[params.termYears]} (${params.termYears}) years from ${effectiveDatePretty}.`,
        signature_requests: {
          create: [
            { signatory_name: counterpartyName, signatory_email: counterpartyEmail },
            { signatory_name: signerName, signatory_email: signerEmail },
          ],
        },
      },
      include: { signature_requests: true },
    })

    const counterpartyFields: OpenSignFieldPlacement[] = [
      placement(rendered.anchors.cp_signature, "signature"),
      placement(rendered.anchors.cp_date, "date"),
    ]
    if (rendered.anchors.cp_passport) {
      counterpartyFields.push(placement(rendered.anchors.cp_passport, "text input"))
    }

    const result = await createOpenSignDocument({
      title: documentTitle,
      note: `Signature required: ${documentTitle}`,
      description: `Generated in LSC Legal by ${actor.email}`,
      fileBytes: rendered.bytes,
      fileName: `${documentTitle}.pdf`,
      pages: rendered.pages,
      // Placeholder order is the signing order: counterparty first.
      signers: [
        { name: counterpartyName, email: counterpartyEmail, fields: counterpartyFields },
        {
          name: signerName,
          email: signerEmail,
          fields: [
            placement(rendered.anchors.fsp_signature, "signature"),
            placement(rendered.anchors.fsp_date, "date"),
          ],
        },
      ],
      ccEmails: params.ccEmails.map((cc) => cc.trim().toLowerCase()),
    })

    const now = new Date()
    await prisma.$transaction([
      prisma.legalDocument.update({
        where: { id: document.id },
        data: {
          lifecycle_status: "AWAITING_SIGNATURE",
          signature_provider: "opensign",
          signature_provider_request_id: result.providerDocumentId,
          signature_status: "SENT",
          signature_sent_at: now,
        },
      }),
      prisma.lifecycleEvent.create({
        data: {
          document_id: document.id,
          from_status: "DRAFT",
          to_status: "AWAITING_SIGNATURE",
          transitioned_by: actor.userId,
          notes: `MNDA generated and sent for signature via ${source}`,
        },
      }),
      ...document.signature_requests.map((signer) =>
        prisma.signatureRequest.update({
          where: { id: signer.id },
          data: {
            status: "SENT",
            sent_at: now,
            signing_url: result.signingLinks[signer.signatory_email.toLowerCase()] ?? null,
          },
        })
      ),
      ...(templateId
        ? [
            prisma.contractTemplate.update({
              where: { id: templateId },
              data: { usage_count: { increment: 1 } },
            }),
          ]
        : []),
    ])

    // Legal tracker channel notice, scheduled with after() so a channel outage
    // can never fail or slow down the send.
    const trackerMessage = buildAgreementSentMessage({
      documentId: document.id,
      title: documentTitle,
      entity: "FSP",
      category: "NDA",
      counterparty: display,
      value: null,
      currency: null,
      signerNames: [counterpartyName, signerName],
      sentByEmail: actor.email,
      appBaseUrl: getAppBaseUrl(),
    })
    // after() throws synchronously outside a Next request scope (scripts,
    // tests). By this point the document exists and invitations are out, so a
    // scheduling failure must never convert a completed send into a reported
    // failure; it only costs the channel notice.
    try {
      after(async () => {
      try {
        // The notifier reports delivery failure by return value, not by
        // throwing, so an unchecked result would be a silent miss.
        const notified = await emitLegalTrackerEvent("agreement.sent", trackerMessage, {
          entityType: "LegalDocument",
          entityId: document.id,
        })
        if (!notified.ok) {
          console.error(
            `Legal tracker notification not delivered for MNDA ${document.id} (non-blocking):`,
            notified.error
          )
        }
      } catch (err) {
        console.error("Legal tracker notification failed (non-blocking):", err)
      }
      })
    } catch (err) {
      console.error("Could not schedule the tracker notification (non-blocking):", err)
    }

    return {
      success: true,
      documentId: document.id,
      counterpartySigningUrl: result.signingLinks[counterpartyEmail] ?? null,
    }
  } catch (error) {
    console.error("MNDA send error:", error)
    // Raw infrastructure errors stay in the server log; callers outside the
    // dashboard get a generic line they can act on without reading internals.
    return {
      success: false,
      safe: false,
      error: "MNDA generation failed. The details are in the server logs and nothing was sent.",
    }
  }
}
