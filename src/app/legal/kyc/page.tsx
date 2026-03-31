import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { ENTITIES, formatDate } from "@/lib/constants"
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
  ShieldCheck,
  FileCheck,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"
import type {
  KycDocStatus,
  Entity,
  Jurisdiction,
} from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"

const STATUS_LABELS: Record<KycDocStatus, string> = {
  COLLECTED: "Collected",
  VERIFIED: "Verified",
  EXPIRED: "Expired",
  NEEDS_RENEWAL: "Needs Renewal",
}

const STATUS_COLORS: Record<KycDocStatus, string> = {
  COLLECTED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  VERIFIED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  EXPIRED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  NEEDS_RENEWAL: "bg-amber-500/10 text-amber-400 border-amber-500/20",
}

const JURISDICTIONS: { value: Jurisdiction; label: string }[] = [
  { value: "UAE", label: "UAE" },
  { value: "US_DELAWARE", label: "US / Delaware" },
  { value: "GLOBAL", label: "Global" },
  { value: "INDIA", label: "India" },
  { value: "KENYA", label: "Kenya" },
  { value: "UK", label: "UK" },
  { value: "SINGAPORE", label: "Singapore" },
  { value: "CAYMAN", label: "Cayman" },
]

export default async function KycPage({
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
  const jurisdictionFilter =
    typeof params.jurisdiction === "string" ? params.jurisdiction : undefined

  const where: Prisma.KycDocumentWhereInput = {}
  if (entityFilter) where.entity = entityFilter as Entity
  if (statusFilter) where.status = statusFilter as KycDocStatus
  if (jurisdictionFilter)
    where.jurisdiction = jurisdictionFilter as Jurisdiction

  const documents = await prisma.kycDocument.findMany({
    where,
    orderBy: { created_at: "desc" },
    include: {
      verifier: { select: { full_name: true } },
    },
  })

  // Get counts for summary cards (unfiltered)
  const allDocs = await prisma.kycDocument.findMany({
    select: { status: true },
  })
  const collected = allDocs.filter((d) => d.status === "COLLECTED").length
  const verified = allDocs.filter((d) => d.status === "VERIFIED").length
  const expired = allDocs.filter((d) => d.status === "EXPIRED").length
  const needsRenewal = allDocs.filter(
    (d) => d.status === "NEEDS_RENEWAL"
  ).length

  const summaryCards = [
    {
      label: "Collected",
      value: collected.toString(),
      description: "Documents gathered",
      icon: FileCheck,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Verified",
      value: verified.toString(),
      description: "Validated and approved",
      icon: ShieldCheck,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Expired",
      value: expired.toString(),
      description: "Past expiry date",
      icon: AlertTriangle,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
    },
    {
      label: "Needs Renewal",
      value: needsRenewal.toString(),
      description: "Action required",
      icon: RefreshCw,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  ]

  const statuses: KycDocStatus[] = [
    "COLLECTED",
    "VERIFIED",
    "EXPIRED",
    "NEEDS_RENEWAL",
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">KYC Tracker</h1>
        <p className="text-muted-foreground">
          Know Your Customer document management across entities and
          jurisdictions
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
                htmlFor="jurisdiction"
                className="text-sm font-medium text-muted-foreground"
              >
                Jurisdiction
              </label>
              <select
                id="jurisdiction"
                name="jurisdiction"
                defaultValue={jurisdictionFilter ?? ""}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">All</option>
                {JURISDICTIONS.map((j) => (
                  <option key={j.value} value={j.value}>
                    {j.label}
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
              href="/legal/kyc"
              className="flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </a>
          </form>
        </CardContent>
      </Card>

      {/* KYC Documents table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Documents{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({documents.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShieldCheck className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">
                No KYC documents found
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {entityFilter || statusFilter || jurisdictionFilter
                  ? "No documents match the current filters."
                  : "No KYC documents have been recorded yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Document Type</TableHead>
                  <TableHead>Document Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Verified By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const isExpired = doc.status === "EXPIRED"
                  return (
                    <TableRow
                      key={doc.id}
                      className={cn(
                        isExpired &&
                          "bg-rose-500/5 border-l-2 border-l-rose-500/40"
                      )}
                    >
                      <TableCell>
                        <Badge variant="outline">{doc.entity}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {doc.jurisdiction.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{doc.document_type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {doc.document_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={STATUS_COLORS[doc.status]}
                        >
                          {STATUS_LABELS[doc.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {doc.expiry_date ? (
                          <span
                            className={cn(
                              isExpired && "text-rose-400 font-medium"
                            )}
                          >
                            {formatDate(doc.expiry_date)}
                          </span>
                        ) : (
                          "\u2014"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {doc.verifier?.full_name ?? "\u2014"}
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
