import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { formatRelativeDate } from "@/lib/format"
import { ENTITIES } from "@/lib/constants"
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
import { MessageSquare, FileText } from "lucide-react"
import Link from "next/link"

function daysInReview(updatedAt: Date): number {
  return Math.floor((Date.now() - updatedAt.getTime()) / 86400000)
}

export default async function ReviewQueuePage() {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const documents = await prisma.legalDocument.findMany({
    where: { lifecycle_status: "IN_REVIEW" },
    orderBy: { updated_at: "asc" },
    include: {
      owner: { select: { full_name: true } },
      _count: {
        select: {
          comments: { where: { resolved: false } },
        },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-muted-foreground">
          Documents currently in review with unresolved comments
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            In Review
          </CardTitle>
          <CardDescription>
            {documents.length} {documents.length === 1 ? "document" : "documents"} awaiting review
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">Review queue is empty</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No documents are currently in review.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Unresolved Comments</TableHead>
                  <TableHead className="text-right">Days in Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const days = daysInReview(doc.updated_at)
                  const entityLabel = ENTITIES.find((e) => e.value === doc.entity)?.label ?? doc.entity
                  return (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <Link
                          href={`/legal/documents/${doc.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {doc.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{entityLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {doc.owner.full_name}
                      </TableCell>
                      <TableCell className="text-right">
                        {doc._count.comments > 0 ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                            {doc._count.comments}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${days > 7 ? 'text-rose-400 font-semibold' : days > 3 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                        {days}d
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
