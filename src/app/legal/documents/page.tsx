import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { LIFECYCLE_STATUS_LABELS, ENTITIES } from "@/lib/constants"
import { formatAED, formatDate, daysUntil } from "@/lib/format"
import { LifecycleBadge } from "@/components/legal/lifecycle-badge"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FileText, Search, ExternalLink } from "lucide-react"
import Link from "next/link"
import type { LifecycleStatus, Entity } from "@/generated/prisma/client"

export default async function DocumentsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSession()

  const params = await searchParams
  const search = typeof params.search === "string" ? params.search : ""
  const statusFilter = typeof params.status === "string" ? params.status : ""
  const entityFilter = typeof params.entity === "string" ? params.entity : ""

  try {
    const where: Record<string, unknown> = {}

    if (search) {
      where.title = { contains: search, mode: "insensitive" }
    }
    if (statusFilter && statusFilter in LIFECYCLE_STATUS_LABELS) {
      where.lifecycle_status = statusFilter as LifecycleStatus
    }
    if (entityFilter) {
      where.entity = entityFilter as Entity
    }

    const documents = await prisma.legalDocument.findMany({
      where,
      orderBy: { updated_at: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        category: true,
        lifecycle_status: true,
        entity: true,
        value: true,
        expiry_date: true,
        updated_at: true,
        file_url: true,
      },
    })

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and track all legal documents
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              defaultValue={search}
              className="pl-9"
              readOnly
            />
          </div>
          <Select defaultValue={statusFilter || undefined}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {(
                Object.entries(LIFECYCLE_STATUS_LABELS) as [LifecycleStatus, string][]
              ).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select defaultValue={entityFilter || undefined}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All entities" />
            </SelectTrigger>
            <SelectContent>
              {ENTITIES.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Documents Table */}
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-16">
            <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No documents found.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Expiry Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Link
                        href={`/legal/documents/${doc.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {doc.title}
                      </Link>
                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-muted-foreground hover:text-primary" title="Open file">
                          <ExternalLink className="h-3 w-3 inline" />
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {doc.category.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <LifecycleBadge status={doc.lifecycle_status} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{doc.entity}</Badge>
                    </TableCell>
                    <TableCell className="font-figures">
                      {doc.value ? formatAED(doc.value.toNumber()) : "--"}
                    </TableCell>
                    <TableCell>
                      {doc.expiry_date ? (
                        <span
                          className={
                            daysUntil(doc.expiry_date) <= 30
                              ? "text-rose-400"
                              : ""
                          }
                        >
                          {formatDate(doc.expiry_date)}
                        </span>
                      ) : (
                        "--"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    )
  } catch {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and track all legal documents
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-16">
          <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            Unable to load documents. Please check the database connection.
          </p>
        </div>
      </div>
    )
  }
}
