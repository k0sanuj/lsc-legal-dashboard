import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED, formatDate, daysUntil } from "@/lib/constants"
import { ENTITIES, LIFECYCLE_STATUS_LABELS, LIFECYCLE_STATUS_COLORS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { LifecycleBadge } from "@/components/legal/lifecycle-badge"
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
  FileStack,
  FileCheck,
  CalendarClock,
  Banknote,
} from "lucide-react"
import Link from "next/link"
import type {
  Entity,
  DocumentCategory,
  LifecycleStatus,
} from "@/generated/prisma/client"
import { DocumentCategory as DocumentCategoryEnum } from "@/generated/prisma/enums"

function getEntityLabel(value: string): string {
  return ENTITIES.find((e) => e.value === value)?.label ?? value
}

function categoryLabel(cat: string): string {
  return cat.replace(/_/g, " ")
}

const CATEGORY_COLORS: Record<string, string> = {
  SPONSORSHIP: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  VENDOR: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  EMPLOYMENT: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  ESOP: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  NDA: "bg-slate-400/10 text-slate-400 border-slate-400/20",
  ARENA_HOST: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  TERMS_OF_SERVICE: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  WAIVER: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  IP_ASSIGNMENT: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  PILOT_PROGRAM: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  BOARD_RESOLUTION: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  POLICY: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  MSA: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  SLA: "bg-lime-500/10 text-lime-400 border-lime-500/20",
  CONTRACTOR: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  REFERRAL_PARTNER: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
  VENUE: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  PRODUCTION_PARTNER: "bg-red-500/10 text-red-400 border-red-500/20",
  OTHER: "bg-slate-500/10 text-slate-400 border-slate-500/20",
}

export default async function AgreementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSession()

  const params = await searchParams
  const entityFilter = typeof params.entity === "string" ? params.entity : ""
  const categoryFilter = typeof params.category === "string" ? params.category : ""
  const statusFilter = typeof params.status === "string" ? params.status : ""
  const counterpartyFilter = typeof params.counterparty === "string" ? params.counterparty : ""

  const where: Record<string, unknown> = {}
  if (entityFilter) {
    where.entity = entityFilter as Entity
  }
  if (categoryFilter) {
    where.category = categoryFilter as DocumentCategory
  }
  if (statusFilter && statusFilter in LIFECYCLE_STATUS_LABELS) {
    where.lifecycle_status = statusFilter as LifecycleStatus
  }
  if (counterpartyFilter) {
    where.counterparty = { contains: counterpartyFilter, mode: "insensitive" }
  }

  const documents = await prisma.legalDocument.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      category: true,
      lifecycle_status: true,
      entity: true,
      counterparty: true,
      expiry_date: true,
      financial_impact_recurring: true,
      financial_impact_onetime: true,
      assigned_to: true,
      created_at: true,
      updated_at: true,
    },
  })

  const now = new Date()
  const in30d = new Date(now.getTime() + 30 * 86400000)

  // Summary stats
  const totalAgreements = documents.length
  const activeCount = documents.filter(
    (d) => d.lifecycle_status === "ACTIVE" || d.lifecycle_status === "SIGNED"
  ).length
  const expiringIn30 = documents.filter(
    (d) => d.expiry_date && d.expiry_date >= now && d.expiry_date <= in30d
  ).length
  const totalValue = documents.reduce((sum, d) => {
    const recurring = d.financial_impact_recurring ? Number(d.financial_impact_recurring) : 0
    const onetime = d.financial_impact_onetime ? Number(d.financial_impact_onetime) : 0
    return sum + recurring + onetime
  }, 0)

  // Get all category values for filter
  const allCategories = Object.keys(DocumentCategoryEnum) as DocumentCategory[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agreements</h1>
        <p className="text-muted-foreground">
          Comprehensive agreement management across all entities and categories
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Agreements</CardTitle>
            <div className="rounded-md bg-blue-500/10 p-2">
              <FileStack className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{totalAgreements}</div>
            <p className="text-xs text-muted-foreground">
              {entityFilter || categoryFilter || statusFilter ? "Matching filters" : "All categories"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <div className="rounded-md bg-emerald-500/10 p-2">
              <FileCheck className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">{activeCount}</div>
            <p className="text-xs text-muted-foreground">Active or signed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expiring in 30d</CardTitle>
            <div className="rounded-md bg-rose-500/10 p-2">
              <CalendarClock className="h-4 w-4 text-rose-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums text-rose-400">{expiringIn30}</div>
            <p className="text-xs text-muted-foreground">Needs review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <div className="rounded-md bg-amber-500/10 p-2">
              <Banknote className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">
              {formatAED(totalValue)}
            </div>
            <p className="text-xs text-muted-foreground">Recurring + one-time</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">Entity:</span>
        <a
          href="/legal/agreements"
          className={cn(
            "rounded-md border px-3 py-1 text-xs transition-colors",
            !entityFilter
              ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
              : "border-border/50 text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </a>
        {ENTITIES.map((ent) => (
          <a
            key={ent.value}
            href={`/legal/agreements?entity=${ent.value}${categoryFilter ? `&category=${categoryFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
            className={cn(
              "rounded-md border px-3 py-1 text-xs transition-colors",
              entityFilter === ent.value
                ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                : "border-border/50 text-muted-foreground hover:text-foreground"
            )}
          >
            {ent.label}
          </a>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">Category:</span>
        <a
          href={`/legal/agreements${entityFilter ? `?entity=${entityFilter}` : ""}${statusFilter ? `${entityFilter ? "&" : "?"}status=${statusFilter}` : ""}`}
          className={cn(
            "rounded-md border px-3 py-1 text-xs transition-colors",
            !categoryFilter
              ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
              : "border-border/50 text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </a>
        {allCategories.map((cat) => (
          <a
            key={cat}
            href={`/legal/agreements?category=${cat}${entityFilter ? `&entity=${entityFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
            className={cn(
              "rounded-md border px-3 py-1 text-xs transition-colors",
              categoryFilter === cat
                ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                : "border-border/50 text-muted-foreground hover:text-foreground"
            )}
          >
            {categoryLabel(cat)}
          </a>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">Status:</span>
        <a
          href={`/legal/agreements${entityFilter ? `?entity=${entityFilter}` : ""}${categoryFilter ? `${entityFilter ? "&" : "?"}category=${categoryFilter}` : ""}`}
          className={cn(
            "rounded-md border px-3 py-1 text-xs transition-colors",
            !statusFilter
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
              : "border-border/50 text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </a>
        {(Object.entries(LIFECYCLE_STATUS_LABELS) as [LifecycleStatus, string][]).map(
          ([value, label]) => (
            <a
              key={value}
              href={`/legal/agreements?status=${value}${entityFilter ? `&entity=${entityFilter}` : ""}${categoryFilter ? `&category=${categoryFilter}` : ""}`}
              className={cn(
                "rounded-md border px-3 py-1 text-xs transition-colors",
                statusFilter === value
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                  : "border-border/50 text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </a>
          )
        )}
      </div>

      {/* Agreements table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Agreement Registry
            {(entityFilter || categoryFilter || statusFilter) && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                (filtered)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileStack className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No agreements found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {entityFilter || categoryFilter || statusFilter
                  ? "Try adjusting your filters."
                  : "No legal documents have been recorded yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[100px]">Entity</TableHead>
                    <TableHead className="min-w-[120px]">Category</TableHead>
                    <TableHead className="min-w-[200px]">Title</TableHead>
                    <TableHead className="min-w-[140px]">Counterparty</TableHead>
                    <TableHead className="min-w-[120px]">Status</TableHead>
                    <TableHead className="min-w-[110px]">Effective Date</TableHead>
                    <TableHead className="min-w-[110px]">Expiry Date</TableHead>
                    <TableHead className="min-w-[160px] text-right">Financial Impact</TableHead>
                    <TableHead className="min-w-[120px]">Assigned To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => {
                    const recurring = doc.financial_impact_recurring
                      ? Number(doc.financial_impact_recurring)
                      : 0
                    const onetime = doc.financial_impact_onetime
                      ? Number(doc.financial_impact_onetime)
                      : 0
                    const hasFinancials = recurring > 0 || onetime > 0
                    const expiryDays = doc.expiry_date ? daysUntil(doc.expiry_date) : null

                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <Badge variant="outline">{getEntityLabel(doc.entity)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={CATEGORY_COLORS[doc.category] ?? CATEGORY_COLORS.OTHER}
                          >
                            {categoryLabel(doc.category)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/legal/documents/${doc.id}`}
                            className="font-medium text-primary hover:underline underline-offset-4"
                          >
                            {doc.title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {doc.counterparty ?? "\u2014"}
                        </TableCell>
                        <TableCell>
                          <LifecycleBadge status={doc.lifecycle_status} />
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatDate(doc.created_at)}
                        </TableCell>
                        <TableCell>
                          {doc.expiry_date ? (
                            <span
                              className={cn(
                                "tabular-nums",
                                expiryDays !== null && expiryDays <= 30 && expiryDays >= 0
                                  ? "text-rose-400 font-medium"
                                  : expiryDays !== null && expiryDays < 0
                                    ? "text-rose-500 font-semibold"
                                    : ""
                              )}
                            >
                              {formatDate(doc.expiry_date)}
                              {expiryDays !== null && expiryDays <= 30 && expiryDays >= 0 && (
                                <span className="ml-1 text-xs">({expiryDays}d)</span>
                              )}
                              {expiryDays !== null && expiryDays < 0 && (
                                <span className="ml-1 text-xs">(expired)</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">\u2014</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {hasFinancials ? (
                            <div className="font-mono tabular-nums text-sm">
                              {recurring > 0 && (
                                <div>
                                  <span className="text-muted-foreground text-xs mr-1">R:</span>
                                  {formatAED(recurring)}
                                </div>
                              )}
                              {onetime > 0 && (
                                <div>
                                  <span className="text-muted-foreground text-xs mr-1">O:</span>
                                  {formatAED(onetime)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">\u2014</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {doc.assigned_to ?? "\u2014"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
