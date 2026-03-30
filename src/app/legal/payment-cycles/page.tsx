import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED, formatDate } from "@/lib/constants"
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
import {
  CreditCard,
  CircleDollarSign,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react"
import type { PaymentCycleStatus, PaymentTerms } from "@/generated/prisma/client"

const STATUS_COLORS: Record<PaymentCycleStatus, string> = {
  UPCOMING: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  OVERDUE: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  COMPLETED: "bg-slate-400/10 text-slate-400 border-slate-400/20",
}

const STATUS_LABELS: Record<PaymentCycleStatus, string> = {
  UPCOMING: "Upcoming",
  ACTIVE: "Active",
  OVERDUE: "Overdue",
  COMPLETED: "Completed",
}

const TERMS_LABELS: Record<PaymentTerms, string> = {
  NET_30: "Net 30",
  NET_60: "Net 60",
  MILESTONE: "Milestone",
  CUSTOM: "Custom",
}

const TERMS_COLORS: Record<PaymentTerms, string> = {
  NET_30: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  NET_60: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  MILESTONE: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CUSTOM: "bg-slate-400/10 text-slate-400 border-slate-400/20",
}

export default async function PaymentCyclesPage() {
  await requireSession()

  const cycles = await prisma.paymentCycle.findMany({
    orderBy: [{ status: "asc" }, { cycle_start: "asc" }],
    include: {
      document: { select: { id: true, title: true } },
    },
  })

  const totalCycles = cycles.length
  const activeCycles = cycles.filter((c) => c.status === "ACTIVE").length
  const overdueCycles = cycles.filter((c) => c.status === "OVERDUE").length
  const syncedCycles = cycles.filter((c) => c.finance_sync_id !== null).length

  const summaryCards = [
    {
      label: "Total Cycles",
      value: totalCycles,
      icon: CreditCard,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Active",
      value: activeCycles,
      icon: CircleDollarSign,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Overdue",
      value: overdueCycles,
      icon: AlertCircle,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
    },
    {
      label: "Synced with Finance",
      value: syncedCycles,
      icon: RefreshCw,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment Cycles</h1>
        <p className="text-muted-foreground">
          Payment terms management and finance synchronization
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
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Payment cycles table */}
      <Card>
        <CardHeader>
          <CardTitle>All Payment Cycles</CardTitle>
        </CardHeader>
        <CardContent>
          {cycles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">
                No payment cycles found
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No payment cycles have been configured for any documents.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Finance Sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((cycle) => (
                  <TableRow key={cycle.id}>
                    <TableCell>
                      <a
                        href={`/legal/documents/${cycle.document.id}`}
                        className="font-medium text-blue-400 underline-offset-4 hover:underline"
                      >
                        {cycle.document.title}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={TERMS_COLORS[cycle.terms]}
                      >
                        {TERMS_LABELS[cycle.terms]}
                        {cycle.custom_terms
                          ? ` (${cycle.custom_terms})`
                          : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatAED(Number(cycle.amount))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {cycle.cycle_start && cycle.cycle_end ? (
                        <>
                          {formatDate(cycle.cycle_start)} &ndash;{" "}
                          {formatDate(cycle.cycle_end)}
                        </>
                      ) : cycle.cycle_start ? (
                        <>From {formatDate(cycle.cycle_start)}</>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[cycle.status]}
                      >
                        {STATUS_LABELS[cycle.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {cycle.finance_sync_id ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs text-muted-foreground">
                            {cycle.last_sync_at
                              ? formatDate(cycle.last_sync_at)
                              : "Synced"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not synced
                        </span>
                      )}
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
