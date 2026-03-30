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
import { FileText } from "lucide-react"

export default async function PoliciesPage() {
  await requireSession()

  const policies = await prisma.policyDocument.findMany({
    orderBy: [{ category: "asc" }, { effective_date: "desc" }],
    include: {
      _count: { select: { acknowledgments: true } },
    },
  })

  // Total active users for acknowledgment rate calculation
  const totalUsers = await prisma.appUser.count({ where: { is_active: true } })

  // Determine which policies are the "current" version per title
  const latestVersionByTitle = new Map<string, number>()
  for (const policy of policies) {
    const existing = latestVersionByTitle.get(policy.title) ?? 0
    if (policy.version > existing) {
      latestVersionByTitle.set(policy.title, policy.version)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Policies</h1>
        <p className="text-muted-foreground">
          Company policy repository and acknowledgment tracking
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Policy Documents</CardTitle>
          <CardDescription>
            {policies.length} {policies.length === 1 ? "policy" : "policies"}{" "}
            on record
          </CardDescription>
        </CardHeader>
        <CardContent>
          {policies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">
                No policies recorded
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No policy documents have been uploaded yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Version</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Acknowledgment Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => {
                  const isCurrent =
                    latestVersionByTitle.get(policy.title) === policy.version
                  const ackCount = policy._count.acknowledgments
                  const ackRate =
                    totalUsers > 0
                      ? Math.round((ackCount / totalUsers) * 100)
                      : 0

                  return (
                    <TableRow key={policy.id}>
                      <TableCell className="font-medium">
                        {policy.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{policy.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        v{policy.version}
                      </TableCell>
                      <TableCell>
                        {formatDate(policy.effective_date)}
                      </TableCell>
                      <TableCell>
                        {isCurrent ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          >
                            Current
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-slate-400/10 text-slate-400 border-slate-400/20"
                          >
                            Superseded
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {policy.acknowledgment_required ? (
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  ackRate >= 80
                                    ? "bg-emerald-500"
                                    : ackRate >= 50
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                )}
                                style={{ width: `${Math.min(ackRate, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {ackRate}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Not required
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
