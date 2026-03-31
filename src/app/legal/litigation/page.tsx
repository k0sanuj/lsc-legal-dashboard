import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { ENTITIES, formatAED, formatDate } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Scale, Gavel, Handshake, DollarSign } from "lucide-react"
import type { LitigationStatus, Entity } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"

const STATUS_LABELS: Record<LitigationStatus, string> = {
  PRE_FILING: "Pre-Filing",
  FILED: "Filed",
  DISCOVERY: "Discovery",
  TRIAL: "Trial",
  APPEAL: "Appeal",
  SETTLED: "Settled",
  CLOSED: "Closed",
}

const STATUS_COLORS: Record<LitigationStatus, string> = {
  PRE_FILING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  FILED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  DISCOVERY: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  TRIAL: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  APPEAL: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  SETTLED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  CLOSED: "bg-slate-400/10 text-slate-400 border-slate-400/20",
}

const ACTIVE_STATUSES: LitigationStatus[] = [
  "PRE_FILING",
  "FILED",
  "DISCOVERY",
  "TRIAL",
]

export default async function LitigationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSession()

  const params = await searchParams
  const entityFilter = typeof params.entity === "string" ? params.entity : undefined
  const statusFilter = typeof params.status === "string" ? params.status : undefined

  const where: Prisma.LitigationCaseWhereInput = {}
  if (entityFilter) where.entity = entityFilter as Entity
  if (statusFilter) where.status = statusFilter as LitigationStatus

  const cases = await prisma.litigationCase.findMany({
    where,
    orderBy: { created_at: "desc" },
  })

  const allCases = await prisma.litigationCase.findMany()
  const totalCases = allCases.length
  const activeCases = allCases.filter((c) =>
    ACTIVE_STATUSES.includes(c.status)
  ).length
  const settledCases = allCases.filter((c) => c.status === "SETTLED").length
  const totalExposure = allCases.reduce(
    (sum, c) => sum + (c.estimated_liability ? Number(c.estimated_liability) : 0),
    0
  )

  const summaryCards = [
    {
      label: "Total Cases",
      value: totalCases.toString(),
      description: "All litigation matters",
      icon: Scale,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Active",
      value: activeCases.toString(),
      description: "Pre-Filing, Filed, Discovery, Trial",
      icon: Gavel,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
    },
    {
      label: "Settled",
      value: settledCases.toString(),
      description: "Successfully resolved",
      icon: Handshake,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Total Exposure",
      value: formatAED(totalExposure),
      description: "Estimated liability across all cases",
      icon: DollarSign,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      mono: true,
    },
  ]

  const entities = ENTITIES
  const statuses: LitigationStatus[] = [
    "PRE_FILING",
    "FILED",
    "DISCOVERY",
    "TRIAL",
    "APPEAL",
    "SETTLED",
    "CLOSED",
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Litigation Tracker</h1>
        <p className="text-muted-foreground">
          Track and manage all litigation cases across entities
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.label}
                </CardTitle>
                <div className={cn("rounded-md p-2", card.bg)}>
                  <Icon className={cn("h-4 w-4", card.color)} />
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    "text-2xl font-bold",
                    card.mono && "font-mono tabular-nums"
                  )}
                >
                  {card.value}
                </div>
                <p className="text-xs text-muted-foreground">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4">
          <form className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="entity"
                className="text-sm font-medium text-muted-foreground"
              >
                Entity
              </label>
              <select
                id="entity"
                name="entity"
                defaultValue={entityFilter ?? ""}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">All</option>
                {entities.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="status"
                className="text-sm font-medium text-muted-foreground"
              >
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={statusFilter ?? ""}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">All</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Filter
            </button>
            <a
              href="/legal/litigation"
              className="flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </a>
          </form>
        </CardContent>
      </Card>

      {/* Cases table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Cases{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({cases.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Scale className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No cases found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {entityFilter || statusFilter
                  ? "No cases match the current filters."
                  : "No litigation cases have been recorded yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case Name</TableHead>
                  <TableHead>Case Number</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Hearing</TableHead>
                  <TableHead className="text-right">Est. Liability</TableHead>
                  <TableHead>Assigned Counsel</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium max-w-[250px] truncate">
                      {c.case_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.case_number ?? "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.entity}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.jurisdiction.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[c.status]}
                      >
                        {STATUS_LABELS[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.next_hearing ? formatDate(c.next_hearing) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {c.estimated_liability
                        ? formatAED(Number(c.estimated_liability))
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.assigned_counsel ?? "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/legal/litigation/${c.id}`}
                        className="text-xs text-blue-400 underline-offset-4 hover:underline"
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
