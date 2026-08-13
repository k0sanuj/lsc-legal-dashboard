import Link from "next/link"
import { FileDiff, GitCompare, ListChecks, CheckCircle2 } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { ENTITIES } from "@/lib/constants"
import { formatRelativeDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Entity, Prisma, RedlineStatus } from "@/generated/prisma/client"

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

const STATUS_FILTERS: RedlineStatus[] = [
  "DRAFT",
  "INTERNAL_REVIEW",
  "SENT_TO_COUNTERPARTY",
  "COUNTERPARTY_RESPONDED",
  "ACCEPTED",
  "REJECTED",
  "SUPERSEDED",
]

const OPEN_STATUSES: RedlineStatus[] = [
  "DRAFT",
  "INTERNAL_REVIEW",
  "SENT_TO_COUNTERPARTY",
  "COUNTERPARTY_RESPONDED",
]

const IN_FLIGHT_STATUSES: RedlineStatus[] = [
  "SENT_TO_COUNTERPARTY",
  "COUNTERPARTY_RESPONDED",
]

const PILL_CLASS = "rounded-full border px-3 py-1 text-xs font-medium transition-colors"
const PILL_ACTIVE = "border-primary bg-primary/15 text-primary"
const PILL_IDLE =
  "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"

function buildRedlinesHref(status: string, entity: string): string {
  const query = new URLSearchParams()
  if (status) query.set("status", status)
  if (entity) query.set("entity", entity)
  const search = query.toString()
  return search ? `/legal/redlines?${search}` : "/legal/redlines"
}

function getEntityLabel(value: string): string {
  return ENTITIES.find((entity) => entity.value === value)?.label ?? value
}

export default async function RedlinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const params = await searchParams
  const rawStatus = typeof params.status === "string" ? params.status : ""
  const rawEntity = typeof params.entity === "string" ? params.entity : ""
  const statusFilter = STATUS_FILTERS.includes(rawStatus as RedlineStatus) ? rawStatus : ""
  const entityFilter = ENTITIES.some((entity) => entity.value === rawEntity) ? rawEntity : ""

  // Stat tiles describe the whole entity pipeline; only the table narrows by status.
  const entityWhere: Prisma.RedlineWhereInput = entityFilter
    ? { document: { entity: entityFilter as Entity } }
    : {}

  const tableWhere: Prisma.RedlineWhereInput = { ...entityWhere }
  if (statusFilter) tableWhere.status = statusFilter as RedlineStatus

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

  const [redlines, openRedlineCount, inFlightCount, openChangeCount, resolvedCount] =
    await Promise.all([
      prisma.redline.findMany({
        where: tableWhere,
        orderBy: { updated_at: "desc" },
        take: 100,
        include: {
          document: { select: { id: true, title: true, entity: true, category: true } },
          _count: { select: { changes: true } },
        },
      }),
      prisma.redline.count({ where: { ...entityWhere, status: { in: OPEN_STATUSES } } }),
      prisma.redline.count({ where: { ...entityWhere, status: { in: IN_FLIGHT_STATUSES } } }),
      prisma.redlineChange.count({
        where: {
          status: "OPEN",
          redline: entityFilter
            ? { document: { entity: entityFilter as Entity } }
            : undefined,
        },
      }),
      prisma.redline.count({
        where: { ...entityWhere, resolved_at: { gte: thirtyDaysAgo } },
      }),
    ])

  const openChangeGroups =
    redlines.length > 0
      ? await prisma.redlineChange.groupBy({
          by: ["redline_id"],
          where: { redline_id: { in: redlines.map((redline) => redline.id) }, status: "OPEN" },
          _count: { _all: true },
        })
      : []

  const openChangesByRedline = new Map(
    openChangeGroups.map((group) => [group.redline_id, group._count._all])
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Redlines</h1>
        <p className="text-sm text-muted-foreground">
          Negotiation rounds, clause-level change items, and counterparty responses.
        </p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/50 bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Open redlines</p>
            <FileDiff className="size-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">{openRedlineCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Not yet accepted, rejected, or superseded.
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Rounds in flight</p>
            <GitCompare className="size-4 text-violet-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-violet-400">
            {inFlightCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sitting with a counterparty right now.
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Open change items</p>
            <ListChecks className="size-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-400">
            {openChangeCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Clause positions still unresolved.
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Resolved in 30 days</p>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-400">
            {resolvedCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Rounds closed out in the last month.
          </p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-2 text-sm font-medium text-muted-foreground">Status</span>
        <Link
          href={buildRedlinesHref("", entityFilter)}
          className={cn(PILL_CLASS, !statusFilter ? PILL_ACTIVE : PILL_IDLE)}
        >
          All
        </Link>
        {STATUS_FILTERS.map((status) => (
          <Link
            key={status}
            href={buildRedlinesHref(status, entityFilter)}
            className={cn(PILL_CLASS, statusFilter === status ? PILL_ACTIVE : PILL_IDLE)}
          >
            {REDLINE_STATUS_LABELS[status]}
          </Link>
        ))}
      </div>

      {/* Entity filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-2 text-sm font-medium text-muted-foreground">Entity</span>
        <Link
          href={buildRedlinesHref(statusFilter, "")}
          className={cn(PILL_CLASS, !entityFilter ? PILL_ACTIVE : PILL_IDLE)}
        >
          All
        </Link>
        {ENTITIES.map((entity) => (
          <Link
            key={entity.value}
            href={buildRedlinesHref(statusFilter, entity.value)}
            className={cn(PILL_CLASS, entityFilter === entity.value ? PILL_ACTIVE : PILL_IDLE)}
          >
            {entity.label}
          </Link>
        ))}
      </div>

      {redlines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
          <FileDiff className="size-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            No redlines match this view. Start one from a document detail page.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Changes</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {redlines.map((redline) => {
                const openChanges = openChangesByRedline.get(redline.id) ?? 0

                return (
                  <TableRow key={redline.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Link
                        href={`/legal/redlines/${redline.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {redline.document.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {getEntityLabel(redline.document.entity)} ·{" "}
                        {redline.document.category.replace(/_/g, " ")}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">{redline.round}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={REDLINE_STATUS_COLORS[redline.status]}
                      >
                        {REDLINE_STATUS_LABELS[redline.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {redline.counterparty ?? "--"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          openChanges > 0 ? "text-amber-400" : "text-emerald-400"
                        )}
                      >
                        {openChanges}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / <span className="font-mono tabular-nums">{redline._count.changes}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {redline.assigned_to ?? "--"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelativeDate(redline.updated_at)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
