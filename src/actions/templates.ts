"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { extractTextFromFile } from "@/lib/extract-text"
import type { DocumentCategory, Entity } from "@/generated/prisma/client"

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
