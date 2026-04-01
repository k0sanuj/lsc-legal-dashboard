import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatDate } from "@/lib/constants"
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
import { FileText, Check, X, ArrowRight } from "lucide-react"
import { approveFileRename, rejectFileRename } from "@/actions/file-naming"

export default async function FileNamingPage() {
  await requireSession()

  const logs = await prisma.fileNamingLog.findMany({
    orderBy: { created_at: "desc" },
    take: 100,
  })

  const pending = logs.filter((l) => !l.approved && !l.approved_by)
  const processed = logs.filter((l) => l.approved_by)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">File Naming</h1>
        <p className="text-muted-foreground">
          AI-suggested file names following the{" "}
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
            [ENTITY]_[CATEGORY]_[COUNTERPARTY]_[DATE]_[VERSION].ext
          </code>{" "}
          convention
        </p>
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-amber-400" />
              Pending Approval
            </CardTitle>
            <CardDescription>
              {pending.length} file rename{pending.length !== 1 ? "s" : ""} awaiting review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Original Name</TableHead>
                  <TableHead />
                  <TableHead>Suggested Name</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-48 truncate">
                      {log.original_name}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="size-3.5 text-muted-foreground/50" />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-emerald-400 max-w-48 truncate">
                      {log.renamed_to}
                    </TableCell>
                    <TableCell>
                      {log.entity && <Badge variant="outline">{log.entity}</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.category}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <form action={approveFileRename}>
                          <input type="hidden" name="logId" value={log.id} />
                          <button
                            type="submit"
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          >
                            <Check className="size-3" />
                            Approve
                          </button>
                        </form>
                        <form action={rejectFileRename}>
                          <input type="hidden" name="logId" value={log.id} />
                          <button
                            type="submit"
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                          >
                            <X className="size-3" />
                            Reject
                          </button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Rename History</CardTitle>
          <CardDescription>
            {logs.length} total rename suggestions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No rename suggestions yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                When documents are uploaded, the AI agent will suggest standardized names.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Original</TableHead>
                  <TableHead>Suggested</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-40 truncate">
                      {log.original_name}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-40 truncate">
                      {log.renamed_to}
                    </TableCell>
                    <TableCell>
                      {log.entity && <Badge variant="outline">{log.entity}</Badge>}
                    </TableCell>
                    <TableCell>
                      {log.approved ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Approved
                        </Badge>
                      ) : log.approved_by ? (
                        <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20">
                          Rejected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(log.created_at)}
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
