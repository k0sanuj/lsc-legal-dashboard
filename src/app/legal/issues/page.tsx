import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatDate } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { PriorityBadge } from "@/components/legal/priority-badge"
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
import { AlertTriangle } from "lucide-react"
import type {
  IssueCategory,
  IssueStatus,
  Priority,
} from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"

const ISSUE_CATEGORY_LABELS: Record<IssueCategory, string> = {
  IP: "IP",
  EMPLOYMENT: "Employment",
  REGULATORY: "Regulatory",
  CONTRACTUAL: "Contractual",
}

const ISSUE_CATEGORY_COLORS: Record<IssueCategory, string> = {
  IP: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  EMPLOYMENT: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  REGULATORY: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CONTRACTUAL: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
}

const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}

const ISSUE_STATUS_COLORS: Record<IssueStatus, string> = {
  OPEN: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  IN_PROGRESS: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  ESCALATED: "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse",
  RESOLVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  CLOSED: "bg-slate-400/10 text-slate-400 border-slate-400/20",
}

function getSlaInfo(deadline: Date) {
  const now = new Date()
  const totalMs = deadline.getTime() - now.getTime()
  const totalHours = totalMs / 3600000
  const totalDays = Math.floor(totalHours / 24)
  const remainingHours = Math.floor(totalHours % 24)

  // Calculate percentage remaining relative to a 7-day SLA window
  const slaWindowMs = 7 * 24 * 3600000
  const elapsed = slaWindowMs - totalMs
  const pctRemaining = Math.max(0, Math.min(100, (totalMs / slaWindowMs) * 100))

  let color: string
  let animate = false
  if (totalMs < 0) {
    color = "text-rose-500"
    animate = true
  } else if (pctRemaining < 25) {
    color = "text-rose-500"
  } else if (pctRemaining < 50) {
    color = "text-amber-500"
  } else {
    color = "text-emerald-500"
  }

  let label: string
  if (totalMs < 0) {
    const overdueDays = Math.abs(totalDays)
    const overdueHours = Math.abs(remainingHours)
    label =
      overdueDays > 0
        ? `${overdueDays}d ${overdueHours}h overdue`
        : `${overdueHours}h overdue`
  } else {
    label =
      totalDays > 0
        ? `${totalDays}d ${remainingHours}h`
        : `${remainingHours}h`
  }

  return { label, color, animate }
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireSession()

  const params = await searchParams
  const categoryFilter = typeof params.category === "string" ? params.category : undefined
  const priorityFilter = typeof params.priority === "string" ? params.priority : undefined
  const statusFilter = typeof params.status === "string" ? params.status : undefined

  const where: Prisma.LegalIssueWhereInput = {}
  if (categoryFilter) where.category = categoryFilter as IssueCategory
  if (priorityFilter) where.priority = priorityFilter as Priority
  if (statusFilter) where.status = statusFilter as IssueStatus

  const issues = await prisma.legalIssue.findMany({
    where,
    orderBy: [{ sla_deadline: "asc" }],
    include: {
      assignee: { select: { full_name: true } },
      reporter: { select: { full_name: true } },
    },
  })

  const categories: IssueCategory[] = ["IP", "EMPLOYMENT", "REGULATORY", "CONTRACTUAL"]
  const priorities: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
  const statuses: IssueStatus[] = [
    "OPEN",
    "IN_PROGRESS",
    "ESCALATED",
    "RESOLVED",
    "CLOSED",
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Legal Issues</h1>
        <p className="text-muted-foreground">
          Track and manage legal issues with SLA monitoring
        </p>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4">
          <form className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="category"
                className="text-sm font-medium text-muted-foreground"
              >
                Category
              </label>
              <select
                id="category"
                name="category"
                defaultValue={categoryFilter ?? ""}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {ISSUE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="priority"
                className="text-sm font-medium text-muted-foreground"
              >
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                defaultValue={priorityFilter ?? ""}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">All</option>
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0) + p.slice(1).toLowerCase()}
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
                    {ISSUE_STATUS_LABELS[s]}
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
              href="/legal/issues"
              className="h-8 flex items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </a>
          </form>
        </CardContent>
      </Card>

      {/* Issues table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Issues{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({issues.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No issues found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {categoryFilter || priorityFilter || statusFilter
                  ? "No issues match the current filters."
                  : "No legal issues have been reported yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>SLA Countdown</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((issue) => {
                  const sla = getSlaInfo(issue.sla_deadline)
                  return (
                    <TableRow key={issue.id}>
                      <TableCell className="font-medium max-w-[300px] truncate">
                        {issue.title}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={ISSUE_CATEGORY_COLORS[issue.category]}
                        >
                          {ISSUE_CATEGORY_LABELS[issue.category]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={issue.priority} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={ISSUE_STATUS_COLORS[issue.status]}
                        >
                          {ISSUE_STATUS_LABELS[issue.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {issue.assignee?.full_name ?? (
                          <span className="text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "tabular-nums font-medium text-sm",
                            sla.color,
                            sla.animate && "animate-pulse"
                          )}
                        >
                          {sla.label}
                        </span>
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
