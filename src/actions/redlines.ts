"use server"

import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { getPresignedUrl, getS3KeyFromUrl } from "@/lib/s3"
import { buildAppUrl } from "@/lib/app-url"
import { extractTextFromFile } from "@/lib/extract-text"
import { emitLegalTrackerEvent } from "@/lib/legal-tracker"
import { buildRedlineSentMessage } from "@/lib/legal-tracker-payloads"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import {
  RedlineChangeStatus,
  RedlineChangeType,
  RedlineParty,
  RedlineStatus,
} from "@/generated/prisma/client"

// Storage ceiling for the two long text columns on Redline. This is also the
// extraction ceiling: extract-text.ts defaults to 12000 characters, which is
// right for feeding a model but would silently drop most clauses of a real
// agreement from the text a lawyer is marking up, so the redline path asks for
// the full document instead.
const MAX_STORED_TEXT_CHARS = 200000

// Ceilings for the short per-change fields, so one paste cannot persist a
// multi-megabyte row that every later page load then has to serialize.
const MAX_CHANGE_TEXT_CHARS = 20000
const MAX_SHORT_FIELD_CHARS = 500
const MAX_NOTES_CHARS = 4000

function clamp(value: string | null, max: number): string | null {
  if (value === null) return null
  return value.length > max ? value.slice(0, max) : value
}

// Statuses that close a redline out. Reaching any of them stamps resolved_at.
const RESOLVED_STATUSES = new Set<RedlineStatus>([
  "ACCEPTED",
  "REJECTED",
  "SUPERSEDED",
])

// Change statuses that count as decided, so they stamp the resolver.
const TERMINAL_CHANGE_STATUSES = new Set<RedlineChangeStatus>([
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
])

function isRedlineChangeType(value: string): value is RedlineChangeType {
  return value in RedlineChangeType
}

function isRedlineParty(value: string): value is RedlineParty {
  return value in RedlineParty
}

function isRedlineChangeStatus(value: string): value is RedlineChangeStatus {
  return value in RedlineChangeStatus
}

function revalidateRedline(redlineId: string, documentId?: string) {
  revalidatePath("/legal/redlines")
  revalidatePath(`/legal/redlines/${redlineId}`)
  if (documentId) {
    revalidatePath(`/legal/documents/${documentId}`)
  }
}

/**
 * Download a stored document file and extract its plain text. Mirrors the S3
 * fetch idiom in src/actions/opensign.ts and the Buffer -> File -> extract
 * recipe in the OpenSign webhook route.
 */
async function extractTextFromStoredFile(fileUrl: string): Promise<string> {
  const s3Key = getS3KeyFromUrl(fileUrl)
  const downloadUrl = s3Key ? await getPresignedUrl(s3Key) : fileUrl

  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) {
    throw new Error(`Could not read the stored document file: HTTP ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer
  // The S3 key keeps the original filename and extension, which is what
  // extractTextFromFile dispatches on when the content type is missing.
  const fileName = s3Key?.split("/").pop() ?? "document"
  const file = new File([arrayBuffer], fileName, {
    type: response.headers.get("content-type") ?? "",
  })

  return extractTextFromFile(file, MAX_STORED_TEXT_CHARS)
}

/** Absolute link for a tracker message, from the same origin the agreement notice uses. */
function buildRedlineUrl(redlineId: string): string {
  return buildAppUrl(`/legal/redlines/${redlineId}`)
}

export async function createRedlineFromDocument(formData: FormData) {
  const session = await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const documentId = String(formData.get("documentId") ?? "").trim()
  const versionId = String(formData.get("versionId") ?? "").trim()
  const title = String(formData.get("title") ?? "").trim()
  const counterparty = String(formData.get("counterparty") ?? "").trim()
  const assignedTo = String(formData.get("assignedTo") ?? "").trim()

  if (!documentId) {
    return { success: false, error: "Document ID is required." }
  }

  try {
    const document = await prisma.legalDocument.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, counterparty: true, file_url: true },
    })
    if (!document) {
      return { success: false, error: "Document not found." }
    }

    let sourceFileUrl = document.file_url
    if (versionId) {
      const version = await prisma.documentVersion.findUnique({
        where: { id: versionId },
        select: { id: true, document_id: true, file_url: true },
      })
      if (!version || version.document_id !== documentId) {
        return { success: false, error: "Version not found for this document." }
      }
      sourceFileUrl = version.file_url
    }

    if (!sourceFileUrl) {
      return {
        success: false,
        error: "This document has no stored file to redline. Upload a file first.",
      }
    }

    let baseText = ""
    try {
      baseText = (await extractTextFromStoredFile(sourceFileUrl)).trim()
    } catch (error) {
      console.error("Redline base text download failed:", error)
      return { success: false, error: "Could not read the document file from storage." }
    }

    if (!baseText) {
      return {
        success: false,
        error: "No text could be extracted from this file. Supported formats are PDF, DOCX, TXT, and MD.",
      }
    }

    const storedText = baseText.slice(0, MAX_STORED_TEXT_CHARS)

    const lastRound = await prisma.redline.findFirst({
      where: { document_id: documentId },
      orderBy: { round: "desc" },
      select: { round: true },
    })
    const round = (lastRound?.round ?? 0) + 1

    // Explicit id so the redline and its opening event can be written in one
    // $transaction array.
    const redlineId = crypto.randomUUID()

    await prisma.$transaction([
      prisma.redline.create({
        data: {
          id: redlineId,
          document_id: documentId,
          version_id: versionId || null,
          title: title || `${document.title} redline round ${round}`,
          round,
          counterparty: counterparty || document.counterparty,
          base_text: storedText,
          proposed_text: storedText,
          created_by: session.userId,
          assigned_to: assignedTo || null,
        },
      }),
      prisma.redlineEvent.create({
        data: {
          redline_id: redlineId,
          from_status: null,
          to_status: "DRAFT",
          actor: session.userId,
          notes: "Redline created",
        },
      }),
    ])

    revalidateRedline(redlineId, documentId)

    return { success: true, redlineId }
  } catch (error) {
    console.error("Failed to create redline:", error)
    return { success: false, error: "Failed to create redline." }
  }
}

export async function updateRedlineDraft(formData: FormData) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const redlineId = String(formData.get("redlineId") ?? "").trim()
  const proposedText = String(formData.get("proposedText") ?? "")
  const summary = String(formData.get("summary") ?? "").trim()
  const ourPosition = String(formData.get("ourPosition") ?? "").trim()

  if (!redlineId) {
    return { success: false, error: "Redline ID is required." }
  }
  if (!proposedText.trim()) {
    return { success: false, error: "Proposed text cannot be empty." }
  }

  try {
    const redline = await prisma.redline.findUnique({
      where: { id: redlineId },
      select: { id: true, document_id: true },
    })
    if (!redline) {
      return { success: false, error: "Redline not found." }
    }

    await prisma.redline.update({
      where: { id: redlineId },
      data: {
        proposed_text: proposedText.slice(0, MAX_STORED_TEXT_CHARS),
        summary: clamp(summary || null, MAX_CHANGE_TEXT_CHARS),
        our_position: clamp(ourPosition || null, MAX_CHANGE_TEXT_CHARS),
      },
    })

    revalidateRedline(redlineId, redline.document_id)

    return { success: true }
  } catch (error) {
    console.error("Failed to update redline draft:", error)
    return { success: false, error: "Failed to update redline draft." }
  }
}

export async function addRedlineChange(formData: FormData) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const redlineId = String(formData.get("redlineId") ?? "").trim()
  const changeType = String(formData.get("changeType") ?? "").trim()
  const clauseRef = String(formData.get("clauseRef") ?? "").trim()
  const originalText = String(formData.get("originalText") ?? "").trim()
  const proposedText = String(formData.get("proposedText") ?? "").trim()
  const rationale = String(formData.get("rationale") ?? "").trim()
  const riskLevel = String(formData.get("riskLevel") ?? "").trim()
  const raisedBy = String(formData.get("raisedBy") ?? "").trim() || "US"

  if (!redlineId) {
    return { success: false, error: "Redline ID is required." }
  }
  if (!isRedlineChangeType(changeType)) {
    return { success: false, error: "Unknown change type." }
  }
  if (!isRedlineParty(raisedBy)) {
    return { success: false, error: "Unknown raising party." }
  }

  try {
    const redline = await prisma.redline.findUnique({
      where: { id: redlineId },
      select: { id: true, document_id: true },
    })
    if (!redline) {
      return { success: false, error: "Redline not found." }
    }

    const lastChange = await prisma.redlineChange.findFirst({
      where: { redline_id: redlineId },
      orderBy: { position: "desc" },
      select: { position: true },
    })

    await prisma.redlineChange.create({
      data: {
        redline_id: redlineId,
        position: (lastChange?.position ?? 0) + 1,
        clause_ref: clamp(clauseRef || null, MAX_SHORT_FIELD_CHARS),
        change_type: changeType,
        original_text: clamp(originalText || null, MAX_CHANGE_TEXT_CHARS),
        proposed_text: clamp(proposedText || null, MAX_CHANGE_TEXT_CHARS),
        rationale: clamp(rationale || null, MAX_CHANGE_TEXT_CHARS),
        risk_level: clamp(riskLevel || null, MAX_SHORT_FIELD_CHARS),
        raised_by: raisedBy,
      },
    })

    revalidateRedline(redlineId, redline.document_id)

    return { success: true }
  } catch (error) {
    console.error("Failed to add redline change:", error)
    return { success: false, error: "Failed to add redline change." }
  }
}

export async function setRedlineChangeStatus(
  changeId: string,
  status: RedlineChangeStatus
) {
  const session = await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  try {
    if (!changeId) {
      return { success: false, error: "Change ID is required." }
    }
    if (!isRedlineChangeStatus(status)) {
      return { success: false, error: "Unknown change status." }
    }

    const change = await prisma.redlineChange.findUnique({
      where: { id: changeId },
      select: { id: true, redline_id: true, redline: { select: { document_id: true } } },
    })
    if (!change) {
      return { success: false, error: "Redline change not found." }
    }

    const isTerminal = TERMINAL_CHANGE_STATUSES.has(status)
    const isReopened = status === "OPEN"

    await prisma.redlineChange.update({
      where: { id: changeId },
      data: {
        status,
        // COUNTERED keeps whatever resolver stamp it already had.
        resolved_by: isTerminal ? session.userId : isReopened ? null : undefined,
        resolved_at: isTerminal ? new Date() : isReopened ? null : undefined,
      },
    })

    revalidateRedline(change.redline_id, change.redline.document_id)

    return { success: true }
  } catch (error) {
    console.error("Failed to set redline change status:", error)
    return { success: false, error: "Failed to update the redline change." }
  }
}

export async function deleteRedlineChange(changeId: string) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  try {
    if (!changeId) {
      return { success: false, error: "Change ID is required." }
    }

    const change = await prisma.redlineChange.findUnique({
      where: { id: changeId },
      select: { id: true, redline_id: true, redline: { select: { document_id: true } } },
    })
    if (!change) {
      return { success: false, error: "Redline change not found." }
    }

    await prisma.redlineChange.delete({ where: { id: changeId } })

    revalidateRedline(change.redline_id, change.redline.document_id)

    return { success: true }
  } catch (error) {
    console.error("Failed to delete redline change:", error)
    return { success: false, error: "Failed to delete the redline change." }
  }
}

export async function transitionRedline(
  redlineId: string,
  toStatus: RedlineStatus,
  notes?: string
) {
  const session = await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  try {
    if (!redlineId) {
      return { success: false, error: "Redline ID is required." }
    }
    if (!(toStatus in RedlineStatus)) {
      return { success: false, error: "Unknown redline status." }
    }

    const redline = await prisma.redline.findUnique({
      where: { id: redlineId },
      select: {
        id: true,
        document_id: true,
        status: true,
        title: true,
        round: true,
        counterparty: true,
        sent_at: true,
        responded_at: true,
        resolved_at: true,
        document: { select: { title: true } },
      },
    })
    if (!redline) {
      return { success: false, error: "Redline not found." }
    }
    if (redline.status === toStatus) {
      return { success: false, error: `Redline is already ${toStatus}.` }
    }

    const now = new Date()
    const data: {
      status: RedlineStatus
      sent_at?: Date
      responded_at?: Date
      resolved_at?: Date
    } = { status: toStatus }

    // Never clobber a timestamp that an earlier pass already stamped.
    if (toStatus === "SENT_TO_COUNTERPARTY" && !redline.sent_at) {
      data.sent_at = now
    }
    if (toStatus === "COUNTERPARTY_RESPONDED" && !redline.responded_at) {
      data.responded_at = now
    }
    if (RESOLVED_STATUSES.has(toStatus) && !redline.resolved_at) {
      data.resolved_at = now
    }

    await prisma.$transaction([
      prisma.redline.update({ where: { id: redlineId }, data }),
      prisma.redlineEvent.create({
        data: {
          redline_id: redlineId,
          from_status: redline.status,
          to_status: toStatus,
          actor: session.userId,
          notes: clamp(notes || null, MAX_NOTES_CHARS),
        },
      }),
    ])

    revalidateRedline(redlineId, redline.document_id)

    // Aditya watches the legal tracker channel for anything that leaves the
    // building, so ping it once the send is committed.
    if (toStatus === "SENT_TO_COUNTERPARTY") {
      after(async () => {
        try {
          const message = buildRedlineSentMessage({
            documentTitle: redline.document.title,
            redlineTitle: redline.title,
            round: redline.round,
            counterparty: redline.counterparty,
            sentBy: session.email,
            url: buildRedlineUrl(redlineId),
          })
          // The notifier reports delivery failure by return value, not by
          // throwing, so an unchecked result would be a silent miss.
          const notified = await emitLegalTrackerEvent(
            "redline.sent",
            { ...message, mention: true },
            { entityType: "Redline", entityId: redlineId }
          )
          if (!notified.ok) {
            console.error(
              `Legal tracker notification not delivered for redline ${redlineId} (non-blocking):`,
              notified.error
            )
          }
        } catch (err) {
          console.error("Legal tracker notification failed (non-blocking):", err)
        }
      })
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to transition redline:", error)
    return { success: false, error: "Failed to transition redline." }
  }
}

export async function deleteRedline(redlineId: string) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  try {
    if (!redlineId) {
      return { success: false, error: "Redline ID is required." }
    }

    const redline = await prisma.redline.findUnique({
      where: { id: redlineId },
      select: { id: true, document_id: true },
    })
    if (!redline) {
      return { success: false, error: "Redline not found." }
    }

    // Changes and events cascade from the Redline row.
    await prisma.redline.delete({ where: { id: redlineId } })

    revalidateRedline(redlineId, redline.document_id)

    return { success: true }
  } catch (error) {
    console.error("Failed to delete redline:", error)
    return { success: false, error: "Failed to delete redline." }
  }
}
