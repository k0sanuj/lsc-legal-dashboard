import Link from "next/link"
import { ArrowRight, FileDiff } from "lucide-react"
import { formatRelativeDate } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { CreateRedlineDialog } from "@/components/legal/create-redline-dialog"
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

export interface DocumentRedlineRow {
  id: string
  title: string
  round: number
  status: RedlineStatus
  counterparty: string | null
  updated_at: Date
  openChangeCount: number
  totalChangeCount: number
}

export function DocumentRedlinesPanel({
  documentId,
  documentTitle,
  counterparty,
  versions,
  hasFile,
  redlines,
}: {
  documentId: string
  documentTitle: string
  counterparty?: string | null
  versions: Array<{ id: string; version_number: number; created_at: Date }>
  hasFile: boolean
  redlines: DocumentRedlineRow[]
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileDiff className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Redline rounds</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Each round captures the counterparty text, our markup, and the open change items.
          </p>
        </div>
        <CreateRedlineDialog
          documentId={documentId}
          documentTitle={documentTitle}
          counterparty={counterparty}
          versions={versions}
          hasFile={hasFile}
        />
      </div>

      {redlines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-12">
          <FileDiff className="size-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No redline rounds yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {redlines.map((redline) => (
            <Link
              key={redline.id}
              href={`/legal/redlines/${redline.id}`}
              className="flex flex-col gap-3 rounded-lg border border-border/50 bg-muted/20 p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono tabular-nums">
                    Round {redline.round}
                  </Badge>
                  <Badge variant="outline" className={REDLINE_STATUS_COLORS[redline.status]}>
                    {REDLINE_STATUS_LABELS[redline.status]}
                  </Badge>
                  {redline.counterparty ? (
                    <span className="text-xs text-muted-foreground">
                      {redline.counterparty}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-sm font-medium">{redline.title}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-medium">
                    <span className="font-mono tabular-nums">{redline.openChangeCount}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      of{" "}
                      <span className="font-mono tabular-nums">
                        {redline.totalChangeCount}
                      </span>{" "}
                      open
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Updated {formatRelativeDate(redline.updated_at)}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
