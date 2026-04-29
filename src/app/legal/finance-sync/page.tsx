import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
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
import { Activity, CheckCircle2, AlertCircle, Clock } from "lucide-react"
import { ReplayButton } from "./replay-button"

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function FinanceSyncPage() {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN"])

  const events = await prisma.crossModuleEvent.findMany({
    where: { source: "legal" },
    orderBy: { created_at: "desc" },
    take: 200,
  })

  const total = events.length
  const synced = events.filter((e) => e.processed).length
  const failed = events.filter((e) => !e.processed).length
  const abandoned = events.filter((e) => {
    const p = e.payload as Record<string, unknown>
    return p?._abandoned === true
  }).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Finance Sync</h1>
        <p className="text-muted-foreground">
          Outbound webhook events to the Finance dashboard
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total"
          value={total}
          icon={Activity}
          colorClass="text-blue-400"
          bgClass="bg-blue-500/10"
        />
        <SummaryCard
          label="Synced"
          value={synced}
          icon={CheckCircle2}
          colorClass="text-emerald-400"
          bgClass="bg-emerald-500/10"
        />
        <SummaryCard
          label="Failed / pending"
          value={failed - abandoned}
          icon={Clock}
          colorClass="text-amber-400"
          bgClass="bg-amber-500/10"
        />
        <SummaryCard
          label="Abandoned"
          value={abandoned}
          icon={AlertCircle}
          colorClass="text-rose-400"
          bgClass="bg-rose-500/10"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent webhook events</CardTitle>
          <CardDescription>
            Most recent 200 events. Failed events retry automatically every 15 min for ~1.5h
            then become abandoned. Use Replay to re-queue an abandoned event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No webhook events yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create or update a payment tranche or equity grant to fire your first event.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Linked Row</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Last error</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => {
                  const p = (e.payload as Record<string, unknown>) ?? {}
                  const lastAttempt = p._last_attempt as
                    | { count?: number; status?: number; error?: string | null }
                    | undefined
                  const isAbandoned = p._abandoned === true
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">
                        <div>{formatDateTime(e.created_at)}</div>
                        <div className="text-muted-foreground">{e.id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {e.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div>{e.entity_type}</div>
                        <div className="font-mono">{e.entity_id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell>
                        {e.processed ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          >
                            Synced
                          </Badge>
                        ) : isAbandoned ? (
                          <Badge
                            variant="outline"
                            className="bg-rose-500/10 text-rose-400 border-rose-500/20"
                          >
                            Abandoned
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-400 border-amber-500/20"
                          >
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {lastAttempt?.count ?? 0}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "max-w-[280px] truncate text-xs",
                          lastAttempt?.error ? "text-rose-400" : "text-muted-foreground"
                        )}
                        title={lastAttempt?.error ?? ""}
                      >
                        {lastAttempt?.error
                          ? `${lastAttempt.status ?? "?"} — ${lastAttempt.error}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {!e.processed && <ReplayButton eventId={e.id} />}
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

function SummaryCard({
  label,
  value,
  icon: Icon,
  colorClass,
  bgClass,
}: {
  label: string
  value: number
  icon: typeof Activity
  colorClass: string
  bgClass: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <div className={cn("rounded-md p-2", bgClass)}>
          <Icon className={cn("h-4 w-4", colorClass)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}
