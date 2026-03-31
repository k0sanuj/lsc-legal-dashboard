import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import {
  LIFECYCLE_STATUS_LABELS,
  LIFECYCLE_STATUS_COLORS,
} from "@/lib/constants"
import { formatAED, formatDate, formatRelativeDate, daysUntil } from "@/lib/format"
import { StatCard } from "@/components/legal/stat-card"
import { LifecycleBadge } from "@/components/legal/lifecycle-badge"
import { StatusDonutChart } from "@/components/charts/status-donut-chart"
import { TrackerBarChart } from "@/components/charts/tracker-bar-chart"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FileText,
  PenTool,
  Clock,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"
import type { LifecycleStatus } from "@/generated/prisma/client"

const STATUS_CHART_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  IN_REVIEW: "#0ea5e9",
  NEGOTIATION: "#f59e0b",
  AWAITING_SIGNATURE: "#8b5cf6",
  SIGNED: "#10b981",
  ACTIVE: "#3b82f6",
  EXPIRING: "#f43f5e",
  EXPIRED: "#64748b",
  TERMINATED: "#b91c1c",
}

const TRACKER_CATEGORY_LABELS: Record<string, string> = {
  PLATFORM: "Platform",
  VAUNT_ACQUISITION: "Vaunt Acq.",
  KEY_AGREEMENTS: "Key Agreements",
  CORPORATE: "Corporate",
  PAYMENTS: "Payments",
  IP_PATENTS: "IP & Patents",
  GIG_MARKETING: "Gig Marketing",
  OTHER: "Other",
}

export default async function CommandCenterPage() {
  await requireSession()

  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86400000)

  try {
    const [
      totalDocuments,
      pendingSignatures,
      expiringDocuments,
      openIssues,
      statusCounts,
      signatureCounts,
      upcomingExpirations,
      recentEvents,
      trackerByCategory,
    ] = await Promise.all([
      prisma.legalDocument.count(),
      prisma.signatureRequest.count({
        where: { status: { in: ["PENDING", "SENT"] } },
      }),
      prisma.legalDocument.count({
        where: {
          expiry_date: { gte: now, lte: thirtyDaysFromNow },
          lifecycle_status: { notIn: ["EXPIRED", "TERMINATED"] },
        },
      }),
      prisma.legalIssue.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] } },
      }),
      prisma.legalDocument.groupBy({
        by: ["lifecycle_status"],
        _count: { id: true },
      }),
      prisma.signatureRequest.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.legalDocument.findMany({
        where: {
          expiry_date: { gte: now },
          lifecycle_status: { notIn: ["EXPIRED", "TERMINATED"] },
        },
        orderBy: { expiry_date: "asc" },
        take: 5,
        select: {
          id: true,
          title: true,
          entity: true,
          lifecycle_status: true,
          expiry_date: true,
          value: true,
        },
      }),
      prisma.lifecycleEvent.findMany({
        orderBy: { created_at: "desc" },
        take: 10,
        include: {
          document: { select: { id: true, title: true } },
        },
      }),
      prisma.trackerItem.groupBy({
        by: ["category", "status"],
        _count: { id: true },
      }),
    ])

    const statusCountMap = Object.fromEntries(
      statusCounts.map((s) => [s.lifecycle_status, s._count.id])
    ) as Record<string, number>

    const signatureCountMap = Object.fromEntries(
      signatureCounts.map((s) => [s.status, s._count.id])
    ) as Record<string, number>

    // Chart data for status donut
    const donutData = (Object.keys(LIFECYCLE_STATUS_LABELS) as LifecycleStatus[]).map(
      (status) => ({
        name: LIFECYCLE_STATUS_LABELS[status],
        value: statusCountMap[status] ?? 0,
        color: STATUS_CHART_COLORS[status] ?? "#64748b",
      })
    ).filter((d) => d.value > 0)

    // Chart data for tracker bars
    const trackerMap = new Map<string, { total: number; complete: number }>()
    for (const row of trackerByCategory) {
      const cat = row.category
      if (!trackerMap.has(cat)) trackerMap.set(cat, { total: 0, complete: 0 })
      const entry = trackerMap.get(cat)!
      entry.total += row._count.id
      if (row.status === "COMPLETE") entry.complete += row._count.id
    }
    const trackerData = Array.from(trackerMap.entries()).map(([cat, counts]) => ({
      name: TRACKER_CATEGORY_LABELS[cat] ?? cat,
      total: counts.total,
      complete: counts.complete,
    }))

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Legal dashboard overview
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Documents"
            value={totalDocuments}
            icon={FileText}
          />
          <StatCard
            title="Pending Signatures"
            value={pendingSignatures}
            icon={PenTool}
          />
          <StatCard
            title="Expiring (30d)"
            value={expiringDocuments}
            icon={Clock}
          />
          <StatCard
            title="Open Issues"
            value={openIssues}
            icon={AlertTriangle}
          />
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Document Status — Donut Chart */}
          <div className="rounded-xl border border-border/50 bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Document Status</h2>
            {donutData.length > 0 ? (
              <StatusDonutChart data={donutData} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No documents yet.
              </p>
            )}
          </div>

          {/* Signature Pipeline */}
          <div className="rounded-xl border border-border/50 bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Signature Pipeline</h2>
            <div className="space-y-3">
              {(
                [
                  { key: "PENDING", label: "Pending", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
                  { key: "SENT", label: "Sent", color: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
                  { key: "SIGNED", label: "Signed", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
                  { key: "STALLED", label: "Stalled", color: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
                ] as const
              ).map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between"
                >
                  <Badge variant="outline" className={item.color}>
                    {item.label}
                  </Badge>
                  <span className="text-sm font-figures font-medium text-muted-foreground">
                    {signatureCountMap[item.key] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tracker Progress */}
        {trackerData.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Tracker Progress by Category</h2>
            <TrackerBarChart data={trackerData} />
          </div>
        )}

        {/* Upcoming Expirations */}
        <div className="rounded-xl border border-border/50 bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Upcoming Expirations</h2>
          {upcomingExpirations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming expirations.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead className="text-right">Days Left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingExpirations.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Link
                        href={`/legal/documents/${doc.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {doc.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{doc.entity}</Badge>
                    </TableCell>
                    <TableCell>
                      <LifecycleBadge status={doc.lifecycle_status} />
                    </TableCell>
                    <TableCell>
                      {doc.value ? formatAED(doc.value.toNumber()) : "--"}
                    </TableCell>
                    <TableCell>
                      {doc.expiry_date ? formatDate(doc.expiry_date) : "--"}
                    </TableCell>
                    <TableCell className="text-right font-figures">
                      {doc.expiry_date ? daysUntil(doc.expiry_date) : "--"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-border/50 bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recent activity.
            </p>
          ) : (
            <div className="space-y-3">
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-4 border-b border-border/30 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-2">
                      <LifecycleBadge status={event.from_status} />
                      <span className="text-muted-foreground text-xs">&rarr;</span>
                      <LifecycleBadge status={event.to_status} />
                    </div>
                    <Link
                      href={`/legal/documents/${event.document.id}`}
                      className="truncate text-sm text-primary hover:underline"
                    >
                      {event.document.title}
                    </Link>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeDate(event.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  } catch {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Legal dashboard overview
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Documents" value={0} icon={FileText} />
          <StatCard title="Pending Signatures" value={0} icon={PenTool} />
          <StatCard title="Expiring (30d)" value={0} icon={Clock} />
          <StatCard title="Open Issues" value={0} icon={AlertTriangle} />
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Unable to load dashboard data. Please check the database connection.
          </p>
        </div>
      </div>
    )
  }
}
