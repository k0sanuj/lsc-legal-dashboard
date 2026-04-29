/**
 * Helpers that translate Legal-side concepts into Finance-side fields.
 * Used by payment-cycle and esop server actions.
 */
import type { Entity, LifecycleStatus, PaymentTerms } from "@/generated/prisma/client"

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

export type ContractStatus = "draft" | "active" | "completed" | "cancelled"

/**
 * Map our 9-state LifecycleStatus to Finance's 4-state contract_status.
 * Pre-signature states all collapse to "draft" (Finance doesn't want them);
 * EXPIRING is still "active" because the contract is operationally live
 * until it actually expires.
 */
export function mapLifecycleStatusToContractStatus(s: LifecycleStatus): ContractStatus {
  switch (s) {
    case "SIGNED":
    case "ACTIVE":
    case "EXPIRING":
      return "active"
    case "EXPIRED":
      return "completed"
    case "TERMINATED":
      return "cancelled"
    default:
      // DRAFT, IN_REVIEW, NEGOTIATION, AWAITING_SIGNATURE
      return "draft"
  }
}
