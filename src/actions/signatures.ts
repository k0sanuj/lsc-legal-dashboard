"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import type { SignatureStatus } from "@/generated/prisma/client"

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function revalidateSignatureViews(documentId?: string) {
  revalidatePath("/legal/signatures")
  revalidatePath("/legal")
  if (documentId) revalidatePath(`/legal/documents/${documentId}`)
}

export async function updateSignatureStatus(
  requestId: string,
  newStatus: SignatureStatus
) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const updated = await prisma.signatureRequest.update({
    where: { id: requestId },
    data: {
      status: newStatus,
      ...(newStatus === "SENT" ? { sent_at: new Date() } : {}),
      ...(newStatus === "SIGNED" ? { signed_at: new Date() } : {}),
    },
  })

  revalidateSignatureViews(updated.document_id)
  return updated
}

export async function createSignatureRequest(formData: FormData) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const documentId = String(formData.get("documentId") ?? "")
  const signatoryName = String(formData.get("signatoryName") ?? "").trim()
  const signatoryEmail = normalizeEmail(String(formData.get("signatoryEmail") ?? ""))

  if (!documentId) return { success: false, error: "Document ID required." }
  if (!signatoryName) return { success: false, error: "Signer name required." }
  if (!isValidEmail(signatoryEmail)) return { success: false, error: "Valid signer email required." }

  const document = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    select: { id: true },
  })
  if (!document) return { success: false, error: "Document not found." }

  const duplicate = await prisma.signatureRequest.findFirst({
    where: {
      document_id: documentId,
      signatory_email: { equals: signatoryEmail, mode: "insensitive" },
      status: { in: ["PENDING", "SENT"] },
    },
    select: { id: true },
  })
  if (duplicate) return { success: false, error: "This signer is already on the active request." }

  const signer = await prisma.signatureRequest.create({
    data: {
      document_id: documentId,
      signatory_name: signatoryName,
      signatory_email: signatoryEmail,
      status: "PENDING",
    },
  })

  revalidateSignatureViews(documentId)
  return { success: true, signerId: signer.id }
}

export async function deleteSignatureRequest(formData: FormData) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const requestId = String(formData.get("requestId") ?? "")
  if (!requestId) return { success: false, error: "Signature request ID required." }

  const existing = await prisma.signatureRequest.findUnique({
    where: { id: requestId },
    select: { id: true, document_id: true, status: true },
  })
  if (!existing) return { success: false, error: "Signature request not found." }
  if (existing.status === "SIGNED") {
    return { success: false, error: "Signed requests cannot be removed." }
  }

  await prisma.signatureRequest.delete({ where: { id: requestId } })

  revalidateSignatureViews(existing.document_id)
  return { success: true }
}

export async function createSignatureRequests(
  documentId: string,
  signatories: { name: string; email: string }[]
) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  if (!documentId) return { success: false, error: "Document ID required." }
  const cleaned = signatories
    .map((signer) => ({
      name: signer.name.trim(),
      email: normalizeEmail(signer.email),
    }))
    .filter((signer) => signer.name && isValidEmail(signer.email))

  if (cleaned.length === 0) return { success: false, error: "At least one valid signer required." }

  for (const signer of cleaned) {
    await prisma.signatureRequest.create({
      data: {
        document_id: documentId,
        signatory_name: signer.name,
        signatory_email: signer.email,
        status: "PENDING",
      },
    })
  }

  revalidateSignatureViews(documentId)
  return { success: true }
}
