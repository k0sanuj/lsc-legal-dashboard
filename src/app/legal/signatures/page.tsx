import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED } from "@/lib/format"
import { SignatureKanban } from "@/components/legal/signature-kanban"

const COLUMNS_CONFIG = [
  { status: "PENDING" as const, title: "Getting Signed", color: "amber" },
  { status: "SENT" as const, title: "Being Signed", color: "blue" },
  { status: "SIGNED" as const, title: "Signed", color: "emerald" },
  { status: "STALLED" as const, title: "Stalled", color: "rose" },
]

function daysInStatus(date: Date): number {
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / 86400000)
}

export default async function SignaturesPage() {
  await requireSession()

  const requests = await prisma.signatureRequest.findMany({
    include: {
      document: {
        select: {
          id: true,
          title: true,
          value: true,
          currency: true,
        },
      },
    },
    orderBy: { updated_at: "desc" },
  })

  const columns = COLUMNS_CONFIG.map((col) => ({
    id: col.status,
    title: col.title,
    color: col.color,
    items: requests
      .filter((r) => r.status === col.status)
      .map((r) => ({
        id: r.id,
        documentTitle: r.document.title,
        signatoryName: r.signatory_name,
        daysInStatus: daysInStatus(r.sent_at ?? r.created_at),
        value: r.document.value
          ? formatAED(r.document.value.toString())
          : null,
        documentId: r.document.id,
      })),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Signatures</h1>
        <p className="text-sm text-muted-foreground">
          Track signature requests across all documents — drag cards to update status
        </p>
      </div>

      <SignatureKanban columns={columns} />
    </div>
  )
}
