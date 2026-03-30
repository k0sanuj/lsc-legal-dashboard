import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  PenLine,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  User,
} from "lucide-react"
import type { SignatureStatus } from "@/generated/prisma/client"

const COLUMNS: {
  status: SignatureStatus
  label: string
  borderColor: string
  bgColor: string
  icon: React.ReactNode
}[] = [
  {
    status: "PENDING",
    label: "Getting Signed",
    borderColor: "border-t-amber-500",
    bgColor: "bg-amber-500/10 text-amber-400",
    icon: <PenLine className="size-4" />,
  },
  {
    status: "SENT",
    label: "Being Signed",
    borderColor: "border-t-blue-500",
    bgColor: "bg-blue-500/10 text-blue-400",
    icon: <Send className="size-4" />,
  },
  {
    status: "SIGNED",
    label: "Signed",
    borderColor: "border-t-emerald-500",
    bgColor: "bg-emerald-500/10 text-emerald-400",
    icon: <CheckCircle2 className="size-4" />,
  },
  {
    status: "STALLED",
    label: "Stalled",
    borderColor: "border-t-rose-500",
    bgColor: "bg-rose-500/10 text-rose-400",
    icon: <AlertTriangle className="size-4" />,
  },
]

function daysInStatus(updatedAt: Date): number {
  const now = new Date()
  return Math.floor((now.getTime() - updatedAt.getTime()) / 86400000)
}

export default async function SignaturesPage() {
  await requireSession()

  const requests = await prisma.signatureRequest.findMany({
    include: {
      document: {
        select: {
          title: true,
          value: true,
          currency: true,
        },
      },
    },
    orderBy: { updated_at: "desc" },
  })

  const grouped = COLUMNS.map((col) => ({
    ...col,
    items: requests.filter((r) => r.status === col.status),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Signatures</h1>
        <p className="text-sm text-muted-foreground">
          Track signature requests across all documents
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {grouped.map((column) => (
          <Card
            key={column.status}
            className={cn("border-t-4", column.borderColor)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {column.icon}
                  {column.label}
                </CardTitle>
                <Badge variant="secondary" className="tabular-nums">
                  {column.items.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {column.items.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No requests
                </p>
              ) : (
                column.items.map((req) => {
                  const days = daysInStatus(req.updated_at)
                  return (
                    <div
                      key={req.id}
                      className="rounded-lg border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium leading-snug line-clamp-2">
                          {req.document.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <User className="size-3" />
                        <span>{req.signatory_name}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          <span>
                            {days === 0
                              ? "Today"
                              : `${days}d in status`}
                          </span>
                        </div>
                        {req.document.value && (
                          <span className="text-xs font-medium tabular-nums">
                            {formatAED(req.document.value.toString())}
                          </span>
                        )}
                      </div>

                      {req.stalled_reason && (
                        <p className="text-xs text-rose-400">
                          {req.stalled_reason}
                        </p>
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
