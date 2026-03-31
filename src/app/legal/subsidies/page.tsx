import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { ENTITIES, formatAED, formatDate } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
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
import { Landmark, DollarSign, BarChart3, PieChart } from "lucide-react"
import type { SubsidyStatus, Entity } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"

const STATUS_LABELS: Record<SubsidyStatus, string> = {
  IDENTIFIED: "Identified",
  APPLYING: "Applying",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DISBURSED: "Disbursed",
}

const STATUS_COLORS: Record<SubsidyStatus, string> = {
  IDENTIFIED: "bg-slate-400/10 text-slate-400 border-slate-400/20",
  APPLYING: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  REJECTED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  DISBURSED: "bg-violet-500/10 text-violet-400 border-violet-500/20",
}

export default async function SubsidiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSession()

  const params = await searchParams
  const entityFilter =
    typeof params.entity === "string" ? params.entity : undefined
  const statusFilter =
    typeof params.status === "string" ? params.status : undefined

  const where: Prisma.SubsidyWhereInput = {}
  if (entityFilter) where.entity = entityFilter as Entity
  if (statusFilter) where.status = statusFilter as SubsidyStatus

  const subsidies = await prisma.subsidy.findMany({
    where,
    orderBy: { created_at: "desc" },
  })

  // Unfiltered stats
  const allSubsidies = await prisma.subsidy.findMany()
  const totalSubsidies = allSubsidies.length
  const totalValue = allSubsidies
    .filter((s) => s.status === "APPROVED" || s.status === "DISBURSED")
    .reduce((sum, s) => sum + (s.amount ? Number(s.amount) : 0), 0)

  // Status breakdown
  const statusBreakdown: { status: SubsidyStatus; count: number }[] = [
    "IDENTIFIED",
    "APPLYING",
    "APPROVED",
    "REJECTED",
    "DISBURSED",
  ].map((status) => ({
    status: status as SubsidyStatus,
    count: allSubsidies.filter((s) => s.status === status).length,
  }))

  const summaryCards = [
    {
      label: "Total Subsidies",
      value: totalSubsidies.toString(),
      description: "All tracked subsidies",
      icon: Landmark,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Total Value",
      value: formatAED(totalValue),
      description: "Approved + disbursed amounts",
      icon: DollarSign,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      mono: true,
    },
    {
      label: "By Status",
      value: "",
      description: "",
      icon: PieChart,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      breakdown: statusBreakdown,
    },
  ]

  const statuses: SubsidyStatus[] = [
    "IDENTIFIED",
    "APPLYING",
    "APPROVED",
    "REJECTED",
    "DISBURSED",
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Subsidies Management
        </h1>
        <p className="text-muted-foreground">
          Government subsidies, grants, and incentive programs
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                {card.breakdown ? (
                  <div className="flex flex-wrap gap-2">
                    {card.breakdown.map((item) => (
                      <div
                        key={item.status}
                        className="flex items-center gap-1.5"
                      >
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            STATUS_COLORS[item.status]
                          )}
                        >
                          {STATUS_LABELS[item.status]}
                        </Badge>
                        <span className="text-sm font-medium tabular-nums">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
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
                  </>
                )}
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
                {ENTITIES.map((e) => (
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
              href="/legal/subsidies"
              className="flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </a>
          </form>
        </CardContent>
      </Card>

      {/* Subsidies table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Subsidies{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({subsidies.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subsidies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Landmark className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">
                No subsidies found
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {entityFilter || statusFilter
                  ? "No subsidies match the current filters."
                  : "No subsidies have been recorded yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Application Date</TableHead>
                  <TableHead>Approval Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subsidies.map((subsidy) => (
                  <TableRow key={subsidy.id}>
                    <TableCell className="font-medium max-w-[250px] truncate">
                      {subsidy.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{subsidy.entity}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {subsidy.jurisdiction.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {subsidy.source}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[subsidy.status]}
                      >
                        {STATUS_LABELS[subsidy.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {subsidy.amount
                        ? formatAED(Number(subsidy.amount))
                        : "\u2014"}
                    </TableCell>
                    <TableCell>
                      {subsidy.application_date
                        ? formatDate(subsidy.application_date)
                        : "\u2014"}
                    </TableCell>
                    <TableCell>
                      {subsidy.approval_date
                        ? formatDate(subsidy.approval_date)
                        : "\u2014"}
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
