import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
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

const ENTITY_LABELS: Partial<Record<Entity, string>> = {
  LSC: "LSC",
  TBR: "TBR",
  FSP: "FSP",
  BOWLING: "Bowling",
  SQUASH: "Squash",
  BASKETBALL: "Basketball",
  BEER_PONG: "Beer Pong",
  PADEL: "Padel",
  FOUNDATION: "Foundation",
}

const ADMIN_ROLES = ["PLATFORM_ADMIN", "LEGAL_ADMIN"] as const

export default async function TemplatesPage() {
  const session = await requireSession()
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role)

  const templates = await prisma.contractTemplate.findMany({
    where: { is_active: true },
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
        {isAdmin && (
          <Button variant="outline">
            <Plus className="size-4" />
            Create Template
          </Button>
        )}
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <LayoutGrid className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No templates yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAdmin
                ? "Create your first contract template to get started"
                : "Templates will appear here once an admin creates them"}
            </p>
            {isAdmin && (
              <Button variant="outline" className="mt-4">
                <Plus className="size-4" />
                Create Template
              </Button>
            )}
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
                    <Badge variant="outline">
                      {ENTITY_LABELS[template.entity] ?? template.entity}
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
                    <Link href="/legal/generate" />
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
