import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { formatDate, ENTITIES } from "@/lib/constants"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  ClipboardCheck,
  FileCheck,
  Users,
  Search,
} from "lucide-react"
import type { Entity } from "@/generated/prisma/client"

export default async function ClickwrapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSession()

  const params = await searchParams
  const search =
    typeof params.search === "string" ? params.search.trim() : ""
  const agreementFilter =
    typeof params.agreement === "string" ? params.agreement : ""
  const entityFilter =
    typeof params.entity === "string" ? params.entity : ""

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { person_name: { contains: search, mode: "insensitive" } },
      { person_email: { contains: search, mode: "insensitive" } },
    ]
  }
  if (agreementFilter) {
    where.agreement_title = { contains: agreementFilter, mode: "insensitive" }
  }
  if (entityFilter) {
    where.entity = entityFilter as Entity
  }

  const acceptances = await prisma.clickwrapAcceptance.findMany({
    where,
    orderBy: { accepted_at: "desc" },
    take: 100,
  })

  // Summary stats
  const totalAcceptances = acceptances.length
  const uniqueAgreements = new Set(acceptances.map((a) => a.agreement_title))
    .size
  const uniquePeople = new Set(acceptances.map((a) => a.person_email)).size

  // Get distinct agreement titles for filter dropdown
  const allAgreements = await prisma.clickwrapAcceptance.findMany({
    select: { agreement_title: true },
    distinct: ["agreement_title"],
    orderBy: { agreement_title: "asc" },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Clickwrap Acceptance Tracker
        </h1>
        <p className="text-muted-foreground">
          Track digital agreement acceptances across all entities
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Acceptances
            </CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono tabular-nums">
              {totalAcceptances}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unique Agreements
            </CardTitle>
            <FileCheck className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono tabular-nums text-blue-400">
              {uniqueAgreements}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unique People
            </CardTitle>
            <Users className="h-4 w-4 text-violet-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono tabular-nums text-violet-400">
              {uniquePeople}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            defaultValue={search}
            className="pl-9"
            readOnly
          />
        </div>
        <Select defaultValue={agreementFilter || undefined}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All agreements" />
          </SelectTrigger>
          <SelectContent>
            {allAgreements.map((a) => (
              <SelectItem key={a.agreement_title} value={a.agreement_title}>
                {a.agreement_title}
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

      {/* Acceptances Table */}
      {acceptances.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-16">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No clickwrap acceptances found.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Agreement Title</TableHead>
                <TableHead className="text-center">Version</TableHead>
                <TableHead>Accepted At</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acceptances.map((acc) => (
                <TableRow key={acc.id}>
                  <TableCell className="font-medium">
                    {acc.person_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {acc.person_email}
                  </TableCell>
                  <TableCell>{acc.agreement_title}</TableCell>
                  <TableCell className="text-center font-mono tabular-nums">
                    v{acc.agreement_version}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {formatDate(acc.accepted_at)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(acc.accepted_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    {acc.entity ? (
                      <Badge variant="outline">{acc.entity}</Badge>
                    ) : (
                      "\u2014"
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {acc.ip_address ?? "\u2014"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
