"use server"

import { revalidatePath } from "next/cache"
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { extractTextFromFile } from "@/lib/extract-text"
import { ENTITIES } from "@/lib/constants"
import type { DocumentCategory, Entity } from "@/generated/prisma/client"

type TemplateVariable = {
  key: string
  label: string
  placeholder: string
}

type TemplateAnalysisFields = {
  name: string
  category: DocumentCategory
  entity: Entity | ""
  variablesText: string
  content: string
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" })
const TEMPLATE_ANALYSIS_MODEL =
  process.env.TEMPLATE_ANALYSIS_MODEL ?? "claude-haiku-4-5-20251001"

const DOCUMENT_CATEGORIES = [
  "SPONSORSHIP",
  "VENDOR",
  "EMPLOYMENT",
  "ESOP",
  "NDA",
  "ARENA_HOST",
  "TERMS_OF_SERVICE",
  "WAIVER",
  "IP_ASSIGNMENT",
  "PILOT_PROGRAM",
  "BOARD_RESOLUTION",
  "POLICY",
  "OTHER",
  "MSA",
  "SLA",
  "CONTRACTOR",
  "REFERRAL_PARTNER",
  "VENUE",
  "PRODUCTION_PARTNER",
  "CLICKWRAP",
  "REGISTERED_OFFICE",
  "SAAS_SUBSCRIPTION",
  "INSURANCE",
  "GOVERNMENT_FILING",
  "LITIGATION_DOC",
  "SUBSIDY_GRANT",
] as const satisfies readonly DocumentCategory[]

const ENTITY_VALUES = ENTITIES.map((entity) => entity.value)

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

function toTemplateVariable(value: unknown): TemplateVariable | null {
  if (typeof value === "string") {
    const key = normalizeVariableKey(value)
    if (!key) return null
    const label = labelFromKey(key)
    return { key, label, placeholder: `Enter ${label.toLowerCase()}` }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
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
}

function parseTemplateVariables(raw: string | null, content: string): TemplateVariable[] {
  const variables: TemplateVariable[] = []
  const seen = new Set<string>()

  function push(variable: TemplateVariable | null) {
    if (!variable || seen.has(variable.key)) return
    seen.add(variable.key)
    variables.push(variable)
  }

  const trimmed = raw?.trim()
  if (trimmed) {
    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed)
      if (!Array.isArray(parsed)) {
        throw new Error("Template variables JSON must be an array")
      }
      parsed.forEach((item) => push(toTemplateVariable(item)))
    } else {
      trimmed
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => push(toTemplateVariable(item)))
    }
  }

  for (const match of content.matchAll(/\{\{\s*([a-zA-Z0-9_. -]+)\s*\}\}/g)) {
    push(toTemplateVariable(match[1]))
  }

  return variables
}

function uploadedTemplateFile(formData: FormData) {
  const file = formData.get("file")
  return file instanceof File && file.size > 0 ? file : null
}

function filenameToTemplateName(file: File | null) {
  return file?.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() ?? ""
}

function isDocumentCategory(value: unknown): value is DocumentCategory {
  return typeof value === "string" && DOCUMENT_CATEGORIES.includes(value as DocumentCategory)
}

function isEntity(value: unknown): value is Entity {
  return typeof value === "string" && ENTITY_VALUES.includes(value as Entity)
}

function extractJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Claude did not return a JSON object")
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
}

function variablesToText(variables: TemplateVariable[]) {
  return variables.map((variable) => variable.key).join("\n")
}

function normalizeTemplateAnalysis(
  raw: Record<string, unknown>,
  file: File,
  extractedText: string
): TemplateAnalysisFields {
  const content =
    typeof raw.templateContent === "string" && raw.templateContent.trim()
      ? raw.templateContent.trim()
      : extractedText
  const variables = parseTemplateVariables(
    Array.isArray(raw.variables) ? JSON.stringify(raw.variables) : null,
    content
  )

  return {
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : filenameToTemplateName(file),
    category: isDocumentCategory(raw.category) ? raw.category : "OTHER",
    entity: isEntity(raw.entity) ? raw.entity : "",
    variablesText: variablesToText(variables),
    content,
  }
}

async function analyzeAgreementForTemplate(file: File, extractedText: string) {
  const system = `You convert legal agreements into reusable contract generation templates for League Sports Co's Legal OS. Return strict JSON only.`
  const user = `Analyze this uploaded agreement and turn it into a reusable generation template.

Allowed category values:
${DOCUMENT_CATEGORIES.join(", ")}

Allowed entity values:
${ENTITIES.map((entity) => `${entity.value}=${entity.label}`).join(", ")}

Return exactly this JSON shape:
{
  "name": "Reusable template name",
  "category": "NDA",
  "entity": "LSC or null",
  "variables": [
    { "key": "counterparty", "label": "Counterparty", "placeholder": "e.g. Acme Corp" }
  ],
  "templateContent": "Full reusable agreement text with {{snake_case}} placeholders"
}

Rules:
- Choose the closest allowed category. If uncertain, use OTHER.
- Infer entity only when the text clearly names one of the allowed entities; otherwise use null.
- Preserve the original legal structure, clause order, and material language.
- Do not summarize. templateContent must be the reusable agreement text.
- Replace document-specific values with {{snake_case}} placeholders: counterparty names, dates, amounts, term, jurisdiction, addresses, signatories, emails, payment terms, and similar fields.
- Keep standard boilerplate and legal clauses intact.
- variables must include every placeholder used in templateContent.
- Use concise variable keys such as counterparty, effective_date, expiry_date, term, contract_value, governing_law, signatory_name.

File name: ${file.name}

Agreement text:
${extractedText}`

  const message = await anthropic.messages.create({
    model: TEMPLATE_ANALYSIS_MODEL,
    max_tokens: 4096,
    temperature: 0,
    system,
    messages: [{ role: "user", content: user }],
  })

  const block = message.content[0]
  return block && block.type === "text" ? block.text : ""
}

export async function analyzeTemplateUpload(formData: FormData): Promise<
  | { success: true; fields: TemplateAnalysisFields; model: string; extractedChars: number }
  | { success: false; error: string }
> {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN"])

  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: "ANTHROPIC_API_KEY is not configured" }
  }

  const uploadedFile = uploadedTemplateFile(formData)
  if (!uploadedFile) {
    return { success: false, error: "Choose an agreement file first" }
  }

  const extractedText = (await extractTextFromFile(uploadedFile)).trim()
  if (!extractedText) {
    return {
      success: false,
      error: "Could not read text from this file. Upload a readable PDF/DOCX/TXT/MD file.",
    }
  }

  try {
    const text = await analyzeAgreementForTemplate(uploadedFile, extractedText)
    const raw = extractJsonObject(text)
    return {
      success: true,
      fields: normalizeTemplateAnalysis(raw, uploadedFile, extractedText),
      model: TEMPLATE_ANALYSIS_MODEL,
      extractedChars: extractedText.length,
    }
  } catch (error) {
    console.error("analyzeTemplateUpload failed:", error)
    return {
      success: false,
      error: "AI analysis failed. Please try again or paste the template content manually.",
    }
  }
}

export async function createTemplate(formData: FormData) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN"])

  const uploadedFile = uploadedTemplateFile(formData)
  const name = ((formData.get("name") as string) || filenameToTemplateName(uploadedFile)).trim()
  const category = formData.get("category") as DocumentCategory
  const entity = (formData.get("entity") as Entity) || null
  const variablesRaw = formData.get("variables") as string | null
  let content = ((formData.get("content") as string) || "").trim()

  if (!content && uploadedFile) {
    content = (await extractTextFromFile(uploadedFile)).trim()
  }

  if (!name || !category || !content) {
    return {
      success: false,
      error: "Name, category, and template content are required",
    }
  }

  let variables: TemplateVariable[] = []
  try {
    variables = parseTemplateVariables(variablesRaw, content)
  } catch {
    return { success: false, error: "Invalid variables format" }
  }

  const template = await prisma.contractTemplate.create({
    data: {
      name,
      category,
      entity,
      content,
      variables,
    },
  })

  revalidatePath("/legal/templates")
  revalidatePath("/legal/generate")
  return { success: true, templateId: template.id }
}

export async function createTemplateAction(
  _prevState: { success?: boolean; error?: string; templateId?: string } | null,
  formData: FormData
) {
  return createTemplate(formData)
}
