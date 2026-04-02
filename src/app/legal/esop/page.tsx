import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED, formatDate } from "@/lib/constants"
import { ENTITIES } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Users, TrendingUp, Wallet, PieChart } from "lucide-react"
import type { VestingType } from "@/generated/prisma/client"

const VESTING_LABELS: Record<VestingType, string> = {
  STANDARD_4Y_1Y_CLIFF: "4Y / 1Y Cliff",
  GRADED: "Graded",
  MILESTONE: "Milestone",
  CUSTOM: "Custom",
}

const VESTING_COLORS: Record<VestingType, string> = {
  STANDARD_4Y_1Y_CLIFF:
    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  GRADED: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  MILESTONE: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CUSTOM: "bg-slate-400/10 text-slate-400 border-slate-400/20",
}

export default async function ESOPPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSession()

  const params = await searchParams
  const entityFilter = typeof params.entity === 'string' ? params.entity : undefined

  const grants = await prisma.eSOPGrant.findMany({
    where: entityFilter ? { entity: entityFilter as any } : undefined,
    orderBy: { grant_date: "desc" },
    include: {
      vesting_events: {
        where: { status: "VESTED" },
        select: { shares_vesting: true },
      },
    },
  })

  // Calculate pool summary
  const TOTAL_POOL = 1_000_000 // Configurable pool size
  const totalGranted = grants.reduce((sum, g) => sum + g.total_shares, 0)
  const totalVested = grants.reduce(
    (sum, g) =>
      sum +
      g.vesting_events.reduce((vs, ve) => vs + ve.shares_vesting, 0),
    0
  )
  const remaining = TOTAL_POOL - totalGranted

  const summaryCards = [
    {
      label: "Total Pool",
      value: TOTAL_POOL.toLocaleString(),
      description: "Authorized shares",
      icon: PieChart,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Granted",
      value: totalGranted.toLocaleString(),
      description: `${((totalGranted / TOTAL_POOL) * 100).toFixed(1)}% of pool`,
      icon: Users,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
    },
    {
      label: "Vested",
      value: totalVested.toLocaleString(),
      description: `${totalGranted > 0 ? ((totalVested / totalGranted) * 100).toFixed(1) : 0}% of granted`,
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Remaining",
      value: remaining.toLocaleString(),
      description: `${((remaining / TOTAL_POOL) * 100).toFixed(1)}% available`,
      icon: Wallet,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cap Table</h1>
        <p className="text-muted-foreground">
          Equity pool, grant tracking, and vesting schedules across entities
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
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Company filter — no "All" since that is the default view */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-muted-foreground mr-2">Company</span>
        {ENTITIES.map((e) => (
          <Link
            key={e.value}
            href={entityFilter === e.value ? "/legal/esop" : `/legal/esop?entity=${e.value}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              entityFilter === e.value
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {e.label}
          </Link>
        ))}
      </div>

      {/* Grants table */}
      <Card>
        <CardHeader>
          <CardTitle>Equity Grants</CardTitle>
          <CardDescription>
            All equity grants issued to date
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No grants issued</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No equity grants have been recorded yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Grant Date</TableHead>
                  <TableHead className="text-right">Total Shares</TableHead>
                  <TableHead className="text-right">Vested %</TableHead>
                  <TableHead className="text-right">Exercise Price</TableHead>
                  <TableHead>Vesting Type</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((grant) => {
                  const vestedShares = grant.vesting_events.reduce(
                    (sum, ve) => sum + ve.shares_vesting,
                    0
                  )
                  const vestedPct =
                    grant.total_shares > 0
                      ? (vestedShares / grant.total_shares) * 100
                      : 0

                  return (
                    <TableRow key={grant.id}>
                      <TableCell>
                        <div className="font-medium">
                          {grant.employee_name}
                        </div>
                        {grant.employee_email && (
                          <div className="text-xs text-muted-foreground">
                            {grant.employee_email}
                          </div>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline">{grant.entity}</Badge></TableCell>
                      <TableCell>{formatDate(grant.grant_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {grant.total_shares.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                vestedPct >= 100
                                  ? "bg-emerald-500"
                                  : vestedPct >= 50
                                    ? "bg-blue-500"
                                    : "bg-amber-500"
                              )}
                              style={{ width: `${Math.min(vestedPct, 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-sm">
                            {vestedPct.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAED(Number(grant.exercise_price))}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={VESTING_COLORS[grant.vesting_type]}
                        >
                          {VESTING_LABELS[grant.vesting_type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <a
                          href={`/legal/esop/${grant.id}`}
                          className="text-xs text-blue-400 underline-offset-4 hover:underline"
                        >
                          Details
                        </a>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
