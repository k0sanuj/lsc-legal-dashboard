"use server"

import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import type { IssueStatus, IssueCategory, Priority } from "@/generated/prisma/client"

export async function createIssue(formData: FormData) {
  const session = await requireSession()

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const category = formData.get("category") as IssueCategory
  const priority = formData.get("priority") as Priority
  const assignedTo = formData.get("assigned_to") as string | null
  const slaHours = parseInt(formData.get("sla_hours") as string, 10) || 168 // default 7 days

  if (!title || !description || !category || !priority) {
    throw new Error("Missing required fields: title, description, category, priority")
  }

  const slaDeadline = new Date(Date.now() + slaHours * 3600000)

  const issue = await prisma.legalIssue.create({
    data: {
      title,
      description,
      category,
      priority,
      reporter_id: session.userId,
      assigned_to: assignedTo || undefined,
      sla_deadline: slaDeadline,
      status: "OPEN",
    },
  })

  revalidatePath("/legal/issues")
  return { id: issue.id }
}

export async function updateIssueStatus(
  issueId: string,
  status: IssueStatus,
  resolution?: string
) {
  await requireSession()

  if (!issueId || !status) {
    throw new Error("Missing required fields: issueId, status")
  }

  const data: Record<string, unknown> = { status }
  if (resolution !== undefined) {
    data.resolution = resolution
  }

  await prisma.legalIssue.update({
    where: { id: issueId },
    data,
  })

  revalidatePath("/legal/issues")
}
