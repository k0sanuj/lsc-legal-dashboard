import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED, formatDate, daysUntil } from "@/lib/constants"
import { ENTITIES } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { LifecycleBadge } from "@/components/legal/lifecycle-badge"
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
import { AlertTriangle, Clock, CalendarDays, ShieldAlert } from "lucide-react"

function getEntityLabel(value: string): string {
  return ENTITIES.find((e) => e.value === value)?.label ?? value
}

function urgencyClass(days: number): string {
  if (days < 14) return "bg-rose-500/5 border-l-2 border-l-rose-500"
  if (days < 30) return "bg-amber-500/5 border-l-2 border-l-amber-500"
  if (days < 60) return "bg-yellow-500/5 border-l-2 border-l-yellow-500"
  return "bg-blue-500/5 border-l-2 border-l-blue-500"
}

function urgencyTextClass(days: number): string {
  if (days < 14) return "text-rose-500 font-semibold"
  if (days < 30) return "text-amber-500 font-semibold"
  if (days < 60) return "text-yellow-500"
  return "text-blue-400"
}

export default async function ExpirationsPage() {
  await requireSession()

  const now = new Date()
  const in90d = new Date(now.getTime() + 90 * 86400000)

  const documents = await prisma.legalDocument.findMany({
    where: {
      expiry_date: { gte: now, lte: in90d },
      lifecycle_status: { notIn: ["EXPIRED", "TERMINATED"] },
    },
    orderBy: { expiry_date: "asc" },
    include: { owner: { select: { full_name: true } } },
  })

  const in14d = new Date(now.getTime() + 14 * 86400000)
  const in30d = new Date(now.getTime() + 30 * 86400000)
  const in60d = new Date(now.getTime() + 60 * 86400000)

  const buckets = [
    {
      label: "Within 14 days",
      icon: ShieldAlert,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      docs: documents.filter((d) => d.expiry_date! <= in14d),
    },
    {
      label: "Within 30 days",
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      docs: documents.filter(
        (d) => d.expiry_date! > in14d && d.expiry_date! <= in30d
      ),
    },
    {
      label: "Within 60 days",
      icon: Clock,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
      docs: documents.filter(
        (d) => d.expiry_date! > in30d && d.expiry_date! <= in60d
      ),
    },
    {
      label: "Within 90 days",
      icon: CalendarDays,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      docs: documents.filter((d) => d.expiry_date! > in60d),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expirations</h1>
        <p className="text-muted-foreground">
          Documents approaching expiry within the next 90 days
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((bucket) => {
          const totalValue = bucket.docs.reduce(
            (sum, d) => sum + (d.value ? Number(d.value) : 0),
            0
          )
          const Icon = bucket.icon
          return (
            <Card key={bucket.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {bucket.label}
                </CardTitle>
                <div className={cn("rounded-md p-2", bucket.bg)}>
                  <Icon className={cn("h-4 w-4", bucket.color)} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{bucket.docs.length}</div>
                <p className="text-xs text-muted-foreground">
                  {totalValue > 0
                    ? `${formatAED(totalValue)} at risk`
                    : "No monetary value recorded"}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Expiring documents table */}
      <Card>
        <CardHeader>
          <CardTitle>Expiring Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">
                No documents expiring soon
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                All documents are clear of the 90-day expiration window.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead className="text-right">Days Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const days = daysUntil(doc.expiry_date!)
                  return (
                    <TableRow
                      key={doc.id}
                      className={urgencyClass(days)}
                    >
                      <TableCell className="font-medium">
                        {doc.title}
                      </TableCell>
                      <TableCell>{getEntityLabel(doc.entity)}</TableCell>
                      <TableCell>
                        <LifecycleBadge status={doc.lifecycle_status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {doc.value ? formatAED(Number(doc.value)) : "\u2014"}
                      </TableCell>
                      <TableCell>{formatDate(doc.expiry_date!)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          urgencyTextClass(days)
                        )}
                      >
                        {days}d
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
