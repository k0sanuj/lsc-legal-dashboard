import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED, formatDate } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { notFound } from "next/navigation"
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
import {
  ArrowLeft,
  DollarSign,
  Receipt,
  TrendingUp,
  Calendar,
  FileText,
  ExternalLink,
} from "lucide-react"
import type { LitigationStatus } from "@/generated/prisma/client"

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

export default async function LitigationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSession()

  const { id } = await params

  const litigationCase = await prisma.litigationCase.findUnique({
    where: { id },
    include: {
      assignee: { select: { full_name: true, email: true } },
      events: { orderBy: { event_date: "desc" } },
      documents: { orderBy: { created_at: "desc" } },
    },
  })

  if (!litigationCase) {
    notFound()
  }

  const daysSinceFiling = litigationCase.filing_date
    ? Math.floor(
        (new Date().getTime() - new Date(litigationCase.filing_date).getTime()) /
          86400000
      )
    : null

  const summaryCards = [
    {
      label: "Financial Exposure",
      value: litigationCase.estimated_liability
        ? formatAED(Number(litigationCase.estimated_liability))
        : "\u2014",
      icon: DollarSign,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      mono: true,
    },
    {
      label: "Legal Fees to Date",
      value: litigationCase.legal_fees_to_date
        ? formatAED(Number(litigationCase.legal_fees_to_date))
        : "\u2014",
      icon: Receipt,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      mono: true,
    },
    {
      label: "Projected Total Cost",
      value: litigationCase.projected_total_cost
        ? formatAED(Number(litigationCase.projected_total_cost))
        : "\u2014",
      icon: TrendingUp,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      mono: true,
    },
    {
      label: "Days Since Filing",
      value: daysSinceFiling !== null ? daysSinceFiling.toString() : "\u2014",
      description: litigationCase.filing_date
        ? `Filed ${formatDate(litigationCase.filing_date)}`
        : "Not yet filed",
      icon: Calendar,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      mono: false,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Back link + Header */}
      <div>
        <Link
          href="/legal/litigation"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Litigation
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {litigationCase.case_name}
          </h1>
          <Badge variant="outline">{litigationCase.entity}</Badge>
          <Badge
            variant="outline"
            className={STATUS_COLORS[litigationCase.status]}
          >
            {STATUS_LABELS[litigationCase.status]}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {litigationCase.jurisdiction.replace(/_/g, " ")}
          </span>
        </div>
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
                {card.description && (
                  <p className="text-xs text-muted-foreground">
                    {card.description}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Two-column: Case Details + Counsel Info */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Case Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Case Number" value={litigationCase.case_number} />
            <DetailRow label="Court / Tribunal" value={litigationCase.court_tribunal} />
            <DetailRow label="Plaintiff" value={litigationCase.plaintiff} />
            <DetailRow label="Defendant" value={litigationCase.defendant} />
            <DetailRow
              label="Filing Date"
              value={
                litigationCase.filing_date
                  ? formatDate(litigationCase.filing_date)
                  : null
              }
            />
            <DetailRow
              label="Next Hearing"
              value={
                litigationCase.next_hearing
                  ? formatDate(litigationCase.next_hearing)
                  : null
              }
            />
            <DetailRow
              label="Statute of Limitations"
              value={
                litigationCase.statute_of_limitations
                  ? formatDate(litigationCase.statute_of_limitations)
                  : null
              }
            />
            {litigationCase.notes && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Notes
                </p>
                <p className="text-sm">{litigationCase.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Counsel Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Assigned Counsel"
              value={litigationCase.assigned_counsel}
            />
            <DetailRow
              label="External Counsel"
              value={litigationCase.external_counsel}
            />
            <DetailRow
              label="Internal Assignee"
              value={litigationCase.assignee?.full_name}
            />
            <DetailRow
              label="Assignee Email"
              value={litigationCase.assignee?.email}
            />
            <DetailRow
              label="Currency"
              value={litigationCase.currency}
            />
            <DetailRow
              label="Estimated Liability"
              value={
                litigationCase.estimated_liability
                  ? formatAED(Number(litigationCase.estimated_liability))
                  : null
              }
              mono
            />
            <DetailRow
              label="Legal Fees to Date"
              value={
                litigationCase.legal_fees_to_date
                  ? formatAED(Number(litigationCase.legal_fees_to_date))
                  : null
              }
              mono
            />
            <DetailRow
              label="Projected Total Cost"
              value={
                litigationCase.projected_total_cost
                  ? formatAED(Number(litigationCase.projected_total_cost))
                  : null
              }
              mono
            />
          </CardContent>
        </Card>
      </div>

      {/* Events Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Events Timeline</CardTitle>
          <CardDescription>
            Chronological record of case events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {litigationCase.events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No events recorded</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No events have been logged for this case yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {litigationCase.events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(event.event_date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {event.event_type.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {event.title}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-muted-foreground">
                      {event.description ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.created_by ?? "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Files and documents related to this case
          </CardDescription>
        </CardHeader>
        <CardContent>
          {litigationCase.documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No documents uploaded</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No documents have been attached to this case yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {litigationCase.documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {doc.doc_type.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {doc.uploaded_by ?? "\u2014"}
                    </TableCell>
                    <TableCell>{formatDate(doc.created_at)}</TableCell>
                    <TableCell>
                      {doc.file_url ? (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-400 underline-offset-4 hover:underline"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No file
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

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span
        className={cn(
          "text-sm font-medium text-right",
          mono && "font-mono tabular-nums"
        )}
      >
        {value ?? "\u2014"}
      </span>
    </div>
  )
}
