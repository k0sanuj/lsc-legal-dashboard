"use server"

import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import type { TrackerStatus } from "@/generated/prisma/client"

export async function updateTrackerStatus(
  itemId: string,
  status: TrackerStatus
) {
  await requireSession()

  if (!itemId || !status) {
    throw new Error("Missing required fields: itemId, status")
  }

  await prisma.trackerItem.update({
    where: { id: itemId },
    data: { status },
  })

  revalidatePath("/legal/tracker")
}
