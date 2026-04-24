"use server"

import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { VALID_TRANSITIONS } from "@/lib/constants"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { runAgent } from "@/lib/agents/orchestrator"
import type { AgentId } from "@/lib/agents/types"
import type { LifecycleStatus } from "@/generated/prisma/client"

// Maps a lifecycle transition to the agent that fires once the DB update
// succeeds. Only the three high-value transitions trigger an AI agent —
// other transitions pay no token cost.
const TRANSITION_AGENT: Partial<Record<string, AgentId>> = {
  "DRAFT->IN_REVIEW": "agreement-analyzer",
  "NEGOTIATION->AWAITING_SIGNATURE": "pre-signature-checklist",
  "SIGNED->ACTIVE": "activation",
}

export async function createDocument(formData: FormData) {
  const session = await requireRole([
    "PLATFORM_ADMIN",
    "LEGAL_ADMIN",
    "OPS_ADMIN",
  ])

  const title = formData.get("title") as string
  const category = formData.get("category") as string
  const entity = formData.get("entity") as string
  const valueStr = formData.get("value") as string | null
  const expiryStr = formData.get("expiry_date") as string | null
  const notes = formData.get("notes") as string | null
  const parentDocId = formData.get("parent_doc_id") as string | null

  if (!title || !category || !entity) {
    return { success: false, error: "Title, category, and entity are required." }
  }

  try {
    const document = await prisma.legalDocument.create({
      data: {
        title,
        category: category as never,
        entity: entity as never,
        owner_id: session.userId,
        value: valueStr ? parseFloat(valueStr) : null,
        expiry_date: expiryStr ? new Date(expiryStr) : null,
        notes: notes || null,
        parent_doc_id: parentDocId || null,
        lifecycle_status: "DRAFT",
      },
    })

    // Create initial version
    await prisma.documentVersion.create({
      data: {
        document_id: document.id,
        version_number: 1,
        change_summary: "Initial draft created",
        created_by: session.userId,
      },
    })

    // Create lifecycle event for the initial draft
    await prisma.lifecycleEvent.create({
      data: {
        document_id: document.id,
        from_status: "DRAFT",
        to_status: "DRAFT",
        transitioned_by: session.userId,
        notes: "Document created",
      },
    })

    revalidatePath("/legal")
    revalidatePath("/legal/documents")

    return { success: true, documentId: document.id }
  } catch (error) {
    console.error("Failed to create document:", error)
    return { success: false, error: "Failed to create document." }
  }
}

export async function transitionDocument(
  documentId: string,
  toStatus: LifecycleStatus,
  notes?: string
) {
  const session = await requireRole([
    "PLATFORM_ADMIN",
    "LEGAL_ADMIN",
    "OPS_ADMIN",
  ])

  try {
    const document = await prisma.legalDocument.findUnique({
      where: { id: documentId },
      select: { id: true, lifecycle_status: true },
    })

    if (!document) {
      return { success: false, error: "Document not found." }
    }

    const currentStatus = document.lifecycle_status
    const allowedTransitions = VALID_TRANSITIONS[currentStatus]

    if (!allowedTransitions.includes(toStatus)) {
      return {
        success: false,
        error: `Invalid transition from ${currentStatus} to ${toStatus}. Allowed: ${allowedTransitions.join(", ") || "none"}.`,
      }
    }

    await prisma.$transaction([
      prisma.legalDocument.update({
        where: { id: documentId },
        data: { lifecycle_status: toStatus },
      }),
      prisma.lifecycleEvent.create({
        data: {
          document_id: documentId,
          from_status: currentStatus,
          to_status: toStatus,
          transitioned_by: session.userId,
          notes: notes || null,
        },
      }),
    ])

    revalidatePath("/legal")
    revalidatePath("/legal/documents")
    revalidatePath(`/legal/documents/${documentId}`)

    // Fire the transition-specific agent in the background so the user's
    // request returns immediately. The agent's run()/log() writes will land
    // before the serverless function terminates.
    const agentId = TRANSITION_AGENT[`${currentStatus}->${toStatus}`]
    if (agentId) {
      const docContent = await prisma.legalDocument.findUnique({
        where: { id: documentId },
        select: { notes: true },
      })
      const input =
        agentId === "agreement-analyzer"
          ? { documentId, content: docContent?.notes ?? "" }
          : { documentId }
      after(async () => {
        try {
          await runAgent(agentId, input)
        } catch (err) {
          console.error(`Lifecycle agent ${agentId} failed for ${documentId}:`, err)
        }
      })
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to transition document:", error)
    return { success: false, error: "Failed to transition document." }
  }
}
