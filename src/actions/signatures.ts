"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import type { SignatureStatus } from "@/generated/prisma/client"

export async function updateSignatureStatus(
  requestId: string,
  newStatus: SignatureStatus
) {
  await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  const updated = await prisma.signatureRequest.update({
    where: { id: requestId },
    data: {
      status: newStatus,
      ...(newStatus === "SENT" ? { sent_at: new Date() } : {}),
      ...(newStatus === "SIGNED" ? { signed_at: new Date() } : {}),
    },
  })

  revalidatePath("/legal/signatures")
  return updated
}
