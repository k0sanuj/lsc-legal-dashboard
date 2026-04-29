"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { emitFinanceEvent } from "@/lib/finance-webhook"
import { inferTriggerType, mapEntityToCompanyCode } from "@/lib/finance-mapping"
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
  const contractName = String(formData.get("contractName") ?? "")
  const notes = String(formData.get("notes") ?? "") || null
  const termsInput = parseTerms(formData.get("terms") as string | null)
  const customTerms = String(formData.get("customTerms") ?? "") || null
  const amount = Number(formData.get("amount") ?? trancheAmountUsd)
  const currency = String(formData.get("currency") ?? "USD")

  if (!documentId || !contractName) {
    redirect("/legal/payment-cycles?error=missing+required+fields")
  }

  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    select: { entity: true, sport: true, title: true },
  })
  if (!doc) {
    redirect("/legal/payment-cycles?error=document+not+found")
  }

  const triggerType = inferTriggerType(termsInput, explicitTrigger)
  const companyCode = mapEntityToCompanyCode(doc.entity)

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
      trigger_type: triggerType,
      trigger_date: triggerDate ? new Date(triggerDate) : null,
      trigger_offset_days: triggerOffsetDays,
      contract_name: contractName,
      notes,
      finance_post_status: "pending",
    },
  })

  // Fire to Finance — non-blocking. The CrossModuleEvent row is the
  // durable queue; cron retries on failure.
  const result = await emitFinanceEvent(
    "tranche.created",
    {
      legalExternalId: row.id,
      companyCode,
      contractName,
      trancheNumber,
      trancheLabel,
      tranchePercentage,
      trancheAmount: trancheAmountUsd,
      triggerType,
      triggerDate,
      triggerOffsetDays,
      sport: doc.sport ?? null,
      notes,
    },
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
  const contractName = String(formData.get("contractName") ?? existing.contract_name ?? "")
  const notes = String(formData.get("notes") ?? existing.notes ?? "") || null

  await prisma.paymentCycle.update({
    where: { id },
    data: {
      tranche_number: trancheNumber,
      tranche_label: trancheLabel,
      tranche_percentage: tranchePercentage,
      tranche_amount_usd: trancheAmountUsd,
      trigger_type: triggerType,
      trigger_date: triggerDate ? new Date(triggerDate) : null,
      trigger_offset_days: triggerOffsetDays,
      contract_name: contractName,
      notes,
      finance_post_status: "pending",
    },
  })

  const result = await emitFinanceEvent(
    "tranche.updated",
    {
      legalExternalId: id,
      companyCode: mapEntityToCompanyCode(existing.document.entity),
      contractName,
      trancheNumber,
      trancheLabel,
      tranchePercentage,
      trancheAmount: trancheAmountUsd,
      triggerType,
      triggerDate,
      triggerOffsetDays,
      sport: existing.document.sport ?? null,
      notes,
    },
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
    {
      legalExternalId: row.id,
      companyCode: mapEntityToCompanyCode(row.document.entity),
      contractName: row.contract_name ?? "",
      trancheNumber: row.tranche_number ?? null,
      trancheLabel: row.tranche_label ?? null,
      tranchePercentage: row.tranche_percentage ? Number(row.tranche_percentage) : null,
      trancheAmount: row.tranche_amount_usd ? Number(row.tranche_amount_usd) : null,
      triggerType: row.trigger_type ?? "on_date",
      triggerDate: row.trigger_date?.toISOString().split("T")[0] ?? null,
      triggerOffsetDays: row.trigger_offset_days ?? 0,
      sport: row.document.sport ?? null,
      notes: row.notes ?? null,
    },
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
