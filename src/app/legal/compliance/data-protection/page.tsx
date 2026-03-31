import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatDate } from "@/lib/constants"
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
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  AlertTriangle,
  ExternalLink,
} from "lucide-react"
import type { Entity } from "@/generated/prisma/client"

function getEntityLabel(value: string): string {
  return ENTITIES.find((e) => e.value === value)?.label ?? value
}

function healthScoreBadge(score: number | null) {
  if (score === null || score === undefined) {
    return (
      <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20">
        N/A
      </Badge>
    )
  }
  if (score > 80) {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
        {score}%
      </Badge>
    )
  }
  if (score >= 50) {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
        {score}%
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20">
      {score}%
    </Badge>
  )
}

export default async function DataProtectionPage() {
  await requireSession()

  const records = await prisma.dataProtectionRecord.findMany({
    orderBy: [{ entity: "asc" }, { jurisdiction: "asc" }],
  })

  // Summary calculations
  const totalEntities = records.length
  const withDpo = records.filter((r) => r.dpo_name).length
  const scores = records.filter((r) => r.health_score !== null).map((r) => r.health_score!)
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  const now = new Date()
  const twelveMonthsAgo = new Date(now.getTime() - 365 * 86400000)
  const staleAudits = records.filter(
    (r) => !r.last_audit_date || r.last_audit_date < twelveMonthsAgo
  ).length

  // Group records by entity
  const byEntity = records.reduce<Record<string, typeof records>>((acc, rec) => {
    const key = rec.entity as string
    if (!acc[key]) acc[key] = []
    acc[key].push(rec)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data Protection</h1>
        <p className="text-muted-foreground">
          Data protection compliance records across all entities and jurisdictions
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <div className="rounded-md bg-blue-500/10 p-2">
              <Shield className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{totalEntities}</div>
            <p className="text-xs text-muted-foreground">
              Across all entities
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">DPO Assigned</CardTitle>
            <div className="rounded-md bg-emerald-500/10 p-2">
              <UserCheck className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">
              {withDpo} / {totalEntities}
            </div>
            <p className="text-xs text-muted-foreground">
              Entities with DPO assigned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Health Score</CardTitle>
            <div className={cn(
              "rounded-md p-2",
              avgScore > 80 ? "bg-emerald-500/10" : avgScore >= 50 ? "bg-amber-500/10" : "bg-rose-500/10"
            )}>
              <ShieldCheck className={cn(
                "h-4 w-4",
                avgScore > 80 ? "text-emerald-500" : avgScore >= 50 ? "text-amber-500" : "text-rose-500"
              )} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{avgScore}%</div>
            <p className="text-xs text-muted-foreground">
              Average across all records
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Stale Audits</CardTitle>
            <div className="rounded-md bg-rose-500/10 p-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{staleAudits}</div>
            <p className="text-xs text-muted-foreground">
              Audit older than 12 months or missing
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Entity cards */}
      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-16">
          <Shield className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No data protection records found.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(byEntity).map(([entity, entityRecords]) => (
            entityRecords.map((record) => {
              const auditStale =
                !record.last_audit_date || record.last_audit_date < twelveMonthsAgo

              return (
                <Card key={record.id} className="relative overflow-hidden">
                  <div className={cn(
                    "absolute inset-0 bg-gradient-to-br to-transparent",
                    record.health_score && record.health_score > 80
                      ? "from-emerald-500/5"
                      : record.health_score && record.health_score >= 50
                        ? "from-amber-500/5"
                        : "from-rose-500/5"
                  )} />
                  <CardHeader className="relative pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {getEntityLabel(entity)}
                      </CardTitle>
                      {healthScoreBadge(record.health_score)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {record.jurisdiction.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {record.applicable_law}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="relative space-y-3">
                    {/* DPO status */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">DPO Assigned</span>
                      {record.dpo_name ? (
                        <div className="text-right">
                          <span className="font-medium">{record.dpo_name}</span>
                          {record.dpo_email && (
                            <span className="block text-xs text-muted-foreground">
                              {record.dpo_email}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-rose-400 font-medium">Not assigned</span>
                      )}
                    </div>

                    {/* Registration status */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Registration</span>
                      <span className="font-medium">
                        {record.registration_status ?? "Unknown"}
                      </span>
                    </div>

                    {/* Last audit */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last Audit</span>
                      {record.last_audit_date ? (
                        <span className={cn(
                          "font-medium",
                          auditStale && "text-rose-400"
                        )}>
                          {formatDate(record.last_audit_date)}
                          {auditStale && (
                            <AlertTriangle className="ml-1 h-3 w-3 inline text-rose-400" />
                          )}
                        </span>
                      ) : (
                        <span className="text-rose-400 font-medium">
                          Never audited
                          <AlertTriangle className="ml-1 h-3 w-3 inline" />
                        </span>
                      )}
                    </div>

                    {/* Privacy policy */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Privacy Policy</span>
                      {record.privacy_policy_url ? (
                        <a
                          href={record.privacy_policy_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline underline-offset-4 flex items-center gap-1"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-rose-400 font-medium">Missing</span>
                      )}
                    </div>

                    {/* DPA in place */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">DPA in Place</span>
                      {record.dpa_in_place ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20">
                          No
                        </Badge>
                      )}
                    </div>

                    {/* Breach procedure */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Breach Procedure</span>
                      {record.breach_procedure ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20">
                          No
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })
          ))}
        </div>
      )}
    </div>
  )
}
