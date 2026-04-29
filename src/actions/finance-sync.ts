"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"

/**
 * Mark a CrossModuleEvent as un-processed so the next /api/cron/finance-resync
 * tick picks it up for retry. Used by the per-row "Replay" button on the
 * Finance Sync admin page.
 */
export async function replayFinanceEventAction(formData: FormData): Promise<void> {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN"])

  const id = String(formData.get("id") ?? "")
  if (!id) return

  const evt = await prisma.crossModuleEvent.findUnique({ where: { id } })
  if (!evt) return

  // Reset retry counter so it gets fresh attempts
  const payload = (evt.payload as Record<string, unknown>) ?? {}
  delete payload._last_attempt
  delete payload._abandoned
  delete payload._abandoned_at

  await prisma.crossModuleEvent.update({
    where: { id },
    data: {
      processed: false,
      payload: payload as Prisma.InputJsonValue,
    },
  })

  revalidatePath("/legal/finance-sync")
}
