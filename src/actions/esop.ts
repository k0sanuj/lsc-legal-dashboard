"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { emitFinanceEvent } from "@/lib/finance-webhook"
import { defaultHolderType, defaultShareClass } from "@/lib/finance-mapping"
import { buildShareGrantPayload } from "@/lib/finance-payloads"
import type { Entity, VestingType } from "@/generated/prisma/client"

const ALLOWED_ROLES = ["PLATFORM_ADMIN", "LEGAL_ADMIN", "FINANCE_ADMIN"] as const

function parseEntity(v: string | null): Entity {
  if (v && ["LSC", "TBR", "FSP", "XTZ", "XTE"].includes(v)) return v as Entity
  return "LSC"
}

function parseVesting(v: string | null): VestingType {
  if (v && ["STANDARD_4Y_1Y_CLIFF", "GRADED", "MILESTONE", "CUSTOM"].includes(v)) {
    return v as VestingType
  }
  return "STANDARD_4Y_1Y_CLIFF"
}

export async function createEsopGrantAction(formData: FormData): Promise<void> {
  await requireRole([...ALLOWED_ROLES])

  const employeeName = String(formData.get("employeeName") ?? "")
  const employeeEmail = String(formData.get("employeeEmail") ?? "") || null
  const entity = parseEntity(formData.get("entity") as string | null)
  const sport = String(formData.get("sport") ?? "") || null
  const grantDate = String(formData.get("grantDate") ?? "")
  const totalShares = Number(formData.get("totalShares") ?? 0)
  const exercisePrice = Number(formData.get("exercisePrice") ?? 0)
  const vestingType = parseVesting(formData.get("vestingType") as string | null)
  const cliffMonths = Number(formData.get("cliffMonths") ?? 12)
  const vestingMonths = Number(formData.get("vestingMonths") ?? 48)
  const holderType = (String(formData.get("holderType") ?? "") || defaultHolderType()) as
    | "founder" | "employee" | "investor" | "advisor"
  const shareClass = (String(formData.get("shareClass") ?? "") || defaultShareClass()) as
    | "common" | "preferred_a" | "preferred_b" | "options"
  const vestingStartDate = String(formData.get("vestingStartDate") ?? "") || null
  const vestingEndDate = String(formData.get("vestingEndDate") ?? "") || null
  const agreementReference = String(formData.get("agreementReference") ?? "") || null

  if (!employeeName || !grantDate || !totalShares) {
    redirect("/legal/esop?error=missing+required+fields")
  }

  const row = await prisma.eSOPGrant.create({
    data: {
      employee_name: employeeName,
      employee_email: employeeEmail,
      entity,
      sport,
      grant_date: new Date(grantDate),
      total_shares: totalShares,
      exercise_price: exercisePrice,
      vesting_type: vestingType,
      cliff_months: cliffMonths,
      vesting_months: vestingMonths,
      holder_type: holderType,
      share_class: shareClass,
      vesting_start_date: vestingStartDate ? new Date(vestingStartDate) : null,
      vesting_end_date: vestingEndDate ? new Date(vestingEndDate) : null,
      agreement_reference: agreementReference,
      finance_post_status: "pending",
    },
  })

  const result = await emitFinanceEvent(
    "share_grant.created",
    buildShareGrantPayload(row),
    { entityType: "ESOPGrant", entityId: row.id }
  )

  await prisma.eSOPGrant.update({
    where: { id: row.id },
    data: {
      last_finance_post_at: new Date(),
      finance_post_status: result.ok ? "synced" : "failed",
      last_finance_post_error: result.ok ? null : (result.error ?? "Unknown error"),
    },
  })

  revalidatePath("/legal/esop")
  redirect(
    result.ok
      ? "/legal/esop?status=success&message=Grant+created+and+synced"
      : "/legal/esop?status=warn&message=Grant+created;+Finance+sync+pending"
  )
}

export async function updateEsopGrantAction(formData: FormData): Promise<void> {
  await requireRole([...ALLOWED_ROLES])

  const id = String(formData.get("id") ?? "")
  if (!id) redirect("/legal/esop?error=missing+id")

  const existing = await prisma.eSOPGrant.findUnique({ where: { id } })
  if (!existing) redirect("/legal/esop?error=not+found")

  const totalShares = Number(formData.get("totalShares") ?? existing.total_shares)
  const exercisePrice = Number(formData.get("exercisePrice") ?? existing.exercise_price)
  const holderType = (String(formData.get("holderType") ?? "") ||
    existing.holder_type ||
    defaultHolderType()) as "founder" | "employee" | "investor" | "advisor"
  const shareClass = (String(formData.get("shareClass") ?? "") ||
    existing.share_class ||
    defaultShareClass()) as "common" | "preferred_a" | "preferred_b" | "options"
  const vestingStartDate = String(formData.get("vestingStartDate") ?? "") || null
  const vestingEndDate = String(formData.get("vestingEndDate") ?? "") || null
  const agreementReference =
    String(formData.get("agreementReference") ?? "") || existing.agreement_reference

  const updated = await prisma.eSOPGrant.update({
    where: { id },
    data: {
      total_shares: totalShares,
      exercise_price: exercisePrice,
      holder_type: holderType,
      share_class: shareClass,
      vesting_start_date: vestingStartDate
        ? new Date(vestingStartDate)
        : existing.vesting_start_date,
      vesting_end_date: vestingEndDate
        ? new Date(vestingEndDate)
        : existing.vesting_end_date,
      agreement_reference: agreementReference,
      finance_post_status: "pending",
    },
  })

  const result = await emitFinanceEvent(
    "share_grant.updated",
    buildShareGrantPayload(updated),
    { entityType: "ESOPGrant", entityId: id }
  )

  await prisma.eSOPGrant.update({
    where: { id },
    data: {
      last_finance_post_at: new Date(),
      finance_post_status: result.ok ? "synced" : "failed",
      last_finance_post_error: result.ok ? null : (result.error ?? "Unknown error"),
    },
  })

  revalidatePath("/legal/esop")
  redirect(
    result.ok
      ? "/legal/esop?status=success&message=Grant+updated"
      : "/legal/esop?status=warn&message=Grant+updated;+Finance+sync+pending"
  )
}

export async function resyncEsopGrantAction(formData: FormData): Promise<void> {
  await requireRole([...ALLOWED_ROLES])
  const id = String(formData.get("id") ?? "")
  if (!id) return

  const row = await prisma.eSOPGrant.findUnique({ where: { id } })
  if (!row) return

  const result = await emitFinanceEvent(
    "share_grant.updated",
    buildShareGrantPayload(row),
    { entityType: "ESOPGrant", entityId: row.id }
  )

  await prisma.eSOPGrant.update({
    where: { id },
    data: {
      last_finance_post_at: new Date(),
      finance_post_status: result.ok ? "synced" : "failed",
      last_finance_post_error: result.ok ? null : (result.error ?? "Unknown error"),
    },
  })

  revalidatePath("/legal/esop")
}
