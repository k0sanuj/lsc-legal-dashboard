import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatDate } from "@/lib/constants"
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
  ClipboardList,
  CalendarDays,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react"
import { AuditReportExpandable } from "./audit-report-expandable"

export default async function AuditReportsPage() {
  await requireSession()

  const reports = await prisma.auditReport.findMany({
    orderBy: { created_at: "desc" },
    take: 100,
  })

  // Summary stats
  const totalAudits = reports.length
  const lastAuditDate =
    reports.length > 0 ? reports[0].created_at : null
  const avgRiskItems =
    reports.length > 0
      ? Math.round(
          reports.reduce((sum, r) => sum + r.risk_items, 0) / reports.length
        )
      : 0
  const totalCompliant = reports.reduce((sum, r) => sum + r.compliant_items, 0)
  const totalItems = reports.reduce((sum, r) => sum + r.total_items, 0)
  const complianceRate =
    totalItems > 0 ? ((totalCompliant / totalItems) * 100).toFixed(1) : "0.0"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Reports</h1>
        <p className="text-muted-foreground">
          Compliance audits, risk assessments, and findings across all entities
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Audits
            </CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono tabular-nums">
              {totalAudits}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Audit Date
            </CardTitle>
            <CalendarDays className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {lastAuditDate ? formatDate(lastAuditDate) : "\u2014"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Risk Items
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-400">
              {avgRiskItems}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Compliance Rate
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-2xl font-bold font-mono tabular-nums",
                parseFloat(complianceRate) >= 90
                  ? "text-emerald-400"
                  : parseFloat(complianceRate) >= 70
                    ? "text-amber-400"
                    : "text-rose-400"
              )}
            >
              {complianceRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Audit Reports Table */}
      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-16">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No audit reports found.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card">
          <AuditReportExpandable
            reports={reports.map((r) => ({
              id: r.id,
              audit_type: r.audit_type,
              entity: r.entity,
              jurisdiction: r.jurisdiction,
              total_items: r.total_items,
              compliant_items: r.compliant_items,
              risk_items: r.risk_items,
              run_by: r.run_by,
              created_at: r.created_at.toISOString(),
              findings: r.findings as Record<string, unknown>,
            }))}
          />
        </div>
      )}
    </div>
  )
}
