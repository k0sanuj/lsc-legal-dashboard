"use server"

import { requireSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadToS3, deleteFromS3, getS3Key } from "@/lib/s3"
import { extractTextFromFile } from "@/lib/extract-text"
import { runAgent } from "@/lib/agents/orchestrator"
import { after } from "next/server"
import { revalidatePath } from "next/cache"

export async function uploadDocumentFile(formData: FormData) {
  await requireSession()
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

    await prisma.legalDocument.update({
      where: { id: documentId },
      data: { file_url: url },
    })

    // Extract the file's actual text so the analyzer has real content to
    // work with, not just title/notes metadata.
    const extractedText = await extractTextFromFile(file)
    const doc = await prisma.legalDocument.findUnique({
      where: { id: documentId },
      select: { title: true, notes: true },
    })
    const content = extractedText.trim() || doc?.notes || doc?.title || ""

    // Fire the analyzer in the background so the upload request returns
    // immediately. The request stays alive long enough via after() for
    // the agent to complete.
    after(async () => {
      try {
        await runAgent("agreement-analyzer", { documentId, content })
      } catch (e) {
        console.error("Agent analysis failed (non-blocking):", e)
      }
    })

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

    // Get current max version number
    const lastVersion = await prisma.documentVersion.findFirst({
      where: { document_id: documentId },
      orderBy: { version_number: "desc" },
      select: { version_number: true },
    })

    await prisma.documentVersion.create({
      data: {
        document_id: documentId,
        version_number: (lastVersion?.version_number ?? 0) + 1,
        file_url: url,
        change_summary: changeSummary,
        created_by: session.userId,
      },
    })

    revalidatePath(`/legal/documents/${documentId}`)
    return { success: true, data: { url } }
  } catch (error) {
    console.error("Failed to upload version file:", error)
    return { success: false, error: "Upload failed. Please try again." }
  }
}

export async function uploadPolicyFile(formData: FormData) {
  await requireSession()
  const file = formData.get("file") as File
  const policyId = formData.get("policyId") as string

  if (!file || !policyId)
    return { success: false, error: "File and policy ID required" }
  if (file.size > 25 * 1024 * 1024)
    return { success: false, error: "File too large (max 25MB)" }

  try {
    const key = getS3Key("lsc", "policies", file.name)
    const url = await uploadToS3(file, key)

    await prisma.policyDocument.update({
      where: { id: policyId },
      data: { file_url: url },
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

  try {
    const doc = await prisma.legalDocument.findUnique({
      where: { id: documentId },
      select: { file_url: true },
    })

    if (doc?.file_url) {
      // Extract S3 key from URL
      const url = new URL(doc.file_url)
      const key = url.pathname.slice(1) // Remove leading /
      try {
        await deleteFromS3(key)
      } catch {
        /* file may not exist in S3 */
      }

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
