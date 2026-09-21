/**
 * Applies OpenSign signing state to a LegalDocument.
 *
 * This is the shared completion path. The self-hosted OpenSign build sends no
 * webhooks, so the live caller is the polling cron; the webhook route delegates
 * here too so a future hosted deployment cannot drift into a second, subtly
 * different implementation of the step that files signed contracts and posts to
 * Finance.
 *
 * Everything here is idempotent: polling re-reads the same state repeatedly and
 * must not create duplicate versions, duplicate Finance events, or repeated
 * lifecycle transitions.
 */
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchOpenSignDocument, type OpenSignDocumentStatus } from "@/lib/opensign"
import { getS3Key, uploadBufferToS3 } from "@/lib/s3"
import { extractTextFromFile } from "@/lib/extract-text"
import { runAgent } from "@/lib/agents/orchestrator"
import { queueFinanceEvent, deliverFinanceEvent } from "@/lib/finance-webhook"
import { notifyDocumentReviewChange } from "@/lib/review-service"
import { preserveOpenSignCertificate } from "@/lib/opensign-certificates"
import { buildContractPayload } from "@/lib/finance-payloads"
import { recordArtifact, boundedArtifactBytes } from "@/lib/document-artifacts"

export interface OpenSignSyncOutcome {
  documentId: string
  changed: boolean
  status: "completed" | "declined" | "in_progress" | "skipped"
  detail?: string
}

async function fetchSignedPdf(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) {
    throw new Error(`OpenSign signed PDF download failed: HTTP ${response.status}`)
  }
  return boundedArtifactBytes(response)
}

/** Reconciles a single, explicitly bound provider request. File I/O happens before the CAS transaction. */
export async function applyOpenSignStatus(documentId: string, status?: OpenSignDocumentStatus): Promise<OpenSignSyncOutcome> {
  const doc = await prisma.legalDocument.findUnique({ where: { id: documentId }, include: { signature_requests: true } })
  if (!doc || doc.signature_provider !== "opensign" || !doc.signature_provider_request_id) return { documentId, changed: false, status: "skipped", detail: "No active OpenSign provider request" }
  const current = status ?? await fetchOpenSignDocument(doc.signature_provider_request_id)
  if (current.objectId !== doc.signature_provider_request_id) return { documentId, changed: false, status: "skipped", detail: "Provider request does not match the current binding" }
  if (doc.lifecycle_status === "SIGNED" || doc.signature_status === "SIGNED") {
    const certificate = await preserveOpenSignCertificate(doc.id, current)
    return { documentId, changed: false, status: "completed", detail: `Already signed; certificate ${certificate.status}` }
  }

  // Never infer the submitted source from a file uploaded after the invitation.
  const sourceArtifact = doc.signature_source_artifact_id
    ? await prisma.documentArtifact.findFirst({ where: { id: doc.signature_source_artifact_id, document_id: doc.id, stage: "populated" } })
    : null
  if (doc.signature_source_artifact_id && !sourceArtifact) throw new Error("Bound signing source artifact is missing or invalid")
  const sourceEmails = Array.isArray(sourceArtifact?.signer_scope)
    ? sourceArtifact.signer_scope.filter((value): value is string => typeof value === "string").map((value) => value.toLowerCase())
    : null
  const requestSigners = doc.signature_requests.filter((signer) => sourceEmails ? sourceEmails.includes(signer.signatory_email.toLowerCase()) && signer.status !== "PENDING" : signer.status !== "PENDING")
  const now = new Date()
  let stored: { url: string; bytes: Buffer } | null = null
  if (current.isCompleted && !current.isDeclined) {
    if (!current.signedUrl) return { documentId, changed: false, status: "in_progress", detail: "Provider completed; signed PDF is not available yet" }
    const bytes = await fetchSignedPdf(current.signedUrl)
    const url = await uploadBufferToS3(bytes, getS3Key(doc.entity, "signed", `${doc.title}-signed.pdf`), "application/pdf")
    stored = { url, bytes }
  }
  const signedFile = stored
  const financeEventType = doc.last_finance_post_at ? "contract.updated" : "contract.created"
  const result = await prisma.$transaction(async (tx) => {
    // This write locks the row. A resend, completed poll or provider replacement
    // wins first or loses entirely; it cannot mix signer and file states.
    const claimed = await tx.legalDocument.updateMany({ where: {
      id: doc.id, signature_provider: "opensign", signature_provider_request_id: current.objectId,
      signature_source_artifact_id: doc.signature_source_artifact_id,
      signature_status: doc.signature_status, lifecycle_status: doc.lifecycle_status,
    }, data: signedFile ? {
      file_url: signedFile.url, lifecycle_status: "SIGNED", signature_status: "SIGNED",
      signature_completed_at: now, contract_status: "active", finance_post_status: "pending",
    } : { signature_status: current.isDeclined ? "STALLED" : doc.signature_status } })
    if (!claimed.count) return { applied: false as const, changed: false, versionId: null, financeEventId: null }
    let changed = false
    for (const signer of requestSigners) {
      const email = signer.signatory_email.toLowerCase()
      const hasSigned = current.signedEmails.includes(email) || Boolean(signedFile)
      const hasViewed = current.viewedEmails.includes(email) || hasSigned
      if (hasSigned && signer.status !== "SIGNED") {
        await tx.signatureRequest.updateMany({ where: { id: signer.id, document_id: doc.id }, data: { status: "SIGNED", signed_at: signer.signed_at ?? now } })
        changed = true
      } else if (hasViewed && !signer.viewed_at) {
        await tx.signatureRequest.updateMany({ where: { id: signer.id, document_id: doc.id }, data: { viewed_at: now } })
        changed = true
      }
    }
    if (current.isDeclined && doc.signature_status !== "STALLED") {
      await tx.signatureRequest.updateMany({ where: { id: { in: requestSigners.map((signer) => signer.id) }, status: { not: "SIGNED" } }, data: { status: "STALLED", declined_at: now, stalled_reason: current.declinedReason ?? "Declined in OpenSign" } })
      await tx.lifecycleEvent.create({ data: { document_id: doc.id, from_status: doc.lifecycle_status, to_status: doc.lifecycle_status, transitioned_by: "opensign", notes: current.declinedReason ? `Declined in OpenSign: ${current.declinedReason}` : "Declined in OpenSign" } })
      changed = true
    }
    let versionId: string | null = null
    let financeEventId: string | null = null
    if (signedFile) {
      const lastVersion = await tx.documentVersion.findFirst({ where: { document_id: doc.id }, orderBy: { version_number: "desc" }, select: { version_number: true } })
      const version = await tx.documentVersion.create({ data: { document_id: doc.id, version_number: (lastVersion?.version_number ?? 0) + 1, file_url: signedFile.url, change_summary: `Completed signed copy from OpenSign request ${current.objectId}`, created_by: "opensign" } })
      versionId = version.id
      await notifyDocumentReviewChange(doc.id, `version:${version.id}`, tx)
      await tx.lifecycleEvent.create({ data: { document_id: doc.id, from_status: doc.lifecycle_status, to_status: "SIGNED", transitioned_by: "opensign", notes: "All parties signed via OpenSign; signed PDF and artifact stored" } })
      await recordArtifact({ documentId: doc.id, sourceArtifactId: sourceArtifact?.id, stage: "signed", fileUrl: signedFile.url, originalName: `${doc.title}.pdf`, mimeType: "application/pdf", bytes: signedFile.bytes, actorId: "opensign", signerScope: requestSigners.map((signer) => signer.signatory_email), finalized: true, provenance: { provider: "opensign", providerRequestId: current.objectId } }, tx)
      const updated = await tx.legalDocument.findUnique({ where: { id: doc.id } })
      if (!updated) throw new Error("Signed document disappeared during reconciliation")
      const event = await queueFinanceEvent(financeEventType, buildContractPayload(updated), { entityType: "LegalDocument", entityId: doc.id }, tx)
      financeEventId = event.id
      changed = true
    }
    return { applied: true as const, changed, versionId, financeEventId }
  })
  if (!result.applied) return { documentId, changed: false, status: "skipped", detail: "Signing request changed during reconciliation" }
  if (signedFile && result.versionId) {
    const versionId = result.versionId
    after(async () => {
      try {
        const arrayBuffer = signedFile.bytes.buffer.slice(signedFile.bytes.byteOffset, signedFile.bytes.byteOffset + signedFile.bytes.byteLength) as ArrayBuffer
        const content = await extractTextFromFile(new File([arrayBuffer], `${doc.title}-signed.pdf`, { type: "application/pdf" }))
        await runAgent("agreement-analyzer", { documentId, versionId, sourceType: "document_version", sourceLabel: "OpenSign completed PDF", content: content || doc.title })
      } catch (error) { console.error("OpenSign completed PDF analysis failed (non-blocking):", error) }
    })
    if (result.financeEventId) {
      let delivery: { ok: boolean; error?: string }
      try { delivery = await deliverFinanceEvent(result.financeEventId, financeEventType) }
      catch (error) { delivery = { ok: false, error: error instanceof Error ? error.message : "Finance delivery failed" } }
      await prisma.legalDocument.update({ where: { id: doc.id }, data: { last_finance_post_at: new Date(), finance_post_status: delivery.ok ? "synced" : "failed", last_finance_post_error: delivery.ok ? null : delivery.error ?? "Finance delivery failed; durable event is queued" } })
    }
  }
  if (signedFile) await preserveOpenSignCertificate(doc.id, current)
  return { documentId, changed: result.changed, status: current.isDeclined ? "declined" : signedFile ? "completed" : "in_progress" }
}
