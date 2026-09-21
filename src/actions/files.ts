"use server"

import { requireGlobalDocumentAccess } from "@/lib/document-access"
import { requireSession } from "@/lib/auth"
import { recordArtifact } from "@/lib/document-artifacts"
import { notifyDocumentReviewChange, notifyPolicyReviewChange } from "@/lib/review-service"
import { prisma } from "@/lib/prisma"
import { uploadToS3, getS3Key } from "@/lib/s3"
import { extractTextFromFile } from "@/lib/extract-text"
import { runAgent } from "@/lib/agents/orchestrator"
import { after } from "next/server"
import { revalidatePath } from "next/cache"

/** Extraction and analysis are optional follow-up work, never the upload receipt. */
function queueUploadAnalysis(documentId: string, file: File, versionId?: string) {
  try {
    after(async () => {
      try {
        const extractedText = await extractTextFromFile(file)
        const doc = await prisma.legalDocument.findUnique({ where: { id: documentId }, select: { title: true, notes: true } })
        const content = extractedText.trim() || doc?.notes || doc?.title || ""
        if (!content.trim()) return
        await runAgent("agreement-analyzer", {
          documentId, ...(versionId ? { versionId } : {}),
          sourceType: versionId ? "document_version" : "legal_document",
          sourceLabel: file.name, content,
        })
      } catch (error) { console.error("Uploaded file analysis failed (non-blocking):", error) }
    })
  } catch (error) { console.error("Uploaded file analysis could not be scheduled (non-blocking):", error) }
}

export async function uploadDocumentFile(formData: FormData) {
  const session = await requireSession()
  await requireGlobalDocumentAccess()
  const file = formData.get("file") as File
  const documentId = formData.get("documentId") as string
  const entity = (formData.get("entity") as string) || "LSC"
  const category = (formData.get("category") as string) || "general"

  if (!file || !documentId)
    return { success: false, error: "File and document ID required" }
  if (file.size > 25 * 1024 * 1024)
    return { success: false, error: "File too large (max 25MB)" }

  try {
    const key = getS3Key(entity, category, file.name)
    const url = await uploadToS3(file, key)

    const bytes = Buffer.from(await file.arrayBuffer())
    await prisma.$transaction(async tx => {
      await recordArtifact({ documentId, stage: 'populated', fileUrl: url, originalName: file.name, mimeType: file.type || 'application/octet-stream', bytes, actorId: session.userId }, tx)
      await tx.legalDocument.update({ where: { id: documentId }, data: { file_url: url } })
      await notifyDocumentReviewChange(documentId, `file:${key}`, tx)
    })
    queueUploadAnalysis(documentId, file)

    revalidatePath(`/legal/documents/${documentId}`)
    revalidatePath("/legal/documents")
    return { success: true, data: { url } }
  } catch (error) {
    console.error("Failed to upload document file:", error)
    return { success: false, error: "Upload failed. Please try again." }
  }
}

export async function uploadVersionFile(formData: FormData) {
  const session = await requireSession()
  await requireGlobalDocumentAccess()
  const file = formData.get("file") as File
  const documentId = formData.get("documentId") as string
  const changeSummary = (formData.get("changeSummary") as string) || ""
  const entity = (formData.get("entity") as string) || "LSC"

  if (!file || !documentId)
    return { success: false, error: "File and document ID required" }
  if (file.size > 25 * 1024 * 1024)
    return { success: false, error: "File too large (max 25MB)" }

  try {
    const key = getS3Key(entity, "versions", file.name)
    const url = await uploadToS3(file, key)

    const bytes = Buffer.from(await file.arrayBuffer())
    const version = await prisma.$transaction(async tx => {
      const lastVersion = await tx.documentVersion.findFirst({ where: { document_id: documentId }, orderBy: { version_number: 'desc' }, select: { version_number: true } })
      await recordArtifact({ documentId, stage: 'populated', fileUrl: url, originalName: file.name, mimeType: file.type || 'application/octet-stream', bytes, actorId: session.userId }, tx)
      const created = await tx.documentVersion.create({ data: { document_id: documentId, version_number: (lastVersion?.version_number ?? 0) + 1, file_url: url, change_summary: changeSummary, created_by: session.userId } })
      await notifyDocumentReviewChange(documentId, `version:${created.id}`, tx)
      return created
    }, { isolationLevel: 'Serializable' })
    queueUploadAnalysis(documentId, file, version.id)

    revalidatePath(`/legal/documents/${documentId}`)
    return { success: true, data: { url } }
  } catch (error) {
    console.error("Failed to upload version file:", error)
    return { success: false, error: "Upload failed. Please try again." }
  }
}

export async function uploadPolicyFile(formData: FormData) {
  await requireSession()
  await requireGlobalDocumentAccess()
  const file = formData.get("file") as File
  const policyId = formData.get("policyId") as string

  if (!file || !policyId)
    return { success: false, error: "File and policy ID required" }
  if (file.size > 25 * 1024 * 1024)
    return { success: false, error: "File too large (max 25MB)" }

  try {
    const key = getS3Key("lsc", "policies", file.name)
    const url = await uploadToS3(file, key)

    await prisma.$transaction(async tx => {
      await tx.policyDocument.update({ where: { id: policyId }, data: { file_url: url } })
      await notifyPolicyReviewChange(policyId, `file:${url}`, tx)
    })
    revalidatePath("/legal/policies")
    return { success: true, data: { url } }
  } catch (error) {
    console.error("Failed to upload policy file:", error)
    return { success: false, error: "Upload failed. Please try again." }
  }
}

export async function deleteDocumentFile(documentId: string) {
  await requireSession()
  await requireGlobalDocumentAccess()

  try {
    const doc = await prisma.legalDocument.findUnique({
      where: { id: documentId },
      select: { file_url: true },
    })

    if (doc?.file_url) {
      // Detach the current file without erasing bytes referenced by internal history.
      await prisma.legalDocument.update({
        where: { id: documentId },
        data: { file_url: null },
      })
    }

    revalidatePath(`/legal/documents/${documentId}`)
    revalidatePath("/legal/documents")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete document file:", error)
    return { success: false, error: "Delete failed. Please try again." }
  }
}
