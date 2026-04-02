"use server"

import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import type { Priority } from "@/generated/prisma/client"

export async function getChecklistItems() {
  await requireSession()

  return prisma.projectChecklist.findMany({
    orderBy: [
      { done: "asc" },
      { priority: "asc" },
      { sort_order: "asc" },
      { created_at: "asc" },
    ],
  })
}

export async function createChecklistItem(formData: FormData) {
  await requireSession()

  const title = formData.get("title") as string
  const priority = (formData.get("priority") as Priority) || "MEDIUM"
  const category = (formData.get("category") as string) || "General"

  if (!title?.trim()) {
    throw new Error("Title is required")
  }

  const maxOrder = await prisma.projectChecklist.aggregate({
    _max: { sort_order: true },
  })

  await prisma.projectChecklist.create({
    data: {
      title: title.trim(),
      priority,
      category,
      sort_order: (maxOrder._max.sort_order ?? 0) + 1,
    },
  })

  revalidatePath("/legal")
}

export async function toggleChecklistItem(id: string) {
  await requireSession()

  const item = await prisma.projectChecklist.findUnique({ where: { id } })
  if (!item) throw new Error("Item not found")

  await prisma.projectChecklist.update({
    where: { id },
    data: { done: !item.done },
  })

  revalidatePath("/legal")
}

export async function deleteChecklistItem(id: string) {
  await requireSession()

  await prisma.projectChecklist.delete({ where: { id } })

  revalidatePath("/legal")
}

export async function updateChecklistItem(
  id: string,
  data: { title?: string; priority?: Priority; category?: string; notes?: string }
) {
  await requireSession()

  await prisma.projectChecklist.update({
    where: { id },
    data,
  })

  revalidatePath("/legal")
}
