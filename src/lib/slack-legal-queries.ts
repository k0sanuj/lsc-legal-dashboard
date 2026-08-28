/**
 * Read-only Prisma queries behind the /legal slash command.
 *
 * Every function here is a pure read that returns plain data; Block Kit
 * rendering lives in src/lib/slack-blocks.ts so the shapes below are the whole
 * contract between the two. Derived figures (counts, days pending) are
 * computed here on the server, never in a renderer.
 */
import { prisma } from "./prisma"

const MS_PER_DAY = 86_400_000
const LOOKUP_LIMIT = 5
const RECENT_SENDS_LIMIT = 5
const COMPLIANCE_WINDOW_DAYS = 30

export interface StatusCount {
  status: string
  count: number
}

export interface RecentSend {
  id: string
  title: string
  counterparty: string | null
  sentAt: Date
  linkPath: string
}

export interface LegalStatusSummary {
  documentsByStatus: StatusCount[]
  openSignaturesByStatus: StatusCount[]
  openRedlinesByStatus: StatusCount[]
  complianceDueSoon: number
  trackerBlocked: number
  trackerInProgress: number
  recentSends: RecentSend[]
}

export interface AgreementHit {
  id: string
  title: string
  counterparty: string | null
  status: string
  signers: { name: string; status: string }[]
  linkPath: string
}

export interface SignatureInFlight {
  documentId: string
  title: string
  counterparty: string | null
  daysPending: number | null
  signers: { name: string; viewed: boolean; signed: boolean }[]
  linkPath: string
}

function documentLinkPath(documentId: string): string {
  return `/legal/documents/${documentId}`
}

/** One snapshot of the whole legal operation, for "/legal status". */
export async function legalStatusSummary(): Promise<LegalStatusSummary> {
  const complianceWindowEnd = new Date(Date.now() + COMPLIANCE_WINDOW_DAYS * MS_PER_DAY)

  const [documents, signatures, redlines, complianceDueSoon, trackerBlocked, trackerInProgress, recent] =
    await Promise.all([
      prisma.legalDocument.groupBy({ by: ["lifecycle_status"], _count: { _all: true } }),
      prisma.signatureRequest.groupBy({
        by: ["status"],
        where: { status: { in: ["PENDING", "SENT", "STALLED"] } },
        _count: { _all: true },
      }),
      prisma.redline.groupBy({
        by: ["status"],
        where: { status: { in: ["DRAFT", "INTERNAL_REVIEW", "SENT_TO_COUNTERPARTY", "COUNTERPARTY_RESPONDED"] } },
        _count: { _all: true },
      }),
      prisma.complianceDeadline.count({
        where: {
          status: { not: "COMPLETED" },
          deadline_date: { lte: complianceWindowEnd },
        },
      }),
      prisma.trackerItem.count({ where: { status: "BLOCKED" } }),
      prisma.trackerItem.count({ where: { status: "IN_PROGRESS" } }),
      prisma.legalDocument.findMany({
        where: { signature_sent_at: { not: null } },
        orderBy: { signature_sent_at: "desc" },
        take: RECENT_SENDS_LIMIT,
        select: { id: true, title: true, counterparty: true, signature_sent_at: true },
      }),
    ])

  return {
    documentsByStatus: documents
      .map((row) => ({ status: row.lifecycle_status, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    openSignaturesByStatus: signatures.map((row) => ({ status: row.status, count: row._count._all })),
    openRedlinesByStatus: redlines.map((row) => ({ status: row.status, count: row._count._all })),
    complianceDueSoon,
    trackerBlocked,
    trackerInProgress,
    recentSends: recent
      .filter((doc) => doc.signature_sent_at !== null)
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        counterparty: doc.counterparty,
        sentAt: doc.signature_sent_at as Date,
        linkPath: documentLinkPath(doc.id),
      })),
  }
}

/** Top matches on title or counterparty, for "/legal find <query>". */
export async function agreementLookup(query: string): Promise<AgreementHit[]> {
  const needle = query.trim()
  if (!needle) return []

  const documents = await prisma.legalDocument.findMany({
    where: {
      OR: [
        { title: { contains: needle, mode: "insensitive" } },
        { counterparty: { contains: needle, mode: "insensitive" } },
      ],
    },
    orderBy: { updated_at: "desc" },
    take: LOOKUP_LIMIT,
    select: {
      id: true,
      title: true,
      counterparty: true,
      lifecycle_status: true,
      signature_requests: { select: { signatory_name: true, status: true } },
    },
  })

  return documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    counterparty: doc.counterparty,
    status: doc.lifecycle_status,
    signers: doc.signature_requests.map((req) => ({ name: req.signatory_name, status: req.status })),
    linkPath: documentLinkPath(doc.id),
  }))
}

/** Awaiting-signature documents with per-signer state, for "/legal signatures". */
export async function signaturesInFlight(): Promise<SignatureInFlight[]> {
  const documents = await prisma.legalDocument.findMany({
    where: { lifecycle_status: "AWAITING_SIGNATURE" },
    orderBy: { signature_sent_at: "asc" },
    select: {
      id: true,
      title: true,
      counterparty: true,
      signature_sent_at: true,
      signature_requests: {
        select: { signatory_name: true, sent_at: true, viewed_at: true, signed_at: true },
      },
    },
  })

  const now = Date.now()

  return documents.map((doc) => {
    const sentAt =
      doc.signature_sent_at ??
      doc.signature_requests
        .map((req) => req.sent_at)
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0] ??
      null

    return {
      documentId: doc.id,
      title: doc.title,
      counterparty: doc.counterparty,
      daysPending: sentAt ? Math.max(0, Math.floor((now - sentAt.getTime()) / MS_PER_DAY)) : null,
      signers: doc.signature_requests.map((req) => ({
        name: req.signatory_name,
        viewed: req.viewed_at !== null,
        signed: req.signed_at !== null,
      })),
      linkPath: documentLinkPath(doc.id),
    }
  })
}
