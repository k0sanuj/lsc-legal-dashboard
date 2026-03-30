import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import {
  LIFECYCLE_STATUS_LABELS,
  ENTITIES,
} from "@/lib/constants"
import { formatAED, formatDate, formatRelativeDate } from "@/lib/format"
import { LifecycleBadge } from "@/components/legal/lifecycle-badge"
import { Badge } from "@/components/ui/badge"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FileText,
  Users,
  StickyNote,
  ArrowRight,
} from "lucide-react"
import type { SignatureStatus } from "@/generated/prisma/client"

const SIGNATURE_STATUS_COLORS: Record<SignatureStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  SENT: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  SIGNED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  STALLED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
}

const SIGNATURE_STATUS_LABELS: Record<SignatureStatus, string> = {
  PENDING: "Pending",
  SENT: "Sent",
  SIGNED: "Signed",
  STALLED: "Stalled",
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSession()

  const { id } = await params

  const document = await prisma.legalDocument.findUnique({
    where: { id },
    include: {
      owner: { select: { full_name: true, email: true } },
      versions: { orderBy: { version_number: "desc" } },
      signature_requests: { orderBy: { created_at: "desc" } },
      lifecycle_events: {
        orderBy: { created_at: "desc" },
      },
    },
  })

  if (!document) {
    notFound()
  }

  const entityLabel =
    ENTITIES.find((e) => e.value === document.entity)?.label ?? document.entity

  const parties = (document.parties as string[] | null) ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{document.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <LifecycleBadge status={document.lifecycle_status} />
            <Badge variant="outline">{entityLabel}</Badge>
            <Badge variant="outline">
              {document.category.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          {document.value && (
            <p className="text-2xl font-bold font-figures">
              {formatAED(document.value.toNumber())}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Owner: {document.owner.full_name}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={0}>
        <TabsList variant="line">
          <TabsTrigger value={0}>Overview</TabsTrigger>
          <TabsTrigger value={1}>Versions</TabsTrigger>
          <TabsTrigger value={2}>Signatures</TabsTrigger>
          <TabsTrigger value={3}>Audit Trail</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value={0}>
          <div className="mt-4 space-y-6">
            {/* Document Details */}
            <div className="rounded-xl border border-border/50 bg-card p-6">
              <h3 className="text-base font-semibold mb-4">Document Details</h3>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Category</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {document.category.replace(/_/g, " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Entity</dt>
                  <dd className="mt-1 text-sm font-medium">{entityLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="mt-1">
                    <LifecycleBadge status={document.lifecycle_status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Value</dt>
                  <dd className="mt-1 text-sm font-medium font-figures">
                    {document.value
                      ? formatAED(document.value.toNumber())
                      : "--"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Expiry Date</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {document.expiry_date
                      ? formatDate(document.expiry_date)
                      : "--"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Created</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {formatDate(document.created_at)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Parties */}
            <div className="rounded-xl border border-border/50 bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-base font-semibold">Parties</h3>
              </div>
              {parties.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No parties listed.
                </p>
              ) : (
                <ul className="space-y-2">
                  {parties.map((party, i) => (
                    <li
                      key={i}
                      className="text-sm flex items-center gap-2"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {String(party)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Notes */}
            <div className="rounded-xl border border-border/50 bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <StickyNote className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-base font-semibold">Notes</h3>
              </div>
              {document.notes ? (
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                  {document.notes}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes.</p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Versions Tab */}
        <TabsContent value={1}>
          <div className="mt-4">
            {document.versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
                <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No versions recorded.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/50 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Change Summary</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {document.versions.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-figures font-medium">
                          v{v.version_number}
                        </TableCell>
                        <TableCell>
                          {v.change_summary ?? "No summary"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {v.created_by}
                        </TableCell>
                        <TableCell>{formatDate(v.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Signatures Tab */}
        <TabsContent value={2}>
          <div className="mt-4">
            {document.signature_requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
                <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No signature requests.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {document.signature_requests.map((sig) => (
                  <div
                    key={sig.id}
                    className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-4"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {sig.signatory_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sig.signatory_email}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {sig.sent_at && (
                        <span className="text-xs text-muted-foreground">
                          Sent {formatDate(sig.sent_at)}
                        </span>
                      )}
                      {sig.signed_at && (
                        <span className="text-xs text-muted-foreground">
                          Signed {formatDate(sig.signed_at)}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={SIGNATURE_STATUS_COLORS[sig.status]}
                      >
                        {SIGNATURE_STATUS_LABELS[sig.status]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Audit Trail Tab */}
        <TabsContent value={3}>
          <div className="mt-4">
            {document.lifecycle_events.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
                <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No lifecycle events.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {document.lifecycle_events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-4"
                  >
                    <div className="flex items-center gap-3">
                      <LifecycleBadge status={event.from_status} />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <LifecycleBadge status={event.to_status} />
                      {event.notes && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {event.notes}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeDate(event.created_at)}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {event.transitioned_by}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
