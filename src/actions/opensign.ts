"use server"

import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createOpenSignDocument, getOpenSignWebhookUrl } from "@/lib/opensign"
import { getPresignedUrl, getS3KeyFromUrl } from "@/lib/s3"
import { revalidatePath } from "next/cache"

function getOpenSignErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("OPENSIGN_BASE_URL")) {
      return "OpenSign is not configured. Add OPENSIGN_BASE_URL to the environment."
    }
    if (error.message.includes("OPENSIGN_API_TOKEN")) {
      return "OpenSign API token is not configured. Add OPENSIGN_API_TOKEN to the environment."
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

async function fetchFileAsBase64(fileUrl: string): Promise<string> {
  const downloadUrl = await getOpenSignFileUrl(fileUrl)
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) {
    throw new Error(`Could not read document file for OpenSign: HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  return buffer.toString("base64")
}

function parseWidgetsJson(value: FormDataEntryValue | null): Record<string, unknown[]> {
  if (typeof value !== "string" || !value.trim()) return {}
  const parsed = JSON.parse(value) as unknown
  if (Array.isArray(parsed)) return { default: parsed }
  if (parsed && typeof parsed === "object") {
    const widgets: Record<string, unknown[]> = {}
    for (const [key, maybeWidgets] of Object.entries(parsed)) {
      if (Array.isArray(maybeWidgets)) widgets[key.toLowerCase()] = maybeWidgets
    }
    return widgets
  }
  return {}
}

function defaultWidgets(index: number) {
  const y = Math.max(80, 680 - index * 72)
  return [
    {
      type: "signature",
      page: 1,
      x: 340,
      y,
      w: 170,
      h: 36,
      required: true,
    },
    {
      type: "date",
      page: 1,
      x: 520,
      y,
      w: 90,
      h: 24,
      required: true,
    },
  ]
}

export async function createOpenSignSignatureRequest(formData: FormData) {
  const session = await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])
  const documentId = formData.get("documentId") as string

  if (!documentId) return { success: false, error: "Document ID required." }

  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    include: { signature_requests: true },
  })
  if (!doc) return { success: false, error: "Document not found." }
  if (!doc.file_url) return { success: false, error: "Document file required before sending for signature." }

  const pendingSigners = doc.signature_requests.filter((sr) => sr.status === "PENDING")
  if (pendingSigners.length === 0) {
    return { success: false, error: "No pending signatories." }
  }

  let widgetsBySigner: Record<string, unknown[]>
  try {
    widgetsBySigner = parseWidgetsJson(formData.get("widgetsJson"))
  } catch {
    return { success: false, error: "OpenSign widgets JSON is invalid." }
  }

  try {
    const fileBase64 = await fetchFileAsBase64(doc.file_url)
    const result = await createOpenSignDocument({
      title: doc.title,
      note: `Signature required: ${doc.title}`,
      description: `Prepared in LSC Legal by ${session.email}`,
      fileName: `${doc.title.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`,
      fileBase64,
      webhookUrl: getOpenSignWebhookUrl() ?? undefined,
      metadata: { documentId: doc.id },
      signers: pendingSigners.map((signer, index) => ({
        name: signer.signatory_name,
        email: signer.signatory_email,
        widgets:
          widgetsBySigner[signer.signatory_email.toLowerCase()] ??
          widgetsBySigner.default ??
          defaultWidgets(index),
      })),
    })

    if (!result.providerDocumentId) {
      return {
        success: false,
        error: "OpenSign did not return a document ID. Check the API response and OpenSign version.",
      }
    }

    const now = new Date()
    const updateSigners = pendingSigners.map((signer) =>
      prisma.signatureRequest.update({
        where: { id: signer.id },
        data: {
          status: "SENT",
          sent_at: now,
          signing_url: result.signingLinks[signer.signatory_email.toLowerCase()] ?? null,
        },
      })
    )

    await prisma.$transaction([
      prisma.legalDocument.update({
        where: { id: documentId },
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
          document_id: documentId,
          from_status: doc.lifecycle_status,
          to_status: "AWAITING_SIGNATURE",
          transitioned_by: session.userId,
          notes: "Sent for signature via OpenSign",
        },
      }),
      ...updateSigners,
    ])

    revalidatePath(`/legal/documents/${documentId}`)
    revalidatePath("/legal/signatures")
    return {
      success: true,
      providerDocumentId: result.providerDocumentId,
      signingLinks: result.signingLinks,
    }
  } catch (error) {
    console.error("OpenSign create request error:", error)
    return { success: false, error: getOpenSignErrorMessage(error) }
  }
}

export async function sendForSignature(documentId: string) {
  const formData = new FormData()
  formData.set("documentId", documentId)
  return createOpenSignSignatureRequest(formData)
}
