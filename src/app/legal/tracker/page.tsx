import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import {
  TRACKER_CATEGORY_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
} from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { PriorityBadge } from "@/components/legal/priority-badge"
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
import { ClipboardList } from "lucide-react"
import type { TrackerCategory, TrackerStatus } from "@/generated/prisma/client"

const TRACKER_STATUS_LABELS: Record<TrackerStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  BLOCKED: "Blocked",
  COMPLETE: "Complete",
}

const TRACKER_STATUS_COLORS: Record<TrackerStatus, string> = {
  NOT_STARTED: "bg-slate-400/10 text-slate-400 border-slate-400/20",
  IN_PROGRESS: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  IN_REVIEW: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  BLOCKED: "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse",
  COMPLETE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
}

const TRACKER_CATEGORY_COLORS: Record<TrackerCategory, string> = {
  PLATFORM: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  VAUNT_ACQUISITION: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  KEY_AGREEMENTS: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  CORPORATE: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  PAYMENTS: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  IP_PATENTS: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  GIG_MARKETING: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  OTHER: "bg-slate-400/10 text-slate-400 border-slate-400/20",
}

const PRIORITY_ROW_COLORS: Record<string, string> = {
  CRITICAL: "border-l-2 border-l-rose-500",
  HIGH: "border-l-2 border-l-amber-500",
  MEDIUM: "border-l-2 border-l-blue-500",
  LOW: "",
}

const TAB_ORDER: TrackerCategory[] = [
  "PLATFORM",
  "VAUNT_ACQUISITION",
  "KEY_AGREEMENTS",
  "CORPORATE",
  "PAYMENTS",
  "IP_PATENTS",
  "GIG_MARKETING",
  "OTHER",
]

export default async function TrackerPage() {
  await requireSession()

  const items = await prisma.trackerItem.findMany({
    orderBy: [{ priority: "asc" }, { ref_code: "asc" }],
  })

  const byCategory = new Map<TrackerCategory, typeof items>()
  for (const cat of TAB_ORDER) {
    byCategory.set(
      cat,
      items.filter((item) => item.category === cat)
    )
  }

  // Only show tabs that have items, plus always show the first few main categories
  const activeTabs = TAB_ORDER.filter(
    (cat) => (byCategory.get(cat)?.length ?? 0) > 0
  )
  const defaultTab = activeTabs[0] ?? "PLATFORM"

  function renderTable(categoryItems: typeof items) {
    if (categoryItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
          <h3 className="mt-4 text-sm font-medium">
            No items in this category
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No tracker items have been added to this category yet.
          </p>
        </div>
      )
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Ref Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Dependencies</TableHead>
            <TableHead>Assigned To</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categoryItems.map((item) => (
            <TableRow
              key={item.id}
              className={PRIORITY_ROW_COLORS[item.priority] ?? ""}
            >
              <TableCell className="font-mono text-xs font-medium">
                {item.ref_code}
              </TableCell>
              <TableCell className="font-medium max-w-[300px] truncate">
                {item.title}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={TRACKER_CATEGORY_COLORS[item.category]}
                >
                  {TRACKER_CATEGORY_LABELS[item.category]}
                </Badge>
              </TableCell>
              <TableCell>
                <PriorityBadge priority={item.priority} />
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={TRACKER_STATUS_COLORS[item.status]}
                >
                  {TRACKER_STATUS_LABELS[item.status]}
                </Badge>
              </TableCell>
              <TableCell>
                {item.dependency_refs.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {item.dependency_refs.map((ref) => (
                      <Badge
                        key={ref}
                        variant="secondary"
                        className="font-mono text-xs"
                      >
                        {ref}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">{"\u2014"}</span>
                )}
              </TableCell>
              <TableCell>
                {item.assigned_to ?? (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Legal Tracker</h1>
        <p className="text-muted-foreground">
          Master 85-item legal tracker across all categories
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tracker Items</CardTitle>
          <CardDescription>
            {items.length} total items across {activeTabs.length} categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">
                No tracker items yet
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The legal tracker is empty. Add items to get started.
              </p>
            </div>
          ) : (
            <Tabs defaultValue={defaultTab}>
              <TabsList className="flex-wrap">
                {activeTabs.map((cat) => (
                  <TabsTrigger key={cat} value={cat}>
                    {TRACKER_CATEGORY_LABELS[cat]}{" "}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({byCategory.get(cat)?.length ?? 0})
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {activeTabs.map((cat) => (
                <TabsContent key={cat} value={cat} className="mt-4">
                  {renderTable(byCategory.get(cat) ?? [])}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
