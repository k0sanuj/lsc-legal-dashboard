import { config } from "dotenv"
import { google } from "googleapis"
import type { drive_v3 } from "googleapis"
import type { LifecycleStatus } from "../src/generated/prisma/client"

config({ path: ".env" })
config({ path: ".env.local", override: true })

type Args = {
  apply: boolean
  limit: number
  offset: number
}

type DriveBackedDocument = {
  id: string
  title: string
  notes: string | null
  lifecycle_status: LifecycleStatus
}

type SyncSummary = {
  apply: boolean
  scanned: number
  filesChecked: number
  commentsFound: number
  commentsCreated: number
  commentsUpdated: number
  unresolvedDocuments: number
  statusesUpdated: number
  skipped: number
  errors: number
}

const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
const GOOGLE_API_TIMEOUT_MS = 30_000
const FINAL_STATUSES = new Set<LifecycleStatus>([
  "SIGNED",
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "TERMINATED",
])

function parseArgs(): Args {
  const args = process.argv.slice(2)
  return {
    apply: args.includes("--apply"),
    limit: Number(args.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 10_000),
    offset: Number(args.find((arg) => arg.startsWith("--offset="))?.split("=")[1] ?? 0),
  }
}

function extractDriveFileId(notes: string | null): string | null {
  return notes?.match(/source:drive:([^\s]+)/)?.[1] ?? null
}

function googleCommentMarker(fileId: string, commentId: string): string {
  return `googleDriveComment:${fileId}:${commentId}`
}

function actorName(user: drive_v3.Schema$User | undefined): string {
  const displayName = user?.displayName?.trim()
  const emailAddress = user?.emailAddress?.trim()
  if (displayName && emailAddress) return `${displayName} <${emailAddress}>`
  return displayName || emailAddress || "Unknown Google user"
}

function plain(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function formatReply(reply: drive_v3.Schema$Reply): string {
  const deleted = reply.deleted ? "deleted" : "active"
  const created = reply.createdTime ? `, created ${reply.createdTime}` : ""
  return [
    `- Reply by ${actorName(reply.author)} (${deleted}${created})`,
    plain(reply.content) || "[No reply text returned]",
  ].join("\n  ")
}

function formatCommentContent(
  document: DriveBackedDocument,
  file: drive_v3.Schema$File,
  fileId: string,
  comment: drive_v3.Schema$Comment
): string {
  const marker = googleCommentMarker(fileId, comment.id ?? "unknown")
  const status = comment.resolved ? "resolved" : "open"
  const replies = (comment.replies ?? []).filter((reply) => !reply.deleted)
  const body = plain(comment.content) || "[No comment text returned]"
  const quoted = plain(comment.quotedFileContent?.value)
  return [
    `Google Drive comment (${status})`,
    `Document: ${document.title}`,
    `Drive file: ${file.name ?? fileId}`,
    file.webViewLink ? `Drive link: ${file.webViewLink}` : null,
    `Google author: ${actorName(comment.author)}`,
    comment.createdTime ? `Google created: ${comment.createdTime}` : null,
    comment.modifiedTime ? `Google modified: ${comment.modifiedTime}` : null,
    `Marker: ${marker}`,
    quoted ? `Quoted text: ${quoted}` : null,
    "",
    body,
    replies.length > 0 ? ["", "Replies:", ...replies.map(formatReply)].join("\n") : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
}

async function listComments(drive: drive_v3.Drive, fileId: string): Promise<drive_v3.Schema$Comment[]> {
  const comments: drive_v3.Schema$Comment[] = []
  let pageToken: string | undefined
  do {
    const response = await drive.comments.list(
      {
        fileId,
        includeDeleted: false,
        pageSize: 100,
        pageToken,
        fields:
          "comments(id,content,htmlContent,author(displayName,emailAddress),createdTime,modifiedTime,resolved,deleted,quotedFileContent(value),replies(id,content,htmlContent,author(displayName,emailAddress),createdTime,modifiedTime,deleted)),nextPageToken",
      },
      { timeout: GOOGLE_API_TIMEOUT_MS }
    )
    comments.push(...(response.data.comments ?? []))
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)
  return comments.filter((comment) => comment.id && !comment.deleted)
}

async function main() {
  const args = parseArgs()
  const { prisma } = await import("../src/lib/prisma")
  const auth = new google.auth.GoogleAuth({ scopes: [DRIVE_READONLY_SCOPE] })
  const drive = google.drive({ version: "v3", auth })

  const operator = await prisma.appUser.findFirst({
    where: { role: { in: ["PLATFORM_ADMIN", "LEGAL_ADMIN", "FINANCE_ADMIN"] } },
    orderBy: { created_at: "asc" },
    select: { id: true, email: true },
  })
  if (!operator) throw new Error("No admin user found for Google Drive comment sync attribution")

  const documents = await prisma.legalDocument.findMany({
    where: { notes: { contains: "source:drive:" } },
    orderBy: { updated_at: "desc" },
    skip: args.offset,
    take: args.limit,
    select: {
      id: true,
      title: true,
      notes: true,
      lifecycle_status: true,
    },
  })

  const summary: SyncSummary = {
    apply: args.apply,
    scanned: documents.length,
    filesChecked: 0,
    commentsFound: 0,
    commentsCreated: 0,
    commentsUpdated: 0,
    unresolvedDocuments: 0,
    statusesUpdated: 0,
    skipped: 0,
    errors: 0,
  }

  for (const document of documents) {
    const fileId = extractDriveFileId(document.notes)
    if (!fileId) {
      summary.skipped += 1
      continue
    }

    try {
      const fileResponse = await drive.files.get(
        {
          fileId,
          supportsAllDrives: true,
          fields: "id,name,mimeType,modifiedTime,webViewLink,trashed",
        },
        { timeout: GOOGLE_API_TIMEOUT_MS }
      )
      const file = fileResponse.data
      if (file.trashed) {
        summary.skipped += 1
        console.log(JSON.stringify({ documentId: document.id, title: document.title, driveFileId: fileId, action: "skip", reason: "drive file is trashed" }))
        continue
      }

      summary.filesChecked += 1
      const comments = await listComments(drive, fileId)
      const unresolved = comments.filter((comment) => !comment.resolved)
      summary.commentsFound += comments.length
      if (unresolved.length > 0) summary.unresolvedDocuments += 1

      const commentActions: string[] = []
      for (const comment of comments) {
        if (!comment.id) continue
        const marker = googleCommentMarker(fileId, comment.id)
        const content = formatCommentContent(document, file, fileId, comment)
        const existing = await prisma.documentComment.findFirst({
          where: { document_id: document.id, content: { contains: marker } },
          select: { id: true, content: true, resolved: true },
        })

        if (existing) {
          if (existing.content !== content || existing.resolved !== Boolean(comment.resolved)) {
            summary.commentsUpdated += 1
            commentActions.push(`update:${comment.id}`)
            if (args.apply) {
              await prisma.documentComment.update({
                where: { id: existing.id },
                data: {
                  content,
                  resolved: Boolean(comment.resolved),
                },
              })
            }
          }
        } else {
          summary.commentsCreated += 1
          commentActions.push(`create:${comment.id}`)
          if (args.apply) {
            await prisma.documentComment.create({
              data: {
                document_id: document.id,
                content,
                resolved: Boolean(comment.resolved),
                author_id: operator.id,
                created_at: comment.createdTime ? new Date(comment.createdTime) : undefined,
              },
            })
          }
        }
      }

      const shouldMarkInReview =
        unresolved.length > 0 &&
        document.lifecycle_status === "DRAFT" &&
        !FINAL_STATUSES.has(document.lifecycle_status)

      if (shouldMarkInReview) {
        summary.statusesUpdated += 1
        if (args.apply) {
          await prisma.$transaction([
            prisma.legalDocument.update({
              where: { id: document.id },
              data: {
                lifecycle_status: "IN_REVIEW",
                contract_status: "draft",
              },
            }),
            prisma.lifecycleEvent.create({
              data: {
                document_id: document.id,
                from_status: document.lifecycle_status,
                to_status: "IN_REVIEW",
                transitioned_by: operator.id,
                notes: `Google Drive comment sync found ${unresolved.length} unresolved comment(s).`,
              },
            }),
          ])
        }
      }

      console.log(JSON.stringify({
        documentId: document.id,
        title: document.title,
        driveFileId: fileId,
        comments: comments.length,
        unresolved: unresolved.length,
        status: shouldMarkInReview ? `${document.lifecycle_status}->IN_REVIEW` : document.lifecycle_status,
        actions: commentActions,
      }))
    } catch (error) {
      summary.errors += 1
      console.error(JSON.stringify({
        documentId: document.id,
        title: document.title,
        driveFileId: fileId,
        action: "error",
        reason: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  if (args.apply) {
    await prisma.agentActivityLog.create({
      data: {
        agent_id: "google-drive-comment-sync",
        agent_name: "Google Drive Comment Sync",
        action: "completed",
        details: summary,
      },
    })
  }

  console.log(JSON.stringify(summary, null, 2))
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
