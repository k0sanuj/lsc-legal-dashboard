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
import { NewTrancheForm } from "@/components/legal/new-tranche-form"
import { FinanceSyncBadge } from "@/components/legal/finance-sync-badge"
import { resyncPaymentCycleAction } from "@/actions/payment-cycles"

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

export default async function PaymentCyclesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSession()
  const params = await searchParams
  const status = typeof params.status === "string" ? params.status : null
  const message = typeof params.message === "string" ? params.message : null

  const [cycles, documents] = await Promise.all([
    prisma.paymentCycle.findMany({
      orderBy: [{ status: "asc" }, { cycle_start: "asc" }],
      include: {
        document: { select: { id: true, title: true } },
      },
    }),
    // Hard-block: only documents that have been synced to Finance qualify
    // as parents for new tranches. This avoids the "could not resolve
    // contract" 400 from Finance and keeps the state machine clean.
    prisma.legalDocument.findMany({
      where: { last_finance_post_at: { not: null } },
      orderBy: { updated_at: "desc" },
      select: { id: true, title: true },
      take: 100,
    }),
  ])

  const totalCycles = cycles.length
  const activeCycles = cycles.filter((c) => c.status === "ACTIVE").length
  const overdueCycles = cycles.filter((c) => c.status === "OVERDUE").length
  const syncedCycles = cycles.filter((c) => c.finance_post_status === "synced").length

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Cycles</h1>
          <p className="text-muted-foreground">
            Payment terms management and Finance synchronization
          </p>
        </div>
        <NewTrancheForm documents={documents} />
      </div>

      {message && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            status === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : status === "warn"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-rose-500/30 bg-rose-500/10 text-rose-400"
          )}
        >
          {message.replace(/\+/g, " ")}
        </div>
      )}

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
                  <TableHead>Contract</TableHead>
                  <TableHead>Tranche</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="text-right">Amount (USD)</TableHead>
                  <TableHead>%</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Finance Sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((cycle) => (
                  <TableRow key={cycle.id}>
                    <TableCell>
                      <div className="font-medium">
                        {cycle.contract_name ?? cycle.document.title}
                      </div>
                      <a
                        href={`/legal/documents/${cycle.document.id}`}
                        className="text-xs text-blue-400 underline-offset-4 hover:underline"
                      >
                        {cycle.document.title}
                      </a>
                    </TableCell>
                    <TableCell>
                      {cycle.tranche_number != null ? (
                        <div>
                          <div className="text-sm">#{cycle.tranche_number}</div>
                          {cycle.tranche_label && (
                            <div className="text-xs text-muted-foreground">
                              {cycle.tranche_label}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge
                          variant="outline"
                          className={TERMS_COLORS[cycle.terms]}
                        >
                          {TERMS_LABELS[cycle.terms]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {cycle.trigger_type ? (
                        <div>
                          <div className="capitalize">
                            {cycle.trigger_type.replace(/_/g, " ")}
                          </div>
                          {cycle.trigger_date && (
                            <div className="text-xs text-muted-foreground">
                              {formatDate(cycle.trigger_date)}
                            </div>
                          )}
                        </div>
                      ) : cycle.cycle_start ? (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(cycle.cycle_start)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">\u2014</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm">
                      {cycle.tranche_amount_usd != null
                        ? `$${Number(cycle.tranche_amount_usd).toLocaleString()}`
                        : formatAED(Number(cycle.amount))}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {cycle.tranche_percentage != null
                        ? `${Number(cycle.tranche_percentage).toFixed(2)}%`
                        : "\u2014"}
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
                      <FinanceSyncBadge
                        status={cycle.finance_post_status}
                        lastPostedAt={cycle.last_finance_post_at}
                        errorMessage={cycle.last_finance_post_error}
                        recordId={cycle.id}
                        resyncAction={resyncPaymentCycleAction}
                      />
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
