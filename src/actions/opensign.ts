"use server"

import { requireGlobalDocumentAccess } from "@/lib/document-access"
import { getAppBaseUrl } from "@/lib/app-url"
import { requireRole } from "@/lib/auth"
import { randomUUID } from "node:crypto"
import { recordArtifact } from "@/lib/document-artifacts"
import { prisma } from "@/lib/prisma"
import { emitLegalTrackerEvent } from "@/lib/legal-tracker"
import { buildAgreementSentMessage } from "@/lib/legal-tracker-payloads"
import {
  createOpenSignDocument,
  type OpenSignFieldPlacement,
  type OpenSignPageDims,
} from "@/lib/opensign"
import { getPresignedUrl, getS3KeyFromUrl } from "@/lib/s3"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { PDFDocument } from "pdf-lib"

function getOpenSignErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("OPENSIGN_BASE_URL")) {
      return "OpenSign is not configured. Add OPENSIGN_BASE_URL to the environment."
    }
    if (error.message.includes("OPENSIGN_MASTER_KEY")) {
      return "OpenSign master key is not configured. Add OPENSIGN_MASTER_KEY to the environment."
    }
    if (error.message.includes("has no account for")) {
      return error.message
    }
    return error.message
  }
  return "Failed to create OpenSign signature request."
}

async function getOpenSignFileUrl(fileUrl: string): Promise<string> {
  const s3Key = getS3KeyFromUrl(fileUrl)
  if (!s3Key) return fileUrl
  return getPresignedUrl(s3Key)
}

async function fetchFileBytes(fileUrl: string): Promise<Buffer> {
  const downloadUrl = await getOpenSignFileUrl(fileUrl)
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) {
    throw new Error(`Could not read document file for OpenSign: HTTP ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

const FIELD_TYPES = new Set<OpenSignFieldPlacement["type"]>([
  "signature",
  "initials",
  "date",
  "text input",
  "name",
  "email",
])

/** One entry of the normalized widgetsJson map, validated at runtime. */
function toFieldPlacement(value: unknown): OpenSignFieldPlacement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Each field must be an object.")
  }
  const record = value as Record<string, unknown>
  const type = record.type as OpenSignFieldPlacement["type"]
  if (typeof type !== "string" || !FIELD_TYPES.has(type)) {
    throw new Error(`Unknown field type: ${String(record.type)}.`)
  }
  for (const key of ["page", "xPct", "yPct", "wPct", "hPct"] as const) {
    if (typeof record[key] !== "number" || !Number.isFinite(record[key])) {
      throw new Error(`Field ${type} is missing a numeric ${key}.`)
    }
  }
  return {
    page: record.page as number,
    xPct: record.xPct as number,
    yPct: record.yPct as number,
    wPct: record.wPct as number,
    hPct: record.hPct as number,
    type,
    required: record.required !== false,
    prefill: typeof record.prefill === "string" ? record.prefill : undefined,
  }
}

/** Parses widgetsJson in the normalized { [email]: OpenSignFieldPlacement[] } shape. */
function parseWidgetsJson(
  value: FormDataEntryValue | null
): Record<string, OpenSignFieldPlacement[]> {
  if (typeof value !== "string" || !value.trim()) return {}
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("widgetsJson must map signer emails to field arrays.")
  }
  const bySigner: Record<string, OpenSignFieldPlacement[]> = {}
  for (const [email, fields] of Object.entries(parsed)) {
    if (!Array.isArray(fields)) continue
    bySigner[email.toLowerCase()] = fields.map(toFieldPlacement)
  }
  return bySigner
}

/**
 * Fallback placement when no fields were drawn: one signature and one date per
 * signer on the LAST page, stacked in a left column and clamped to the page.
 */
function defaultFields(lastPage: number, signerIndex: number): OpenSignFieldPlacement[] {
  // Two columns of up to 3 signers each keeps every box distinct; beyond six
  // signers the caller should be placing fields explicitly in the editor.
  const column = Math.floor(signerIndex / 3)
  const row = signerIndex % 3
  const xPct = 0.08 + column * 0.46
  const yPct = 0.62 + row * 0.12
  return [
    { page: lastPage, xPct, yPct, wPct: 0.28, hPct: 0.07, type: "signature", required: true },
    {
      page: lastPage,
      xPct: xPct + 0.3,
      yPct: yPct + 0.02,
      wPct: 0.14,
      hPct: 0.03,
      type: "date",
      required: true,
    },
  ]
}

export async function createOpenSignSignatureRequest(formData: FormData) {
  const session = await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])
  await requireGlobalDocumentAccess()
  const documentId = formData.get("documentId") as string

  if (!documentId) return { success: false, error: "Document ID required." }

  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    include: { signature_requests: true },
  })
  if (!doc) return { success: false, error: "Document not found." }
  if (!doc.file_url) return { success: false, error: "Document file required before sending for signature." }

  if (doc.signature_provider === "opensign_sending") return { success: false, error: "A signature send is preparing or its result is uncertain. Reconcile that request in OpenSign before sending again." }
  if (doc.signature_completed_at || doc.signature_status === "SIGNED") return { success: false, error: "This agreement already has a completed signature request." }
  if (doc.signature_provider_request_id && doc.signature_status !== "STALLED") return { success: false, error: "An active signature request already exists. Resolve it before sending another invitation." }

  const pendingSigners = doc.signature_requests.filter((sr) => sr.status === "PENDING")
  if (pendingSigners.length === 0) {
    return { success: false, error: "No pending signatories." }
  }

  let widgetsBySigner: Record<string, OpenSignFieldPlacement[]>
  try {
    widgetsBySigner = parseWidgetsJson(formData.get("widgetsJson"))
  } catch {
    return { success: false, error: "OpenSign widgets JSON is invalid." }
  }

  let sendClaim: string | null = null
  let createdProviderId: string | null = null
  try {
    const fileBytes = await fetchFileBytes(doc.file_url)

    // Page dims are the basis every percentage is multiplied against, so they
    // must match what the person PLACING fields was looking at.
    //
    // The field editor posts pagesJson from pdfjs getViewport({scale:1}), which
    // is rotation-aware and crop-relative: exactly the right basis, so it wins
    // when present and sane. Otherwise fall back to pdf-lib: cropBox width and
    // height ONLY (the signing client's own editor measures y within
    // [0, cropBox.height]; the crop.y offset is added by its flip, not by the
    // fraction basis), with width and height swapped for 90/270 rotated pages
    // because the viewer renders those in the rotated frame.
    const pdf = await PDFDocument.load(fileBytes)
    const derived: OpenSignPageDims[] = pdf.getPages().map((page, index) => {
      const size = page.getSize()
      const crop = page.getCropBox()
      const rotation = ((page.getRotation().angle % 360) + 360) % 360
      const widthPt = crop.width || size.width
      const heightPt = crop.height || size.height
      const rotated = rotation === 90 || rotation === 270
      return {
        pageNumber: index + 1,
        widthPt: rotated ? heightPt : widthPt,
        heightPt: rotated ? widthPt : heightPt,
      }
    })

    let pages = derived
    const rawPagesJson = formData.get("pagesJson")
    if (typeof rawPagesJson === "string" && rawPagesJson.trim()) {
      try {
        const posted = JSON.parse(rawPagesJson) as unknown
        if (Array.isArray(posted)) {
          const parsed = posted
            .map((entry) => {
              const record = entry as Record<string, unknown>
              return {
                pageNumber: Number(record.pageNumber),
                widthPt: Number(record.widthPt),
                heightPt: Number(record.heightPt),
              }
            })
            .filter(
              (page) =>
                Number.isInteger(page.pageNumber) &&
                page.pageNumber >= 1 &&
                page.pageNumber <= derived.length &&
                Number.isFinite(page.widthPt) &&
                page.widthPt > 0 &&
                Number.isFinite(page.heightPt) &&
                page.heightPt > 0
            )
          if (parsed.length === derived.length) pages = parsed
        }
      } catch {
        // Malformed pagesJson falls back to the server-derived dims.
      }
    }

    const lastPage = pages.length

    // With explicit placements, every pending signer must have fields; a
    // silent default behind the editor's back contradicts what the user saw.
    const hasExplicitWidgets = Object.keys(widgetsBySigner).length > 0
    if (hasExplicitWidgets) {
      const missing = pendingSigners.filter(
        (signer) => !(widgetsBySigner[signer.signatory_email.toLowerCase()]?.length)
      )
      if (missing.length > 0) {
        return {
          success: false,
          error: `No fields were placed for: ${missing.map((s) => s.signatory_email).join(", ")}. Place at least one field per signer, or use default placement.`,
        }
      }
    }
    const signerInputs = pendingSigners.map((signer, index) => ({
      name: signer.signatory_name,
      email: signer.signatory_email,
      fields:
        widgetsBySigner[signer.signatory_email.toLowerCase()] ??
        defaultFields(lastPage, index),
    }))

    const sourceArtifact = await recordArtifact({
      documentId: doc.id,
      stage: 'populated',
      finalized: true,
      fileUrl: doc.file_url,
      originalName: `${doc.title}.pdf`,
      mimeType: 'application/pdf',
      bytes: Buffer.from(fileBytes),
      actorId: session.userId,
      signerScope: pendingSigners.map(signer => signer.signatory_email),
    })

    const token = `preparing:${randomUUID()}`
    const claimed = await prisma.legalDocument.updateMany({ where: {
      id: doc.id, signature_provider: doc.signature_provider,
      signature_provider_request_id: doc.signature_provider_request_id,
      signature_status: doc.signature_status, signature_completed_at: null, file_url: doc.file_url,
    }, data: { signature_provider: "opensign_sending", signature_provider_request_id: token, signature_source_artifact_id: sourceArtifact.id, signature_status: "PREPARING" } })
    if (!claimed.count) return { success: false, error: "The file or signing state changed while preparing. Refresh before sending." }
    sendClaim = token
    const result = await createOpenSignDocument({
      title: doc.title,
      note: `Signature required: ${doc.title}`,
      description: `Prepared in LSC Legal by ${session.email}`,
      fileName: `${doc.title.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`,
      fileBytes,
      pages,
      signers: signerInputs,
    })

    if (!result.providerDocumentId) throw new Error("OpenSign returned no document ID. The send result must be reconciled before retrying.")
    createdProviderId = result.providerDocumentId
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      const bound = await tx.legalDocument.updateMany({ where: { id: doc.id, signature_provider: "opensign_sending", signature_provider_request_id: token, signature_source_artifact_id: sourceArtifact.id }, data: {
        lifecycle_status: "AWAITING_SIGNATURE", signature_provider: "opensign",
        signature_provider_request_id: result.providerDocumentId, signature_source_artifact_id: sourceArtifact.id,
        signature_status: "SENT", signature_sent_at: now,
      } })
      if (!bound.count) throw new Error(`Signing state changed. Reconcile OpenSign request ${result.providerDocumentId}; it was not bound to this document.`)
      for (const signer of pendingSigners) {
        const updated = await tx.signatureRequest.updateMany({ where: { id: signer.id, document_id: doc.id, status: "PENDING" }, data: { status: "SENT", sent_at: now, signing_url: result.signingLinks[signer.signatory_email.toLowerCase()] ?? null } })
        if (!updated.count) throw new Error(`Signers changed during submission. Reconcile OpenSign request ${result.providerDocumentId}.`)
      }
      await tx.lifecycleEvent.create({ data: { document_id: doc.id, from_status: doc.lifecycle_status, to_status: "AWAITING_SIGNATURE", transitioned_by: session.userId, notes: `Sent for signature via OpenSign request ${result.providerDocumentId}` } })
    })

    revalidatePath(`/legal/documents/${documentId}`)
    revalidatePath("/legal/signatures")

    // Legal tracker channel notice. Built here so the background callback stays
    // minimal, and scheduled with after() so a channel outage can never fail or
    // slow down the signature send.
    const trackerMessage = buildAgreementSentMessage({
      documentId,
      title: doc.title,
      entity: doc.entity,
      category: doc.category,
      counterparty: doc.counterparty,
      value: doc.value ? doc.value.toNumber() : null,
      currency: doc.currency,
      signerNames: pendingSigners.map((signer) => signer.signatory_name),
      sentByEmail: session.email,
      appBaseUrl: getAppBaseUrl(),
    })

    after(async () => {
      try {
        // The notifier reports delivery failure by return value, not by
        // throwing, so an unchecked result would be a silent miss.
        const notified = await emitLegalTrackerEvent("agreement.sent", trackerMessage, {
          entityType: "LegalDocument",
          entityId: documentId,
        })
        if (!notified.ok) {
          console.error(
            `Legal tracker notification not delivered for document ${documentId} (non-blocking):`,
            notified.error
          )
        }
      } catch (err) {
        console.error("Legal tracker notification failed (non-blocking):", err)
      }
    })

    return {
      success: true,
      providerDocumentId: result.providerDocumentId,
      signingLinks: result.signingLinks,
    }
  } catch (error) {
    if (sendClaim) {
      await prisma.legalDocument.updateMany({ where: { id: doc.id, signature_provider: "opensign_sending", signature_provider_request_id: sendClaim }, data: { signature_status: "SEND_UNCERTAIN" } })
      await prisma.lifecycleEvent.create({ data: { document_id: doc.id, from_status: doc.lifecycle_status, to_status: doc.lifecycle_status, transitioned_by: session.userId, notes: `OpenSign send requires reconciliation. Claim ${sendClaim}. Provider receipt: ${createdProviderId ?? "unknown"}. ${getOpenSignErrorMessage(error)}` } })
    }
    console.error("OpenSign create request error:", error)
    return { success: false, error: `${sendClaim ? "Send result is uncertain. Reconcile OpenSign before retrying. " : ""}${getOpenSignErrorMessage(error)}` }
  }
}

export async function sendForSignature(documentId: string) {
  const formData = new FormData()
  formData.set("documentId", documentId)
  return createOpenSignSignatureRequest(formData)
}
