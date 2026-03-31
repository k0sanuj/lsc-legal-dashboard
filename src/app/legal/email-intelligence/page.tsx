import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatAED, formatDate } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import {
  Mail,
  FileSearch,
  Check,
  X,
  ShieldCheck,
  Clock,
  ArrowRightLeft,
  Tag,
} from "lucide-react"
import type { EmailTag } from "@/generated/prisma/client"

const VERIFICATION_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  verified: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rejected: "bg-rose-500/10 text-rose-400 border-rose-500/20",
}

const TAG_STYLES: Record<EmailTag, string> = {
  INVOICE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  LEGAL_NOTICE: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  AGREEMENT: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  CORRESPONDENCE: "bg-slate-400/10 text-slate-400 border-slate-400/20",
  MARKETING: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  INTERNAL: "bg-sky-500/10 text-sky-400 border-sky-500/20",
}

const TAG_LABELS: Record<EmailTag, string> = {
  INVOICE: "Invoice",
  LEGAL_NOTICE: "Legal Notice",
  AGREEMENT: "Agreement",
  CORRESPONDENCE: "Correspondence",
  MARKETING: "Marketing",
  INTERNAL: "Internal",
}

export default async function EmailIntelligencePage() {
  await requireSession()

  const [invoices, emailTags] = await Promise.all([
    prisma.detectedInvoice.findMany({
      orderBy: { created_at: "desc" },
      take: 100,
    }),
    prisma.emailTagRecord.findMany({
      orderBy: { created_at: "desc" },
      take: 100,
    }),
  ])

  // Invoice summary stats
  const totalDetected = invoices.length
  const pendingVerification = invoices.filter(
    (i) => i.verification_status === "pending"
  ).length
  const verified = invoices.filter(
    (i) => i.verification_status === "verified"
  ).length
  const routedToFinance = invoices.filter((i) => i.routed_to_finance).length

  // Email tag counts
  const tagCounts: Record<string, number> = {}
  for (const tag of emailTags) {
    tagCounts[tag.tag] = (tagCounts[tag.tag] || 0) + 1
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Email Intelligence
        </h1>
        <p className="text-muted-foreground">
          AI-detected invoices and auto-tagged email classifications
        </p>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileSearch className="h-4 w-4" />
            Detected Invoices
            <span className="ml-1 text-xs text-muted-foreground">
              ({totalDetected})
            </span>
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-1.5">
            <Tag className="h-4 w-4" />
            Email Tags
            <span className="ml-1 text-xs text-muted-foreground">
              ({emailTags.length})
            </span>
          </TabsTrigger>
        </TabsList>

        {/* ── Section A: Detected Invoices ──────────────────────────── */}
        <TabsContent value="invoices" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Detected
                </CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono tabular-nums">
                  {totalDetected}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pending Verification
                </CardTitle>
                <Clock className="h-4 w-4 text-amber-400" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                  {pendingVerification}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Verified
                </CardTitle>
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                  {verified}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Routed to Finance
                </CardTitle>
                <ArrowRightLeft className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono tabular-nums text-blue-400">
                  {routedToFinance}
                </p>
              </CardContent>
            </Card>
          </div>

          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-16">
              <FileSearch className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No detected invoices yet.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead className="text-center">Math Check</TableHead>
                    <TableHead className="text-center">Routed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">
                        {inv.vendor_name}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {formatAED(inv.amount.toNumber())}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.currency}
                      </TableCell>
                      <TableCell>
                        {inv.invoice_date
                          ? formatDate(inv.invoice_date)
                          : "\u2014"}
                      </TableCell>
                      <TableCell>
                        {inv.entity ? (
                          <Badge variant="outline">{inv.entity}</Badge>
                        ) : (
                          "\u2014"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            VERIFICATION_STYLES[inv.verification_status] ??
                            "bg-slate-400/10 text-slate-400 border-slate-400/20"
                          }
                        >
                          {inv.verification_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {inv.math_check_passed ? (
                          <Check className="inline h-4 w-4 text-emerald-400" />
                        ) : (
                          <X className="inline h-4 w-4 text-rose-400" />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {inv.routed_to_finance ? (
                          <Check className="inline h-4 w-4 text-emerald-400" />
                        ) : (
                          <X className="inline h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Section B: Email Tags ─────────────────────────────────── */}
        <TabsContent value="tags" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {(Object.keys(TAG_LABELS) as EmailTag[]).map((tag) => (
              <Card key={tag}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    {TAG_LABELS[tag]}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold font-mono tabular-nums">
                    {tagCounts[tag] ?? 0}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {emailTags.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-16">
              <Tag className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No email tags recorded yet.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                    <TableHead className="text-center">Processed</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailTags.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell className="font-medium max-w-75 truncate">
                        {rec.subject}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-50 truncate">
                        {rec.from_addr}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={TAG_STYLES[rec.tag]}
                        >
                          {TAG_LABELS[rec.tag]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {(rec.confidence * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-center">
                        {rec.processed ? (
                          <Check className="inline h-4 w-4 text-emerald-400" />
                        ) : (
                          <X className="inline h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>{formatDate(rec.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
