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
import { emitFinanceEvent } from "@/lib/finance-webhook"
import { buildContractPayload } from "@/lib/finance-payloads"

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
  return Buffer.from(await response.arrayBuffer())
}

async function syncSignedDocumentToFinance(documentId: string): Promise<void> {
  const doc = await prisma.legalDocument.findUnique({ where: { id: documentId } })
  if (!doc) return

  const eventType = doc.last_finance_post_at ? "contract.updated" : "contract.created"
  const result = await emitFinanceEvent(eventType, buildContractPayload(doc), {
    entityType: "LegalDocument",
    entityId: documentId,
  })

  await prisma.legalDocument.update({
    where: { id: documentId },
    data: {
      last_finance_post_at: new Date(),
      finance_post_status: result.ok ? "synced" : "failed",
      last_finance_post_error: result.ok ? null : (result.error ?? "Unknown error"),
    },
  })
}

/**
 * Files the completed PDF as a new version. Guarded on the document not already
 * carrying an opensign-authored version, because the poller will see the same
 * completed document on every tick until the lifecycle moves on.
 */
async function storeSignedPdf(documentId: string, signedUrl: string): Promise<string | null> {
  const existing = await prisma.documentVersion.findFirst({
    where: { document_id: documentId, created_by: "opensign" },
    select: { id: true },
  })
  if (existing) return null

  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    select: { id: true, entity: true, title: true },
  })
  if (!doc) return null

  const buffer = await fetchSignedPdf(signedUrl)
  const key = getS3Key(doc.entity, "signed", `${doc.title}-signed.pdf`)
  const storedUrl = await uploadBufferToS3(buffer, key, "application/pdf")

  const lastVersion = await prisma.documentVersion.findFirst({
    where: { document_id: documentId },
    orderBy: { version_number: "desc" },
    select: { version_number: true },
  })

  const version = await prisma.documentVersion.create({
    data: {
      document_id: documentId,
      version_number: (lastVersion?.version_number ?? 0) + 1,
      file_url: storedUrl,
      change_summary: "Completed signed copy from OpenSign",
      created_by: "opensign",
    },
  })

  await prisma.legalDocument.update({
    where: { id: documentId },
    data: { file_url: storedUrl },
  })

  after(async () => {
    try {
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer
      const signedFile = new File([arrayBuffer], `${doc.title}-signed.pdf`, {
        type: "application/pdf",
      })
      const content = await extractTextFromFile(signedFile)
      await runAgent("agreement-analyzer", {
        documentId,
        versionId: version.id,
        sourceType: "document_version",
        sourceLabel: "OpenSign completed PDF",
        content: content || doc.title,
      })
    } catch (error) {
      console.error("OpenSign completed PDF analysis failed (non-blocking):", error)
    }
  })

  return storedUrl
}

/**
 * Reconciles one document against the state OpenSign reports.
 *
 * Pass `status` when it is already in hand (the webhook path); omit it and this
 * fetches the current state itself (the polling path).
 */
export async function applyOpenSignStatus(
  documentId: string,
  status?: OpenSignDocumentStatus
): Promise<OpenSignSyncOutcome> {
  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    include: { signature_requests: true },
  })
  if (!doc) return { documentId, changed: false, status: "skipped", detail: "document not found" }
  if (!doc.signature_provider_request_id) {
    return { documentId, changed: false, status: "skipped", detail: "no provider document id" }
  }

  const current = status ?? (await fetchOpenSignDocument(doc.signature_provider_request_id))
  const now = new Date()
  let changed = false

  // Viewed and signed are derived from the audit trail, so only write when the
  // stored state actually differs.
  for (const signer of doc.signature_requests) {
    const email = signer.signatory_email.toLowerCase()
    const hasSigned = current.signedEmails.includes(email)
    const hasViewed = current.viewedEmails.includes(email) || hasSigned

    if (hasSigned && signer.status !== "SIGNED") {
      await prisma.signatureRequest.update({
        where: { id: signer.id },
        data: { status: "SIGNED", signed_at: signer.signed_at ?? now },
      })
      changed = true
    } else if (hasViewed && !signer.viewed_at) {
      await prisma.signatureRequest.update({
        where: { id: signer.id },
        data: { viewed_at: now },
      })
      changed = true
    }
  }

  if (current.isDeclined) {
    if (doc.signature_status !== "STALLED") {
      await prisma.$transaction([
        prisma.signatureRequest.updateMany({
          where: { document_id: doc.id, status: { not: "SIGNED" } },
          data: {
            status: "STALLED",
            declined_at: now,
            stalled_reason: current.declinedReason ?? "Declined in OpenSign",
          },
        }),
        prisma.legalDocument.update({
          where: { id: doc.id },
          data: { signature_status: "STALLED" },
        }),
        prisma.lifecycleEvent.create({
          data: {
            document_id: doc.id,
            from_status: doc.lifecycle_status,
            to_status: doc.lifecycle_status,
            transitioned_by: "opensign",
            notes: current.declinedReason
              ? `Declined in OpenSign: ${current.declinedReason}`
              : "Declined in OpenSign",
          },
        }),
      ])
      changed = true
    }
    return { documentId, changed, status: "declined" }
  }

  if (!current.isCompleted) {
    return { documentId, changed, status: "in_progress" }
  }

  // Completed. Already-signed documents are left alone so the poller cannot
  // re-file or re-post them.
  if (doc.lifecycle_status === "SIGNED" || doc.signature_status === "SIGNED") {
    return { documentId, changed, status: "completed", detail: "already recorded" }
  }

  const storedUrl = current.signedUrl ? await storeSignedPdf(doc.id, current.signedUrl) : null

  await prisma.$transaction([
    prisma.signatureRequest.updateMany({
      where: { document_id: doc.id },
      data: { status: "SIGNED", signed_at: now },
    }),
    prisma.legalDocument.update({
      where: { id: doc.id },
      data: {
        lifecycle_status: "SIGNED",
        signature_status: "SIGNED",
        signature_completed_at: now,
        contract_status: "active",
        finance_post_status: "pending",
      },
    }),
    prisma.lifecycleEvent.create({
      data: {
        document_id: doc.id,
        from_status: doc.lifecycle_status,
        to_status: "SIGNED",
        transitioned_by: "opensign",
        notes: storedUrl
          ? "All parties signed via OpenSign; signed PDF stored"
          : "All parties signed via OpenSign",
      },
    }),
  ])

  await syncSignedDocumentToFinance(doc.id)
  return { documentId, changed: true, status: "completed" }
}
