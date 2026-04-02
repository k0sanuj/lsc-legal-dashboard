import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED } from "@/lib/format"
import { ENTITIES } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { SignatureKanban } from "@/components/legal/signature-kanban"
import type { LifecycleStatus } from "@/generated/prisma/client"

const DOCUMENT_COLUMNS = [
  { status: "DRAFT" as LifecycleStatus, title: "Draft", color: "slate" },
  { status: "IN_REVIEW" as LifecycleStatus, title: "In Review", color: "sky" },
  { status: "NEGOTIATION" as LifecycleStatus, title: "Finalized", color: "violet" },
  { status: "AWAITING_SIGNATURE" as LifecycleStatus, title: "Sent", color: "indigo" },
]

const SIGNATURE_COLUMNS = [
  { status: "PENDING" as const, title: "Getting Signed", color: "amber" },
  { status: "SENT" as const, title: "Being Signed", color: "blue" },
  { status: "SIGNED" as const, title: "Signed", color: "emerald" },
  { status: "STALLED" as const, title: "Stalled", color: "rose" },
]

function getEntityLabel(value: string): string {
  return ENTITIES.find((e) => e.value === value)?.label ?? value
}

function daysInStatus(date: Date): number {
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / 86400000)
}

export default async function SignaturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSession()

  const params = await searchParams
  const entityFilter = typeof params.entity === "string" ? params.entity : ""

  // Fetch documents in pre-signature pipeline stages
  const docWhere: Record<string, unknown> = {
    lifecycle_status: { in: ["DRAFT", "IN_REVIEW", "NEGOTIATION", "AWAITING_SIGNATURE"] },
  }
  if (entityFilter) docWhere.entity = entityFilter

  const pipelineDocs = await prisma.legalDocument.findMany({
    where: docWhere,
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      title: true,
      entity: true,
      category: true,
      lifecycle_status: true,
      counterparty: true,
      value: true,
      updated_at: true,
    },
  })

  // Fetch signature requests
  const sigWhere: Record<string, unknown> = {}
  if (entityFilter) {
    sigWhere.document = { entity: entityFilter }
  }

  const requests = await prisma.signatureRequest.findMany({
    where: sigWhere,
    include: {
      document: {
        select: {
          id: true,
          title: true,
          entity: true,
          category: true,
          value: true,
        },
      },
    },
    orderBy: { updated_at: "desc" },
  })

  // Build document pipeline columns
  const docColumns = DOCUMENT_COLUMNS.map((col) => ({
    id: `doc_${col.status}`,
    title: col.title,
    color: col.color,
    items: pipelineDocs
      .filter((d) => d.lifecycle_status === col.status)
      .map((d) => ({
        id: `doc_${d.id}`,
        documentTitle: d.title,
        signatoryName: d.counterparty ?? "—",
        daysInStatus: daysInStatus(d.updated_at),
        value: d.value ? formatAED(d.value.toString()) : null,
        documentId: d.id,
        entity: getEntityLabel(d.entity),
        category: d.category.replace(/_/g, " "),
      })),
  }))

  // Build signature columns
  const sigColumns = SIGNATURE_COLUMNS.map((col) => ({
    id: col.status,
    title: col.title,
    color: col.color,
    items: requests
      .filter((r) => r.status === col.status)
      .map((r) => ({
        id: r.id,
        documentTitle: r.document.title,
        signatoryName: r.signatory_name,
        daysInStatus: daysInStatus(r.sent_at ?? r.created_at),
        value: r.document.value ? formatAED(r.document.value.toString()) : null,
        documentId: r.document.id,
        entity: getEntityLabel(r.document.entity),
        category: r.document.category.replace(/_/g, " "),
      })),
  }))

  const allColumns = [...docColumns, ...sigColumns]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Signatures</h1>
        <p className="text-sm text-muted-foreground">
          Full agreement pipeline — from draft to signed. Drag cards to update status.
        </p>
      </div>

      {/* Entity filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-muted-foreground mr-2">Entity</span>
        <a
          href="/legal/signatures"
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            !entityFilter
              ? "border-primary bg-primary/15 text-primary"
              : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
          )}
        >
          All
        </a>
        {ENTITIES.map((ent) => (
          <a
            key={ent.value}
            href={`/legal/signatures?entity=${ent.value}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              entityFilter === ent.value
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {ent.label}
          </a>
        ))}
      </div>

      {/* Pipeline labels */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-slate-400" />
          <span>Manual Pipeline</span>
        </div>
        <div className="h-3 border-l border-border" />
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-amber-400" />
          <span>HelloSign (Auto)</span>
        </div>
      </div>

      <SignatureKanban columns={allColumns} />
    </div>
  )
}
