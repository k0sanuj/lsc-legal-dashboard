import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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
import { Activity, AlertTriangle, Clock, FileWarning, MessagesSquare, Webhook } from "lucide-react"

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusClass(status: string) {
  if (["processed", "synced", "complete"].includes(status)) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  }
  if (["failed", "stalled"].includes(status.toLowerCase())) {
    return "border-rose-500/20 bg-rose-500/10 text-rose-300"
  }
  return "border-amber-500/20 bg-amber-500/10 text-amber-300"
}

export default async function OpsMonitorPage() {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const [webhooks, agentFailures, financeFailures, signatureDocs, pendingMessages, missingAnalysisDocs] =
    await Promise.all([
    prisma.webhookEventLog.findMany({
      orderBy: { created_at: "desc" },
      take: 50,
    }),
    prisma.agentActivityLog.findMany({
      where: {
        action: {
          in: [
            "run_failed",
            "ai_call_failed",
            "ai_provider_failed",
            "parse_failed",
            "message_processing_failed",
            "unsupported_message_intent",
          ],
        },
      },
      orderBy: { created_at: "desc" },
      take: 50,
    }),
    prisma.crossModuleEvent.findMany({
      where: { source: "legal", processed: false },
      orderBy: { created_at: "desc" },
      take: 50,
    }),
    prisma.legalDocument.findMany({
      where: {
        OR: [
          { signature_status: { in: ["SENT", "STALLED"] } },
          { signature_requests: { some: { status: { in: ["SENT", "STALLED"] } } } },
        ],
      },
      orderBy: { updated_at: "desc" },
      take: 50,
      include: {
        signature_requests: true,
      },
    }),
    prisma.agentMessage.findMany({
      where: { responded: false },
      orderBy: { created_at: "asc" },
      take: 50,
    }),
    prisma.legalDocument.findMany({
      where: {
        file_url: { not: null },
        analyses: { none: {} },
      },
      orderBy: { updated_at: "desc" },
      take: 50,
      select: { id: true, title: true, updated_at: true, lifecycle_status: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ops Monitor</h1>
        <p className="text-muted-foreground">
          Webhooks, agent failures, Finance queue state, and signature envelopes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <SummaryCard label="Webhook events" value={webhooks.length} icon={Webhook} />
        <SummaryCard label="Agent failures" value={agentFailures.length} icon={AlertTriangle} />
        <SummaryCard label="Finance pending" value={financeFailures.length} icon={Activity} />
        <SummaryCard label="Signature watch" value={signatureDocs.length} icon={Clock} />
        <SummaryCard label="Pending messages" value={pendingMessages.length} icon={MessagesSquare} />
        <SummaryCard label="Missing analysis" value={missingAnalysisDocs.length} icon={FileWarning} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Webhook Events</CardTitle>
          <CardDescription>Latest provider callbacks after signature and Gmail hardening.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-mono text-xs">{formatDateTime(event.created_at)}</TableCell>
                  <TableCell>{event.provider}</TableCell>
                  <TableCell className="font-mono text-xs">{event.event_type}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusClass(event.processing_status)}>
                      {event.processing_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[360px] truncate text-xs text-rose-300">
                    {event.error ?? "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agent Failures</CardTitle>
            <CardDescription>Analyzer and lifecycle AI failures that need operator review.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentFailures.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{formatDateTime(log.created_at)}</TableCell>
                    <TableCell>{log.agent_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass("failed")}>{log.action}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signature Envelopes</CardTitle>
            <CardDescription>Sent, stalled, or declined signature work requiring attention.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Signed</TableHead>
                  <TableHead>Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signatureDocs.map((doc) => {
                  const signed = doc.signature_requests.filter((request) => request.status === "SIGNED").length
                  const pending = doc.signature_requests.filter((request) => request.status !== "SIGNED").length
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="max-w-[260px] truncate font-medium">{doc.title}</TableCell>
                      <TableCell>{doc.signature_provider ?? "manual"}</TableCell>
                      <TableCell className="font-mono text-xs">{signed}</TableCell>
                      <TableCell className="font-mono text-xs">{pending}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pending Agent Messages</CardTitle>
            <CardDescription>Messages not marked responded because no real handler completed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Intent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingMessages.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="font-mono text-xs">{formatDateTime(message.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{message.to_agent}</TableCell>
                    <TableCell className="font-mono text-xs">{message.intent}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents Missing Analysis</CardTitle>
            <CardDescription>Uploaded legal files without a persisted DocumentAnalysis row.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Updated</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missingAnalysisDocs.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-mono text-xs">{formatDateTime(doc.updated_at)}</TableCell>
                    <TableCell className="max-w-[260px] truncate font-medium">{doc.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass("pending")}>
                        {doc.lifecycle_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Finance Queue Failures</CardTitle>
          <CardDescription>Unprocessed Legal to Finance events awaiting retry or replay.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {financeFailures.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-mono text-xs">{formatDateTime(event.created_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{event.event_type}</TableCell>
                  <TableCell>
                    <div>{event.entity_type}</div>
                    <div className="font-mono text-xs text-muted-foreground">{event.entity_id.slice(0, 8)}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof Activity
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <div className="rounded-md bg-blue-500/10 p-2">
          <Icon className="h-4 w-4 text-blue-300" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}
