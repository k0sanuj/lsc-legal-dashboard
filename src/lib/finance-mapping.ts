/**
 * Helpers that translate Legal-side concepts into Finance-side fields.
 * Used by payment-cycle and esop server actions.
 */
import type { Entity, PaymentTerms } from "@/generated/prisma/client"

/**
 * After the Entity-enum collapse, Legal's Entity maps 1:1 to Finance's
 * companyCode. A row with entity=FSP and sport=BOWLING is still
 * companyCode=FSP for accounting purposes — the sport stays on the row
 * but isn't a Finance field.
 */
export function mapEntityToCompanyCode(entity: Entity): "LSC" | "TBR" | "FSP" | "XTZ" | "XTE" {
  return entity
}

export type TriggerType =
  | "on_signing"
  | "pre_event"
  | "post_event"
  | "on_milestone"
  | "on_date"

const VALID_TRIGGERS: TriggerType[] = [
  "on_signing",
  "pre_event",
  "post_event",
  "on_milestone",
  "on_date",
]

/**
 * Approximate mapping from Legal's coarse PaymentTerms enum to Finance's
 * triggerType. When the operator sets `trigger_type` explicitly on the
 * form, we use that — this fallback only kicks in when they don't.
 */
export function inferTriggerType(
  terms: PaymentTerms | null | undefined,
  hasExplicitTrigger: string | null | undefined
): TriggerType {
  if (hasExplicitTrigger && VALID_TRIGGERS.includes(hasExplicitTrigger as TriggerType)) {
    return hasExplicitTrigger as TriggerType
  }
  if (terms === "MILESTONE") return "on_milestone"
  // NET_30 / NET_60 / CUSTOM all become absolute-date triggers
  return "on_date"
}

export function defaultShareClass(): "common" | "preferred_a" | "preferred_b" | "options" {
  return "options"
}

export function defaultHolderType(): "founder" | "employee" | "investor" | "advisor" {
  return "employee"
}
