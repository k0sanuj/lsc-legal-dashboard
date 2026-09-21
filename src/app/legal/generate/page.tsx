// Shows drafting availability before loading templates or the interactive form.
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { CONTRACT_GENERATION_PAUSED, CONTRACT_GENERATION_PAUSED_MESSAGE } from "@/lib/contract-generation"
import { ENTITIES } from "@/lib/constants"
import { Sparkles } from "lucide-react"
import { GenerateForm } from "./generate-form"

const DEFAULT_VARIABLES = [
  { key: "counterparty", label: "Counterparty Name", placeholder: "e.g. Acme Corp" },
  { key: "effective_date", label: "Effective Date", placeholder: "e.g. 2026-04-01" },
  { key: "term_months", label: "Term (months)", placeholder: "e.g. 12" },
  { key: "value", label: "Contract Value (AED)", placeholder: "e.g. 50000" },
]

type TemplateVariable = {
  key: string
  label: string
  placeholder: string
}

function normalizeVariableKey(value: string) {
  return value
    .trim()
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function labelFromKey(key: string) {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function normalizeTemplateVariables(value: unknown): TemplateVariable[] {
  if (!Array.isArray(value)) return DEFAULT_VARIABLES

  const variables = value
    .map((item) => {
      if (typeof item === "string") {
        const key = normalizeVariableKey(item)
        if (!key) return null
        const label = labelFromKey(key)
        return { key, label, placeholder: `Enter ${label.toLowerCase()}` }
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>
        const rawKey = record.key ?? record.name ?? record.label
        if (typeof rawKey !== "string") return null
        const key = normalizeVariableKey(rawKey)
        if (!key) return null
        const label =
          typeof record.label === "string" && record.label.trim()
            ? record.label.trim()
            : labelFromKey(key)
        const placeholder =
          typeof record.placeholder === "string" && record.placeholder.trim()
            ? record.placeholder.trim()
            : `Enter ${label.toLowerCase()}`
        return { key, label, placeholder }
      }

      return null
    })
    .filter((item): item is TemplateVariable => Boolean(item))

  return variables.length > 0 ? variables : DEFAULT_VARIABLES
}

export default async function GeneratePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["PLATFORM_ADMIN", "FINANCE_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  if (CONTRACT_GENERATION_PAUSED) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">AI Contract Generator</h1>
        <section aria-labelledby="generation-status" className="border-t border-border py-6">
          <h2 id="generation-status" className="text-lg font-semibold">Generation paused</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {CONTRACT_GENERATION_PAUSED_MESSAGE}
          </p>
          <div className="mt-5 flex flex-wrap gap-6 text-sm">
            <Link href="/legal/documents" className="text-primary underline underline-offset-4">
              View documents
            </Link>
            <Link href="/legal/templates" className="text-primary underline underline-offset-4">
              View templates
            </Link>
          </div>
        </section>
      </div>
    )
  }

  const params = await searchParams
  const preselectedTemplate = typeof params.template === 'string' ? params.template : undefined

  const dbTemplates = await prisma.contractTemplate.findMany({
    where: { is_active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      variables: true,
    },
  })

  const templates = dbTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    variables: normalizeTemplateVariables(t.variables),
  }))

  // If no templates in DB, provide defaults
  if (templates.length === 0) {
    templates.push(
      { id: "nda-standard", name: "Standard NDA", category: "NDA", variables: DEFAULT_VARIABLES },
      { id: "sponsorship-agreement", name: "Sponsorship Agreement", category: "SPONSORSHIP", variables: DEFAULT_VARIABLES },
      { id: "vendor-contract", name: "Vendor Contract", category: "VENDOR", variables: DEFAULT_VARIABLES },
      { id: "employment-offer", name: "Employment Offer Letter", category: "EMPLOYMENT", variables: DEFAULT_VARIABLES },
      { id: "arena-host", name: "Arena Host Agreement", category: "ARENA_HOST", variables: DEFAULT_VARIABLES },
    )
  }

  const entities = ENTITIES.map((e) => ({ value: e.value, label: e.label }))

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-violet-500 to-purple-600">
            <Sparkles className="size-4 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Contract Generator</h1>
            <p className="text-sm text-muted-foreground">
              Generate contract drafts from templates using AI
            </p>
          </div>
        </div>
      </div>

      <GenerateForm templates={templates} entities={entities} preselectedTemplateId={preselectedTemplate} />
    </div>
  )
}
