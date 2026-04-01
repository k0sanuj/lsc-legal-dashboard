import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
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
import { Lock, Unlock, Settings2, Plus } from "lucide-react"
import { toggleTableLock, createTableConfig } from "@/actions/table-config"

export default async function TableConfigPage() {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN"])

  const configs = await prisma.dashboardTableConfig.findMany({
    orderBy: { table_key: "asc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Table Configuration</h1>
          <p className="text-muted-foreground">
            Manage locked table layouts — locked tables have fixed columns and sort order
          </p>
        </div>
        <form action={createTableConfig}>
          <button
            type="submit"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-4" />
            Seed Defaults
          </button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="size-4" />
            Dashboard Tables
          </CardTitle>
          <CardDescription>
            {configs.length} table configurations &middot;{" "}
            {configs.filter((c) => c.locked).length} locked
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Settings2 className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-sm font-medium">No table configurations</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Click &quot;Seed Defaults&quot; to create standard locked table layouts.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Sort Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => {
                  const columns = Array.isArray(config.columns) ? config.columns as string[] : []
                  const sortOrder = config.sort_order as { field: string; direction: string } | null

                  return (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">{config.table_key}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {columns.map((col, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">
                              {String(col)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {sortOrder ? `${sortOrder.field} ${sortOrder.direction}` : "Default"}
                      </TableCell>
                      <TableCell>
                        {config.locked ? (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20">
                            <Lock className="size-2.5 mr-1" />
                            Locked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            <Unlock className="size-2.5 mr-1" />
                            Unlocked
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(config.updated_at)}
                        {config.updated_by && (
                          <span className="block text-muted-foreground/50">
                            by {config.updated_by}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={toggleTableLock}>
                          <input type="hidden" name="configId" value={config.id} />
                          <input type="hidden" name="locked" value={config.locked ? "false" : "true"} />
                          <button
                            type="submit"
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                              config.locked
                                ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                            }`}
                          >
                            {config.locked ? "Unlock" : "Lock"}
                          </button>
                        </form>
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
