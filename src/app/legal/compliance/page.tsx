import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatDate, daysUntil } from "@/lib/constants"
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AlertCircle, ShieldCheck, Inbox } from "lucide-react"
import { IncomingNoticeForm } from "@/components/legal/incoming-notice-form"
import type { ComplianceStatus, Jurisdiction, NoticeStatus } from "@/generated/prisma/client"

const STATUS_STYLES: Record<ComplianceStatus, string> = {
  UPCOMING: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  DUE_SOON: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  OVERDUE: "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse",
  COMPLETED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
}

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  UPCOMING: "Upcoming",
  DUE_SOON: "Due Soon",
  OVERDUE: "Overdue",
  COMPLETED: "Completed",
}

const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  UAE: "UAE",
  US_DELAWARE: "US / Delaware",
  GLOBAL: "Global",
}

export default async function CompliancePage() {
  await requireSession()

  const deadlines = await prisma.complianceDeadline.findMany({
    orderBy: { deadline_date: "asc" },
  })

  const notices = await prisma.incomingNotice.findMany({
    orderBy: { received_at: "desc" },
    take: 20,
    include: { assignee: { select: { full_name: true } } },
  })

  const overdueCount = deadlines.filter((d) => d.status === "OVERDUE").length

  const byJurisdiction: Record<Jurisdiction, typeof deadlines> = {
    UAE: deadlines.filter((d) => d.jurisdiction === "UAE"),
    US_DELAWARE: deadlines.filter((d) => d.jurisdiction === "US_DELAWARE"),
    GLOBAL: deadlines.filter((d) => d.jurisdiction === "GLOBAL"),
  }

  function renderTable(items: typeof deadlines) {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ShieldCheck className="h-10 w-10 text-muted-foreground/40" />
          <h3 className="mt-4 text-sm font-medium">No deadlines found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No compliance deadlines for this jurisdiction.
          </p>
        </div>
      )
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Linked Document</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const days = daysUntil(item.deadline_date)
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.title}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.category}</Badge>
                </TableCell>
                <TableCell>{formatDate(item.deadline_date)}</TableCell>
                <TableCell
                  className={cn(
                    "tabular-nums",
                    days < 0
                      ? "text-rose-500 font-semibold"
                      : days < 14
                        ? "text-amber-500"
                        : "text-muted-foreground"
                  )}
                >
                  {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={STATUS_STYLES[item.status]}
                  >
                    {STATUS_LABELS[item.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {item.linked_document_id ? (
                    <a
                      href={`/legal/documents/${item.linked_document_id}`}
                      className="text-blue-400 underline-offset-4 hover:underline"
                    >
                      View document
                    </a>
                  ) : (
                    "\u2014"
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compliance</h1>
        <p className="text-muted-foreground">
          Compliance deadlines across all jurisdictions
        </p>
      </div>

      {/* Overdue alert banner */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <AlertCircle className="h-5 w-5 shrink-0 animate-pulse" />
          <span>
            <strong>{overdueCount}</strong> compliance{" "}
            {overdueCount === 1 ? "deadline is" : "deadlines are"} overdue.
            Immediate attention required.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Deadlines by Jurisdiction</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="UAE">
            <TabsList>
              {(Object.keys(byJurisdiction) as Jurisdiction[]).map((j) => (
                <TabsTrigger key={j} value={j}>
                  {JURISDICTION_LABELS[j]}{" "}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({byJurisdiction[j].length})
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            {(Object.keys(byJurisdiction) as Jurisdiction[]).map((j) => (
              <TabsContent key={j} value={j} className="mt-4">
                {renderTable(byJurisdiction[j])}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Incoming Notices */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                Incoming Notices
              </CardTitle>
              <CardDescription>
                Legal notices, complaints, and regulatory communications
              </CardDescription>
            </div>
            <IncomingNoticeForm />
          </div>
        </CardHeader>
        <CardContent>
          {notices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No incoming notices</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No notices have been logged yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notices.map((notice) => (
                  <TableRow key={notice.id}>
                    <TableCell className="font-medium">{notice.subject}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {notice.category.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {notice.from_email ?? "\u2014"}
                    </TableCell>
                    <TableCell>{formatDate(notice.received_at)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {notice.assignee?.full_name ?? "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          notice.status === "NEW" && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                          notice.status === "ACKNOWLEDGED" && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                          notice.status === "IN_PROGRESS" && "bg-violet-500/10 text-violet-400 border-violet-500/20",
                          notice.status === "RESOLVED" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        )}
                      >
                        {notice.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
