import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED, formatDate, daysUntil } from "@/lib/constants"
import { ENTITIES } from "@/lib/constants"
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
  Building2,
  CalendarClock,
  AlertTriangle,
  Banknote,
  ExternalLink,
  Check,
  X,
} from "lucide-react"

function getEntityLabel(value: string): string {
  return ENTITIES.find((e) => e.value === value)?.label ?? value
}

function renewalUrgencyClass(days: number): string {
  if (days < 30) return "text-rose-500 font-semibold"
  if (days < 60) return "text-amber-500 font-semibold"
  if (days < 90) return "text-yellow-500"
  return "text-emerald-400"
}

function renewalRowClass(days: number): string {
  if (days < 30) return "bg-rose-500/5 border-l-2 border-l-rose-500"
  if (days < 60) return "bg-amber-500/5 border-l-2 border-l-amber-500"
  if (days < 90) return "bg-yellow-500/5 border-l-2 border-l-yellow-500"
  return ""
}

export default async function RegisteredOfficesPage() {
  await requireSession()

  const agreements = await prisma.registeredOfficeAgreement.findMany({
    orderBy: { renewal_date: "asc" },
  })

  const now = new Date()
  const in30d = new Date(now.getTime() + 30 * 86400000)
  const in90d = new Date(now.getTime() + 90 * 86400000)

  const total = agreements.length
  const expiring30 = agreements.filter(
    (a) => a.renewal_date >= now && a.renewal_date <= in30d
  ).length
  const expiring90 = agreements.filter(
    (a) => a.renewal_date >= now && a.renewal_date <= in90d
  ).length
  const totalAnnualCost = agreements.reduce(
    (sum, a) => sum + (a.cost_annual ? Number(a.cost_annual) : 0),
    0
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Registered Offices</h1>
        <p className="text-muted-foreground">
          Registered office agreements and renewal tracking
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Agreements</CardTitle>
            <div className="rounded-md bg-blue-500/10 p-2">
              <Building2 className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expiring in 30 Days</CardTitle>
            <div className="rounded-md bg-rose-500/10 p-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums text-rose-400">{expiring30}</div>
            <p className="text-xs text-muted-foreground">Requires immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expiring in 90 Days</CardTitle>
            <div className="rounded-md bg-amber-500/10 p-2">
              <CalendarClock className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">{expiring90}</div>
            <p className="text-xs text-muted-foreground">Plan for renewal</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Annual Cost</CardTitle>
            <div className="rounded-md bg-emerald-500/10 p-2">
              <Banknote className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">
              {formatAED(totalAnnualCost)}
            </div>
            <p className="text-xs text-muted-foreground">Across all agreements</p>
          </CardContent>
        </Card>
      </div>

      {/* Agreements table */}
      <Card>
        <CardHeader>
          <CardTitle>All Agreements</CardTitle>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No registered office agreements</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No agreements have been recorded yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Landlord</TableHead>
                  <TableHead>Renewal Date</TableHead>
                  <TableHead className="text-right">Days Until Renewal</TableHead>
                  <TableHead className="text-right">Annual Cost</TableHead>
                  <TableHead>Auto-Renew</TableHead>
                  <TableHead>Document</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agreements.map((agreement) => {
                  const days = daysUntil(agreement.renewal_date)
                  return (
                    <TableRow
                      key={agreement.id}
                      className={renewalRowClass(days)}
                    >
                      <TableCell>
                        <Badge variant="outline">{getEntityLabel(agreement.entity)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {agreement.jurisdiction.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={agreement.address}>
                        {agreement.address}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {agreement.landlord ?? "\u2014"}
                      </TableCell>
                      <TableCell>{formatDate(agreement.renewal_date)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", renewalUrgencyClass(days))}>
                        {days < 0 ? (
                          <span className="text-rose-500 font-semibold">{Math.abs(days)}d overdue</span>
                        ) : (
                          `${days}d`
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {agreement.cost_annual
                          ? formatAED(Number(agreement.cost_annual))
                          : "\u2014"}
                      </TableCell>
                      <TableCell>
                        {agreement.auto_renew ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <X className="h-4 w-4 text-rose-400" />
                        )}
                      </TableCell>
                      <TableCell>
                        {agreement.document_url ? (
                          <a
                            href={agreement.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline underline-offset-4 flex items-center gap-1"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">\u2014</span>
                        )}
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
