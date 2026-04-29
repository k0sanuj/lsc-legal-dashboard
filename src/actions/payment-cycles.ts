"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { emitFinanceEvent } from "@/lib/finance-webhook"
import { buildTranchePayload } from "@/lib/finance-payloads"
import type { PaymentTerms } from "@/generated/prisma/client"

const ALLOWED_ROLES = ["PLATFORM_ADMIN", "LEGAL_ADMIN", "FINANCE_ADMIN"] as const

function parseTerms(value: string | null): PaymentTerms {
  if (value && ["NET_30", "NET_60", "MILESTONE", "CUSTOM"].includes(value)) {
    return value as PaymentTerms
  }
  return "CUSTOM"
}

export async function createPaymentCycleAction(formData: FormData): Promise<void> {
  await requireRole([...ALLOWED_ROLES])

  const documentId = String(formData.get("documentId") ?? "")
  const trancheNumber = Number(formData.get("trancheNumber") ?? 1)
  const trancheLabel = String(formData.get("trancheLabel") ?? "")
  const tranchePercentage = Number(formData.get("tranchePercentage") ?? 0)
  const trancheAmountUsd = Number(formData.get("trancheAmountUsd") ?? 0)
  const explicitTrigger = String(formData.get("triggerType") ?? "") || null
  const triggerDate = String(formData.get("triggerDate") ?? "") || null
  const triggerOffsetDays = Number(formData.get("triggerOffsetDays") ?? 0)
  const notes = String(formData.get("notes") ?? "") || null
  const termsInput = parseTerms(formData.get("terms") as string | null)
  const customTerms = String(formData.get("customTerms") ?? "") || null
  const amount = Number(formData.get("amount") ?? trancheAmountUsd)
  const currency = String(formData.get("currency") ?? "USD")

  if (!documentId) {
    redirect("/legal/payment-cycles?error=missing+document")
  }

  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    select: { entity: true, sport: true, title: true, last_finance_post_at: true },
  })
  if (!doc) {
    redirect("/legal/payment-cycles?error=document+not+found")
  }

  // Server-side guard mirroring the UI hard-block: refuse to fire a tranche
  // event if the parent contract hasn't been synced to Finance yet.
  // Finance would return 400 ("could not resolve contract") otherwise.
  if (!doc.last_finance_post_at) {
    redirect(
      "/legal/payment-cycles?status=error&message=Document+has+not+been+synced+to+Finance+yet.+Sign+the+document+first."
    )
  }

  const row = await prisma.paymentCycle.create({
    data: {
      document_id: documentId,
      terms: termsInput,
      custom_terms: customTerms,
      amount,
      currency,
      tranche_number: trancheNumber,
      tranche_label: trancheLabel,
      tranche_percentage: tranchePercentage,
      tranche_amount_usd: trancheAmountUsd,
      trigger_type: explicitTrigger ?? undefined,
      trigger_date: triggerDate ? new Date(triggerDate) : null,
      trigger_offset_days: triggerOffsetDays,
      notes,
      finance_post_status: "pending",
    },
  })

  // Reload with parent doc fields the payload builder needs
  const cycleWithDoc = await prisma.paymentCycle.findUniqueOrThrow({
    where: { id: row.id },
    include: { document: { select: { entity: true, sport: true } } },
  })

  const result = await emitFinanceEvent(
    "tranche.created",
    buildTranchePayload(cycleWithDoc as any),
    { entityType: "PaymentCycle", entityId: row.id }
  )

  await prisma.paymentCycle.update({
    where: { id: row.id },
    data: {
      last_finance_post_at: new Date(),
      finance_post_status: result.ok ? "synced" : "failed",
      last_finance_post_error: result.ok ? null : (result.error ?? "Unknown error"),
    },
  })

  revalidatePath("/legal/payment-cycles")
  redirect(
    result.ok
      ? "/legal/payment-cycles?status=success&message=Tranche+created+and+synced"
      : "/legal/payment-cycles?status=warn&message=Tranche+created;+Finance+sync+pending"
  )
}

export async function updatePaymentCycleAction(formData: FormData): Promise<void> {
  await requireRole([...ALLOWED_ROLES])

  const id = String(formData.get("id") ?? "")
  if (!id) redirect("/legal/payment-cycles?error=missing+id")

  const existing = await prisma.paymentCycle.findUnique({
    where: { id },
    include: { document: { select: { entity: true, sport: true } } },
  })
  if (!existing) redirect("/legal/payment-cycles?error=not+found")

  const trancheNumber = Number(formData.get("trancheNumber") ?? existing.tranche_number ?? 1)
  const trancheLabel = String(formData.get("trancheLabel") ?? existing.tranche_label ?? "")
  const tranchePercentage = Number(
    formData.get("tranchePercentage") ?? existing.tranche_percentage ?? 0
  )
  const trancheAmountUsd = Number(
    formData.get("trancheAmountUsd") ?? existing.tranche_amount_usd ?? 0
  )
  const triggerType = String(formData.get("triggerType") ?? existing.trigger_type ?? "on_date")
  const triggerDate = String(formData.get("triggerDate") ?? "") || null
  const triggerOffsetDays = Number(
    formData.get("triggerOffsetDays") ?? existing.trigger_offset_days ?? 0
  )
  const notes = String(formData.get("notes") ?? existing.notes ?? "") || null

  const updated = await prisma.paymentCycle.update({
    where: { id },
    data: {
      tranche_number: trancheNumber,
      tranche_label: trancheLabel,
      tranche_percentage: tranchePercentage,
      tranche_amount_usd: trancheAmountUsd,
      trigger_type: triggerType,
      trigger_date: triggerDate ? new Date(triggerDate) : null,
      trigger_offset_days: triggerOffsetDays,
      notes,
      finance_post_status: "pending",
    },
    include: { document: { select: { entity: true, sport: true } } },
  })

  const result = await emitFinanceEvent(
    "tranche.updated",
    buildTranchePayload(updated as any),
    { entityType: "PaymentCycle", entityId: id }
  )

  await prisma.paymentCycle.update({
    where: { id },
    data: {
      last_finance_post_at: new Date(),
      finance_post_status: result.ok ? "synced" : "failed",
      last_finance_post_error: result.ok ? null : (result.error ?? "Unknown error"),
    },
  })

  revalidatePath("/legal/payment-cycles")
  redirect(
    result.ok
      ? "/legal/payment-cycles?status=success&message=Tranche+updated"
      : "/legal/payment-cycles?status=warn&message=Tranche+updated;+Finance+sync+pending"
  )
}

/** Manual resync trigger from the table row's "Resync" button. */
export async function resyncPaymentCycleAction(formData: FormData): Promise<void> {
  await requireRole([...ALLOWED_ROLES])
  const id = String(formData.get("id") ?? "")
  if (!id) return

  const row = await prisma.paymentCycle.findUnique({
    where: { id },
    include: { document: { select: { entity: true, sport: true } } },
  })
  if (!row) return

  const result = await emitFinanceEvent(
    "tranche.updated",
    buildTranchePayload(row as any),
    { entityType: "PaymentCycle", entityId: row.id }
  )

  await prisma.paymentCycle.update({
    where: { id },
    data: {
      last_finance_post_at: new Date(),
      finance_post_status: result.ok ? "synced" : "failed",
      last_finance_post_error: result.ok ? null : (result.error ?? "Unknown error"),
    },
  })

  revalidatePath("/legal/payment-cycles")
}
