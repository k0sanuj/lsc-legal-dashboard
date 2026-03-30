"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import type { DocumentCategory, Entity } from "@/generated/prisma/client"

export async function createTemplate(formData: FormData) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN"])

  const name = formData.get("name") as string
  const category = formData.get("category") as DocumentCategory
  const entity = (formData.get("entity") as Entity) || null
  const content = formData.get("content") as string
  const variablesRaw = formData.get("variables") as string

  if (!name || !category || !content) {
    return { success: false, error: "Name, category, and content are required" }
  }

  let variables: string[] = []
  try {
    variables = variablesRaw ? JSON.parse(variablesRaw) : []
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
  return { success: true, templateId: template.id }
}
