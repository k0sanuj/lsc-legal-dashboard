"use server"

/**
 * Dashboard-facing wrapper around the MNDA send pipeline. Owns: role gating,
 * FormData parsing, and cache revalidation. All real work happens in
 * src/lib/mnda.ts, which the Slack route shares.
 */
import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"
import { sendMnda, type MndaSendParams, type MndaSendResult } from "@/lib/mnda"

function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/** Comma, semicolon, or whitespace separated CC list into clean addresses. */
function parseCcEmails(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()))].filter(
    Boolean
  )
}

export async function sendMndaAction(formData: FormData): Promise<MndaSendResult> {
  const session = await requireRole(["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"])

  try {
    const templateKind = formString(formData, "templateKind")
    if (templateKind !== "individual" && templateKind !== "business") {
      return { success: false, safe: true, error: "Template kind must be individual or business." }
    }

    const termYears = Number(formString(formData, "termYears"))
    if (![1, 2, 3, 5].includes(termYears)) {
      return { success: false, safe: true, error: "Term must be 1, 2, 3, or 5 years." }
    }

    const params: MndaSendParams = {
      templateKind,
      counterpartyName: formString(formData, "counterpartyName"),
      counterpartyEmail: formString(formData, "counterpartyEmail"),
      counterpartyCompany: formString(formData, "counterpartyCompany") || undefined,
      counterpartyAddress: formString(formData, "counterpartyAddress") || undefined,
      passportNumber: formString(formData, "passportNumber") || undefined,
      ccEmails: parseCcEmails(formString(formData, "ccEmails")),
      termYears: termYears as MndaSendParams["termYears"],
      effectiveDate: formString(formData, "effectiveDate"),
    }

    const result = await sendMnda(params, {
      userId: session.userId,
      email: session.email,
      display: session.fullName,
      source: "dashboard",
    })

    if (result.success) {
      revalidatePath("/legal/documents")
      revalidatePath("/legal/signatures")
    }
    return result
  } catch (error) {
    console.error("sendMndaAction error:", error)
    return { success: false, safe: true, error: "Failed to generate and send the MNDA." }
  }
}
