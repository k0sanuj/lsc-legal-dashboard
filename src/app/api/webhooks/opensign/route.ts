import { after, NextRequest } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  hashOpenSignWebhookEvent,
  verifyOpenSignWebhookSignature,
} from "@/lib/opensign"
import { getS3Key, uploadBufferToS3 } from "@/lib/s3"
import { extractTextFromFile } from "@/lib/extract-text"
import { runAgent } from "@/lib/agents/orchestrator"
import { emitFinanceEvent } from "@/lib/finance-webhook"
import { buildContractPayload } from "@/lib/finance-payloads"

export const runtime = "nodejs"

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function pickString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(payload[key])
    if (value) return value
  }
  const nested = asRecord(payload.data)
  if (Object.keys(nested).length > 0) {
    return pickString(nested, keys)
  }
  return null
}

function eventTypeFromPayload(payload: Record<string, unknown>): string {
  return (
    pickString(payload, ["event", "eventType", "type", "event_name"]) ??
    "unknown"
  )
}

function providerIdFromPayload(payload: Record<string, unknown>): string | null {
  return pickString(payload, ["objectId", "documentId", "document_id", "id", "_id"])
}

function signerEmailFromPayload(payload: Record<string, unknown>): string | null {
  const signer = asRecord(payload.signer ?? asRecord(payload.data).signer)
  return (
    asString(signer.email) ??
    pickString(payload, ["email", "signerEmail", "signer_email"])
  )
}

function signedFileUrlFromPayload(payload: Record<string, unknown>): string | null {
  return pickString(payload, ["file", "fileUrl", "file_url", "signedFile", "signed_file"])
}

async function findLinkedDocument(payload: Record<string, unknown>) {
  const providerId = providerIdFromPayload(payload)
  const metadata = asRecord(payload.metadata ?? asRecord(payload.data).metadata)
  const documentId = asString(metadata.documentId)

  const or = []
  if (documentId) or.push({ id: documentId })
  if (providerId) or.push({ signature_provider_request_id: providerId })
  if (or.length === 0) return null

  return prisma.legalDocument.findFirst({
    where: { OR: or },
    include: { signature_requests: true },
  })
}

async function fetchSignedPdf(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) {
    throw new Error(`OpenSign signed PDF download failed: HTTP ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function syncSignedDocumentToFinance(documentId: string) {
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

async function storeSignedPdfAndAnalyze(
  documentId: string,
  fileUrl: string | null
): Promise<string | null> {
  if (!fileUrl) return null

  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    select: { id: true, entity: true, title: true },
  })
  if (!doc) return null

  const buffer = await fetchSignedPdf(fileUrl)
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
      console.error("OpenSign completed PDF analysis failed:", error)
    }
  })

  return storedUrl
}

async function processOpenSignEvent(payload: Record<string, unknown>) {
  const eventType = eventTypeFromPayload(payload).toLowerCase()
  const providerId = providerIdFromPayload(payload)
  const signerEmail = signerEmailFromPayload(payload)
  const doc = await findLinkedDocument(payload)

  if (!doc) {
    return { status: "ignored", error: "No Legal document matched OpenSign event" }
  }

  const now = new Date()

  if (providerId && providerId !== doc.signature_provider_request_id) {
    await prisma.legalDocument.update({
      where: { id: doc.id },
      data: {
        signature_provider: "opensign",
        signature_provider_request_id: providerId,
      },
    })
  }

  if (eventType.includes("view") && signerEmail) {
    await prisma.signatureRequest.updateMany({
      where: {
        document_id: doc.id,
        signatory_email: { equals: signerEmail, mode: "insensitive" },
      },
      data: { viewed_at: now },
    })
  }

  if (eventType.includes("sign") && !eventType.includes("completed")) {
    await prisma.signatureRequest.updateMany({
      where: {
        document_id: doc.id,
        ...(signerEmail
          ? { signatory_email: { equals: signerEmail, mode: "insensitive" } }
          : {}),
      },
      data: { status: "SIGNED", signed_at: now },
    })
  }

  if (
    eventType.includes("declin") ||
    eventType.includes("cancel") ||
    eventType.includes("revoke") ||
    eventType.includes("void") ||
    eventType.includes("error")
  ) {
    await prisma.$transaction([
      prisma.signatureRequest.updateMany({
        where: {
          document_id: doc.id,
          ...(signerEmail
            ? { signatory_email: { equals: signerEmail, mode: "insensitive" } }
            : {}),
        },
        data: {
          status: "STALLED",
          declined_at: now,
          stalled_reason: `OpenSign ${eventType}`,
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
          notes: `OpenSign ${eventType}`,
        },
      }),
    ])
  }

  if (eventType.includes("complete") || eventType.includes("completed")) {
    const signedFileUrl = await storeSignedPdfAndAnalyze(doc.id, signedFileUrlFromPayload(payload))

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
          notes: signedFileUrl
            ? "All parties signed via OpenSign; signed PDF stored"
            : "All parties signed via OpenSign",
        },
      }),
    ])

    await syncSignedDocumentToFinance(doc.id)
  }

  if (eventType.includes("sent") || eventType.includes("create")) {
    await prisma.signatureRequest.updateMany({
      where: { document_id: doc.id, status: "PENDING" },
      data: { status: "SENT", sent_at: now },
    })
    await prisma.legalDocument.update({
      where: { id: doc.id },
      data: {
        signature_status: "SENT",
        signature_sent_at: doc.signature_sent_at ?? now,
      },
    })
  }

  return { status: "processed", documentId: doc.id }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature =
    request.headers.get("x-webhook-signature") ??
    request.headers.get("x-opensign-signature") ??
    request.headers.get("x-signature")

  if (!verifyOpenSignWebhookSignature(rawBody, signature)) {
    return new Response("Invalid OpenSign webhook signature", { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return new Response("Invalid OpenSign webhook payload", { status: 400 })
  }

  const eventHash = hashOpenSignWebhookEvent(rawBody)
  const existing = await prisma.webhookEventLog.findUnique({
    where: { event_hash: eventHash },
    select: { id: true },
  })
  if (existing) {
    return new Response("OpenSign Event Received", { status: 200 })
  }

  const log = await prisma.webhookEventLog.create({
    data: {
      provider: "opensign",
      event_hash: eventHash,
      event_type: eventTypeFromPayload(payload),
      raw_payload: payload as Prisma.InputJsonValue,
    },
  })

  try {
    const result = await processOpenSignEvent(payload)
    await prisma.webhookEventLog.update({
      where: { id: log.id },
      data: {
        processing_status: result.status,
        document_id: "documentId" in result ? result.documentId : null,
        error: "error" in result ? result.error : null,
        processed_at: new Date(),
      },
    })
    return new Response("OpenSign Event Received", { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("OpenSign webhook processing failed:", error)
    await prisma.webhookEventLog.update({
      where: { id: log.id },
      data: {
        processing_status: "failed",
        error: message,
      },
    })
    return new Response("OpenSign webhook processing failed", { status: 500 })
  }
}
