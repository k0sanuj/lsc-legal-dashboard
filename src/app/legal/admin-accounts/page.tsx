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
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Check,
  X,
  ExternalLink,
} from "lucide-react"
import type { Entity } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSession()

  const params = await searchParams
  const entityFilter =
    typeof params.entity === "string" ? params.entity : undefined

  const where: Prisma.AdminAccountWhereInput = {}
  if (entityFilter) where.entity = entityFilter as Entity

  const accounts = await prisma.adminAccount.findMany({
    where,
    orderBy: { created_at: "desc" },
  })

  // Unfiltered stats
  const allAccounts = await prisma.adminAccount.findMany()
  const totalAccounts = allAccounts.length
  const twoFactorCount = allAccounts.filter(
    (a) => a.two_factor_enabled
  ).length
  const twoFactorPct =
    totalAccounts > 0
      ? ((twoFactorCount / totalAccounts) * 100).toFixed(0)
      : "0"
  const recoveryCount = allAccounts.filter(
    (a) => a.recovery_documented
  ).length
  const recoveryPct =
    totalAccounts > 0
      ? ((recoveryCount / totalAccounts) * 100).toFixed(0)
      : "0"

  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000)
  const staleCount = allAccounts.filter(
    (a) => !a.last_verified || a.last_verified < ninetyDaysAgo
  ).length

  const summaryCards = [
    {
      label: "Total Accounts",
      value: totalAccounts.toString(),
      description: "Across all entities",
      icon: KeyRound,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "2FA Enabled",
      value: `${twoFactorPct}%`,
      description: `${twoFactorCount} of ${totalAccounts} accounts`,
      icon: ShieldCheck,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Recovery Documented",
      value: `${recoveryPct}%`,
      description: `${recoveryCount} of ${totalAccounts} accounts`,
      icon: ShieldAlert,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
    },
    {
      label: "Stale Verification",
      value: staleCount.toString(),
      description: "Last verified > 90 days or never",
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Administrator Accounts
        </h1>
        <p className="text-muted-foreground">
          Platform and service account access management
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

            <button
              type="submit"
              className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Filter
            </button>
            <a
              href="/legal/admin-accounts"
              className="flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </a>
          </form>
        </CardContent>
      </Card>

      {/* Accounts table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Accounts{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({accounts.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <KeyRound className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No accounts found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {entityFilter
                  ? "No accounts match the current filter."
                  : "No administrator accounts have been recorded yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Account Holder</TableHead>
                  <TableHead>Access Level</TableHead>
                  <TableHead className="text-center">2FA</TableHead>
                  <TableHead className="text-center">Recovery</TableHead>
                  <TableHead>Last Verified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const isStale =
                    !account.last_verified ||
                    account.last_verified < ninetyDaysAgo
                  return (
                    <TableRow
                      key={account.id}
                      className={cn(
                        isStale &&
                          "bg-amber-500/5 border-l-2 border-l-amber-500/40"
                      )}
                    >
                      <TableCell>
                        <Badge variant="outline">{account.entity}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {account.platform_name}
                      </TableCell>
                      <TableCell>
                        {account.platform_url ? (
                          <a
                            href={account.platform_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-400 underline-offset-4 hover:underline"
                          >
                            Link{" "}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          "\u2014"
                        )}
                      </TableCell>
                      <TableCell>{account.account_holder}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {account.access_level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {account.two_factor_enabled ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <X className="mx-auto h-4 w-4 text-rose-400" />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {account.recovery_documented ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <X className="mx-auto h-4 w-4 text-rose-400" />
                        )}
                      </TableCell>
                      <TableCell>
                        {account.last_verified ? (
                          <span
                            className={cn(
                              isStale && "text-amber-400 font-medium"
                            )}
                          >
                            {formatDate(account.last_verified)}
                          </span>
                        ) : (
                          <span className="text-rose-400 font-medium">
                            Never
                          </span>
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
