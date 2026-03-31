"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ChevronRight } from "lucide-react"

const AUDIT_TYPE_STYLES: Record<string, string> = {
  compliance: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  financial: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  operational: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  security: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  legal: "bg-violet-500/10 text-violet-400 border-violet-500/20",
}

const JURISDICTION_LABELS: Record<string, string> = {
  UAE: "UAE",
  US_DELAWARE: "US / Delaware",
  GLOBAL: "Global",
  INDIA: "India",
  KENYA: "Kenya",
  UK: "UK",
}

type AuditReportRow = {
  id: string
  audit_type: string
  entity: string | null
  jurisdiction: string | null
  total_items: number
  compliant_items: number
  risk_items: number
  run_by: string
  created_at: string
  findings: Record<string, unknown>
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function renderFindings(findings: Record<string, unknown>, depth = 0) {
  return (
    <div className={cn("space-y-1", depth > 0 && "ml-4")}>
      {Object.entries(findings).map(([key, value]) => {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

        if (value && typeof value === "object" && !Array.isArray(value)) {
          return (
            <div key={key}>
              <span className="text-xs font-medium text-muted-foreground">
                {label}:
              </span>
              {renderFindings(value as Record<string, unknown>, depth + 1)}
            </div>
          )
        }

        if (Array.isArray(value)) {
          return (
            <div key={key} className="text-xs">
              <span className="font-medium text-muted-foreground">
                {label}:
              </span>{" "}
              <span className="text-slate-300">{value.join(", ")}</span>
            </div>
          )
        }

        return (
          <div key={key} className="text-xs">
            <span className="font-medium text-muted-foreground">
              {label}:
            </span>{" "}
            <span className="text-slate-300">{String(value)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function AuditReportExpandable({
  reports,
}: {
  reports: AuditReportRow[]
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Audit Type</TableHead>
          <TableHead>Entity</TableHead>
          <TableHead>Jurisdiction</TableHead>
          <TableHead className="text-right">Total Items</TableHead>
          <TableHead className="text-right">Compliant</TableHead>
          <TableHead className="text-right">At-Risk</TableHead>
          <TableHead>Run By</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => {
          const isExpanded = expandedId === report.id
          const atRisk = report.risk_items
          const auditTypeLower = report.audit_type.toLowerCase()

          return (
            <>
              <TableRow
                key={report.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() =>
                  setExpandedId(isExpanded ? null : report.id)
                }
              >
                <TableCell>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isExpanded && "rotate-90"
                    )}
                  />
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      AUDIT_TYPE_STYLES[auditTypeLower] ??
                      "bg-slate-400/10 text-slate-400 border-slate-400/20"
                    }
                  >
                    {report.audit_type.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {report.entity ? (
                    <Badge variant="outline">{report.entity}</Badge>
                  ) : (
                    <span className="text-muted-foreground">All</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {report.jurisdiction
                    ? JURISDICTION_LABELS[report.jurisdiction] ??
                      report.jurisdiction
                    : "\u2014"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {report.total_items}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-emerald-400">
                  {report.compliant_items}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono tabular-nums",
                    atRisk > 0 ? "text-rose-400 font-semibold" : "text-muted-foreground"
                  )}
                >
                  {atRisk}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {report.run_by}
                </TableCell>
                <TableCell>{formatDate(report.created_at)}</TableCell>
              </TableRow>

              {isExpanded && (
                <TableRow key={`${report.id}-findings`}>
                  <TableCell colSpan={9}>
                    <div className="rounded-lg border border-border/50 bg-slate-950 p-4">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Findings
                      </h4>
                      {report.findings &&
                      Object.keys(report.findings).length > 0 ? (
                        renderFindings(report.findings)
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No findings data available.
                        </p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          )
        })}
      </TableBody>
    </Table>
  )
}
