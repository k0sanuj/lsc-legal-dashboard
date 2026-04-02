import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED, formatDate } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
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
import { ArrowLeft, Calendar, DollarSign, TrendingUp, User, Building2, Shield, Zap } from "lucide-react"
import type { VestingType, VestingEventStatus } from "@/generated/prisma/client"

const VESTING_LABELS: Record<VestingType, string> = {
  STANDARD_4Y_1Y_CLIFF: "4Y / 1Y Cliff",
  GRADED: "Graded",
  MILESTONE: "Milestone",
  CUSTOM: "Custom",
}

const VESTING_COLORS: Record<VestingType, string> = {
  STANDARD_4Y_1Y_CLIFF: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  GRADED: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  MILESTONE: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CUSTOM: "bg-slate-400/10 text-slate-400 border-slate-400/20",
}

const EVENT_STATUS_COLORS: Record<VestingEventStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  VESTED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  FORFEITED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
}

export default async function ESOPDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession()
  const { id } = await params

  const grant = await prisma.eSOPGrant.findUnique({
    where: { id },
    include: {
      vesting_events: {
        orderBy: { vest_date: "asc" },
      },
    },
  })

  if (!grant) notFound()

  const vestedShares = grant.vesting_events
    .filter((e) => e.status === "VESTED")
    .reduce((sum, e) => sum + e.shares_vesting, 0)
  const vestedPct = grant.total_shares > 0
    ? (vestedShares / grant.total_shares) * 100
    : 0
  const unvested = grant.total_shares - vestedShares
  const forfeited = grant.vesting_events
    .filter((e) => e.status === "FORFEITED")
    .reduce((sum, e) => sum + e.shares_vesting, 0)

  const cliffDate = new Date(grant.grant_date)
  cliffDate.setMonth(cliffDate.getMonth() + grant.cliff_months)
  const vestEndDate = new Date(grant.grant_date)
  vestEndDate.setMonth(vestEndDate.getMonth() + grant.vesting_months)

  const clawbackTriggers = Array.isArray(grant.clawback_triggers) ? grant.clawback_triggers as string[] : []
  const accelerationEvents = Array.isArray(grant.acceleration_events) ? grant.acceleration_events as string[] : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/legal/esop"
          className="flex size-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{grant.employee_name}</h1>
          <p className="text-sm text-muted-foreground">
            Equity Grant &middot; {formatDate(grant.grant_date)}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Shares</CardTitle>
            <div className="rounded-md p-2 bg-blue-500/10">
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{grant.total_shares.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Granted shares</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vested</CardTitle>
            <div className="rounded-md p-2 bg-emerald-500/10">
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{vestedShares.toLocaleString()}</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(vestedPct, 100)}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">{vestedPct.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unvested</CardTitle>
            <div className="rounded-md p-2 bg-amber-500/10">
              <Calendar className="h-4 w-4 text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{unvested.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Remaining to vest</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Exercise Price</CardTitle>
            <div className="rounded-md p-2 bg-violet-500/10">
              <DollarSign className="h-4 w-4 text-violet-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{formatAED(Number(grant.exercise_price))}</div>
            <p className="text-xs text-muted-foreground">Per share</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Grant Details */}
        <Card>
          <CardHeader>
            <CardTitle>Grant Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="size-3" /> Employee</p>
                <p className="text-sm font-medium">{grant.employee_name}</p>
                {grant.employee_email && <p className="text-xs text-muted-foreground">{grant.employee_email}</p>}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="size-3" /> Entity</p>
                <Badge variant="outline">{grant.entity}</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Grant Date</p>
                <p className="text-sm font-medium">{formatDate(grant.grant_date)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Vesting Type</p>
                <Badge variant="outline" className={VESTING_COLORS[grant.vesting_type]}>
                  {VESTING_LABELS[grant.vesting_type]}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Cliff Date</p>
                <p className="text-sm font-medium">{formatDate(cliffDate)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Fully Vested By</p>
                <p className="text-sm font-medium">{formatDate(vestEndDate)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Cliff Period</p>
                <p className="text-sm font-medium">{grant.cliff_months} months</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Vesting Period</p>
                <p className="text-sm font-medium">{grant.vesting_months} months</p>
              </div>
            </div>

            {grant.jp_split_ratio && (
              <div className="rounded-lg border border-border/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">JP Split Ratio</p>
                <p className="text-sm font-medium font-mono tabular-nums">{String(grant.jp_split_ratio)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Provisions */}
        <div className="space-y-6">
          {clawbackTriggers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="size-4 text-rose-400" />
                  Clawback Triggers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {clawbackTriggers.map((trigger, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 size-1.5 rounded-full bg-rose-400 shrink-0" />
                      {String(trigger)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {accelerationEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="size-4 text-amber-400" />
                  Acceleration Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {accelerationEvents.map((event, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 size-1.5 rounded-full bg-amber-400 shrink-0" />
                      {String(event)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {forfeited > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-rose-400">Forfeited Shares</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono tabular-nums">{forfeited.toLocaleString()}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Vesting Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Vesting Schedule</CardTitle>
          <CardDescription>
            {grant.vesting_events.length} vesting events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grant.vesting_events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No vesting events have been scheduled yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vest Date</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Value at Exercise</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grant.vesting_events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDate(event.vest_date)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {event.shares_vesting.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatAED(event.shares_vesting * Number(grant.exercise_price))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={EVENT_STATUS_COLORS[event.status]}>
                        {event.status}
                      </Badge>
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
