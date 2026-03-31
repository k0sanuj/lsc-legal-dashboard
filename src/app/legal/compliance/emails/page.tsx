import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatDate, daysUntil } from "@/lib/constants"
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
  Mail,
  MailCheck,
  MailX,
  Globe,
  AlertTriangle,
} from "lucide-react"
import type { Entity } from "@/generated/prisma/client"

function getEntityLabel(value: string): string {
  return ENTITIES.find((e) => e.value === value)?.label ?? value
}

function statusBadge(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === "active") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
        Active
      </Badge>
    )
  }
  if (normalized === "inactive") {
    return (
      <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20">
        Inactive
      </Badge>
    )
  }
  if (normalized === "suspended") {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
        Suspended
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20">
      {status}
    </Badge>
  )
}

export default async function CompanyEmailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSession()

  const params = await searchParams
  const entityFilter = typeof params.entity === "string" ? params.entity : ""
  const statusFilter = typeof params.status === "string" ? params.status : ""

  const where: Record<string, unknown> = {}
  if (entityFilter) {
    where.entity = entityFilter as Entity
  }
  if (statusFilter) {
    where.status = statusFilter
  }

  const emails = await prisma.companyEmail.findMany({
    where,
    orderBy: [{ entity: "asc" }, { email_address: "asc" }],
  })

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
  const in90d = new Date(now.getTime() + 90 * 86400000)

  // Summary stats
  const totalEmails = emails.length
  const activeCount = emails.filter((e) => e.status.toLowerCase() === "active").length
  const inactiveCount = emails.filter((e) => e.status.toLowerCase() !== "active").length

  // Unique domains
  const allDomains = [...new Set(emails.map((e) => e.domain))]
  const domainsExpiringSoon = emails.filter(
    (e) => e.domain_expiry && e.domain_expiry <= in90d && e.domain_expiry >= now
  )
  const uniqueExpiringDomains = [...new Set(domainsExpiringSoon.map((e) => e.domain))]

  // No activity in last 30 days
  const staleEmails = emails.filter(
    (e) => e.status.toLowerCase() === "active" && (!e.last_activity || e.last_activity < thirtyDaysAgo)
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Company Emails</h1>
        <p className="text-muted-foreground">
          Track all company email accounts, domains, and activity
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Emails</CardTitle>
            <div className="rounded-md bg-blue-500/10 p-2">
              <Mail className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{totalEmails}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <div className="rounded-md bg-emerald-500/10 p-2">
              <MailCheck className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">{activeCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <div className="rounded-md bg-rose-500/10 p-2">
              <MailX className="h-4 w-4 text-rose-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums text-rose-400">{inactiveCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Domains Tracked</CardTitle>
            <div className="rounded-md bg-violet-500/10 p-2">
              <Globe className="h-4 w-4 text-violet-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums">{allDomains.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Domains Expiring</CardTitle>
            <div className="rounded-md bg-amber-500/10 p-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">
              {uniqueExpiringDomains.length}
            </div>
            <p className="text-xs text-muted-foreground">Within 90 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Stale activity warning */}
      {staleEmails.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>
            <strong>{staleEmails.length}</strong> active{" "}
            {staleEmails.length === 1 ? "email has" : "emails have"} had no
            activity in the last 30 days.
          </span>
        </div>
      )}

      {/* Filter links */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">Filter:</span>
        <a
          href="/legal/compliance/emails"
          className={cn(
            "rounded-md border px-3 py-1 text-xs transition-colors",
            !entityFilter && !statusFilter
              ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
              : "border-border/50 text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </a>
        <a
          href="/legal/compliance/emails?status=active"
          className={cn(
            "rounded-md border px-3 py-1 text-xs transition-colors",
            statusFilter === "active"
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
              : "border-border/50 text-muted-foreground hover:text-foreground"
          )}
        >
          Active
        </a>
        <a
          href="/legal/compliance/emails?status=inactive"
          className={cn(
            "rounded-md border px-3 py-1 text-xs transition-colors",
            statusFilter === "inactive"
              ? "border-rose-500/50 bg-rose-500/10 text-rose-400"
              : "border-border/50 text-muted-foreground hover:text-foreground"
          )}
        >
          Inactive
        </a>
        <span className="text-muted-foreground mx-1">|</span>
        {ENTITIES.map((ent) => (
          <a
            key={ent.value}
            href={`/legal/compliance/emails?entity=${ent.value}${statusFilter ? `&status=${statusFilter}` : ""}`}
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

      {/* Email table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Email Accounts
            {(entityFilter || statusFilter) && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                (filtered)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Mail className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No email accounts found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {entityFilter || statusFilter
                  ? "Try adjusting your filters."
                  : "No company emails have been recorded yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Domain Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email) => {
                  const isStale =
                    email.status.toLowerCase() === "active" &&
                    (!email.last_activity || email.last_activity < thirtyDaysAgo)
                  const domainExpiringSoon =
                    email.domain_expiry &&
                    email.domain_expiry <= in90d &&
                    email.domain_expiry >= now

                  return (
                    <TableRow
                      key={email.id}
                      className={cn(isStale && "bg-amber-500/5 border-l-2 border-l-amber-500")}
                    >
                      <TableCell>
                        <Badge variant="outline">{getEntityLabel(email.entity)}</Badge>
                      </TableCell>
                      <TableCell className="font-medium font-mono text-sm">
                        {email.email_address}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {email.owner_name ?? "\u2014"}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {email.domain}
                      </TableCell>
                      <TableCell>{statusBadge(email.status)}</TableCell>
                      <TableCell>
                        {email.last_activity ? (
                          <span className={cn(isStale && "text-amber-400")}>
                            {formatDate(email.last_activity)}
                            {isStale && (
                              <AlertTriangle className="ml-1 h-3 w-3 inline text-amber-400" />
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">\u2014</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {email.domain_expiry ? (
                          <span className={cn(
                            "tabular-nums",
                            domainExpiringSoon && "text-amber-400 font-medium"
                          )}>
                            {formatDate(email.domain_expiry)}
                            {domainExpiringSoon && (
                              <span className="ml-1 text-xs">
                                ({daysUntil(email.domain_expiry)}d)
                              </span>
                            )}
                          </span>
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
