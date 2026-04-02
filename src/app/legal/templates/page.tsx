import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { ENTITIES } from "@/lib/constants"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  FileText,
  Plus,
  Sparkles,
  LayoutGrid,
  Hash,
  BarChart3,
  Search,
  Upload,
} from "lucide-react"
import type { DocumentCategory, Entity } from "@/generated/prisma/client"

const CATEGORY_LABELS: Partial<Record<DocumentCategory, string>> = {
  SPONSORSHIP: "Sponsorship",
  VENDOR: "Vendor",
  EMPLOYMENT: "Employment",
  ESOP: "ESOP",
  NDA: "NDA",
  ARENA_HOST: "Arena Host",
  TERMS_OF_SERVICE: "Terms of Service",
  WAIVER: "Waiver",
  IP_ASSIGNMENT: "IP Assignment",
  PILOT_PROGRAM: "Pilot Program",
  BOARD_RESOLUTION: "Board Resolution",
  POLICY: "Policy",
  OTHER: "Other",
}

function getEntityLabel(value: string): string {
  return ENTITIES.find((e) => e.value === value)?.label ?? value
}

const ADMIN_ROLES = ["PLATFORM_ADMIN", "LEGAL_ADMIN"] as const

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role)

  const params = await searchParams
  const entityFilter = typeof params.entity === "string" ? params.entity : ""
  const searchQuery = typeof params.q === "string" ? params.q : ""

  const where: Record<string, unknown> = { is_active: true }
  if (entityFilter) where.entity = entityFilter as Entity
  if (searchQuery) {
    where.name = { contains: searchQuery, mode: "insensitive" }
  }

  const templates = await prisma.contractTemplate.findMany({
    where,
    orderBy: { updated_at: "desc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Contract templates for automated generation
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" render={<Link href="/legal/templates?upload=1" />}>
                <Upload className="size-4" />
                Upload Agreement
              </Button>
              <Button variant="outline">
                <Plus className="size-4" />
                Create Template
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search + Entity Filter */}
      <div className="space-y-3">
        {/* Search bar */}
        <form className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            name="q"
            defaultValue={searchQuery}
            placeholder="Search templates..."
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          />
          {entityFilter && (
            <input type="hidden" name="entity" value={entityFilter} />
          )}
        </form>

        {/* Entity filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-muted-foreground mr-2">Company</span>
          <a
            href={`/legal/templates${searchQuery ? `?q=${searchQuery}` : ""}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              !entityFilter
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            All
          </a>
          {ENTITIES.map((ent) => (
            <a
              key={ent.value}
              href={`/legal/templates?entity=${ent.value}${searchQuery ? `&q=${searchQuery}` : ""}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                entityFilter === ent.value
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {ent.label}
            </a>
          ))}
        </div>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <LayoutGrid className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No templates found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {entityFilter || searchQuery
                ? "Try adjusting your filters or search query."
                : isAdmin
                  ? "Create your first contract template to get started."
                  : "Templates will appear here once an admin creates them."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="line-clamp-1">{template.name}</span>
                  </CardTitle>
                </div>
                <CardDescription className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="secondary">
                    {CATEGORY_LABELS[template.category] ?? template.category}
                  </Badge>
                  {template.entity && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                      {getEntityLabel(template.entity)}
                    </Badge>
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Hash className="size-3" />
                    v{template.version}
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart3 className="size-3" />
                    {template.usage_count} uses
                  </span>
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  render={
                    <Link href={`/legal/generate?template=${template.id}`} />
                  }
                >
                  <Sparkles className="size-3.5" />
                  Use Template
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
