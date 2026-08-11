import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, History } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { ENTITIES } from "@/lib/constants"
import { formatDate, formatRelativeDate } from "@/lib/format"
import { buildRedlineDiffResult } from "@/lib/redline-diff"
import { Badge } from "@/components/ui/badge"
import { RedlineChangeList } from "@/components/legal/redline-change-list"
import { RedlineDiffView } from "@/components/legal/redline-diff-view"
import { RedlineEditor } from "@/components/legal/redline-editor"
import { RedlineStatusControl } from "@/components/legal/redline-status-control"
import type { RedlineStatus } from "@/generated/prisma/client"

// Local to the redline feature, mirroring LIFECYCLE_STATUS_COLORS in src/lib/constants.ts.
const REDLINE_STATUS_COLORS: Record<RedlineStatus, string> = {
  DRAFT: "bg-slate-400/10 text-slate-400 border-slate-400/20",
  INTERNAL_REVIEW: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  SENT_TO_COUNTERPARTY: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  COUNTERPARTY_RESPONDED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  ACCEPTED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  REJECTED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  SUPERSEDED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
}

const REDLINE_STATUS_LABELS: Record<RedlineStatus, string> = {
  DRAFT: "Draft",
  INTERNAL_REVIEW: "Internal review",
  SENT_TO_COUNTERPARTY: "Sent to counterparty",
  COUNTERPARTY_RESPONDED: "Counterparty responded",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
}

export default async function RedlineEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const { id } = await params

  const redline = await prisma.redline.findUnique({
    where: { id },
    include: {
      document: {
        select: { id: true, title: true, entity: true, category: true },
      },
      version: { select: { version_number: true } },
      changes: { orderBy: { position: "asc" } },
      events: { orderBy: { created_at: "desc" } },
    },
  })

  if (!redline) {
    notFound()
  }

  const entityLabel =
    ENTITIES.find((entity) => entity.value === redline.document.entity)?.label ??
    redline.document.entity

  // The diff is computed on the server so the diff library never ships to the client.
  const diff = buildRedlineDiffResult(redline.base_text, redline.proposed_text)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">{redline.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono tabular-nums">
              Round {redline.round}
            </Badge>
            <Badge variant="outline" className={REDLINE_STATUS_COLORS[redline.status]}>
              {REDLINE_STATUS_LABELS[redline.status]}
            </Badge>
            <Badge variant="outline">{entityLabel}</Badge>
            <Badge variant="outline">{redline.document.category.replace(/_/g, " ")}</Badge>
            {redline.version ? (
              <Badge variant="outline" className="font-mono tabular-nums">
                v{redline.version.version_number}
              </Badge>
            ) : (
              <Badge variant="outline">Current file</Badge>
            )}
            {redline.counterparty ? (
              <Badge variant="outline">{redline.counterparty}</Badge>
            ) : null}
          </div>
          <Link
            href={`/legal/documents/${redline.document.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" />
            Back to {redline.document.title}
          </Link>
        </div>
        <div className="w-full lg:w-[360px] lg:shrink-0">
          <RedlineStatusControl redlineId={redline.id} status={redline.status} />
        </div>
      </div>

      {/* Body */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <RedlineEditor
            redlineId={redline.id}
            proposedText={redline.proposed_text}
            summary={redline.summary}
            ourPosition={redline.our_position}
          />
          <RedlineDiffView segments={diff.segments} status={diff.status} />
        </div>

        <div className="space-y-4">
          <RedlineChangeList redlineId={redline.id} changes={redline.changes} />

          <div className="space-y-4 rounded-xl border border-border/50 bg-card p-6">
            <div className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Round history</h3>
            </div>

            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Created by</dt>
                <dd className="mt-1 text-sm font-medium">{redline.created_by}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Assigned to</dt>
                <dd className="mt-1 text-sm font-medium">{redline.assigned_to ?? "--"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sent</dt>
                <dd className="mt-1 text-sm font-medium">
                  {redline.sent_at ? formatDate(redline.sent_at) : "--"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Responded</dt>
                <dd className="mt-1 text-sm font-medium">
                  {redline.responded_at ? formatDate(redline.responded_at) : "--"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Resolved</dt>
                <dd className="mt-1 text-sm font-medium">
                  {redline.resolved_at ? formatDate(redline.resolved_at) : "--"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Our position</dt>
                <dd className="mt-1 text-sm font-medium">{redline.our_position ?? "--"}</dd>
              </div>
            </dl>

            {redline.events.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                No status changes recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {redline.events.map((event) => (
                  <div
                    key={event.id}
                    className="space-y-1 rounded-lg border border-border/50 bg-muted/20 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {event.from_status ? (
                        <>
                          <Badge
                            variant="outline"
                            className={REDLINE_STATUS_COLORS[event.from_status]}
                          >
                            {REDLINE_STATUS_LABELS[event.from_status]}
                          </Badge>
                          <ArrowRight className="size-3.5 text-muted-foreground" />
                        </>
                      ) : null}
                      <Badge
                        variant="outline"
                        className={REDLINE_STATUS_COLORS[event.to_status]}
                      >
                        {REDLINE_STATUS_LABELS[event.to_status]}
                      </Badge>
                    </div>
                    {event.notes ? (
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                        {event.notes}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {event.actor} · {formatRelativeDate(event.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
