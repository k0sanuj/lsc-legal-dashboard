/**
 * Pure payload builders. Take a row + (where needed) related rows; return
 * the JSON object that goes into the webhook envelope's `payload` field.
 *
 * No I/O, no env reads — keep these pure so they're trivially testable.
 */
import type { ESOPGrant, LegalDocument, PaymentCycle } from "@/generated/prisma/client"
import {
  defaultHolderType,
  defaultShareClass,
  inferTriggerType,
  mapEntityToCompanyCode,
  mapLifecycleStatusToContractStatus,
} from "./finance-mapping"

function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === "number") return v
  return Number(v) || 0
}

/**
 * contract.created / contract.updated payload.
 * `contract_status` defaults to a derivation of `lifecycle_status` if the
 * column hasn't been explicitly set.
 */
export function buildContractPayload(doc: LegalDocument): Record<string, unknown> {
  return {
    legalExternalId: doc.id,
    companyCode: mapEntityToCompanyCode(doc.entity),
    sport: doc.sport ?? null,
    contractName: doc.contract_name ?? doc.title,
    sponsorName: doc.sponsor_name ?? doc.counterparty ?? "Unknown counterparty",
    counterpartyType: doc.counterparty_type ?? "sponsor",
    contractStatus:
      doc.contract_status ?? mapLifecycleStatusToContractStatus(doc.lifecycle_status),
    contractValue: num(doc.contract_value_usd),
    currencyCode: doc.currency_code ?? "USD",
    startDate: isoDate(doc.contract_start_date),
    endDate: isoDate(doc.contract_end_date) ?? isoDate(doc.expiry_date),
    isRecurring: doc.is_recurring,
    billingFrequency: doc.billing_frequency ?? null,
    notes: doc.notes ?? null,
  }
}

/**
 * tranche.created / tranche.updated payload.
 * NOTE: v2 sends `contractLegalExternalId = document_id`, NOT `contractName`.
 * Finance resolves the parent contract from the Legal Document id it
 * received via the contract.* event.
 */
export function buildTranchePayload(
  cycle: PaymentCycle & { document: { entity: LegalDocument["entity"]; sport: string | null } }
): Record<string, unknown> {
  return {
    legalExternalId: cycle.id,
    contractLegalExternalId: cycle.document_id,
    trancheNumber: cycle.tranche_number ?? 1,
    trancheLabel: cycle.tranche_label ?? `Tranche ${cycle.tranche_number ?? 1}`,
    tranchePercentage: num(cycle.tranche_percentage),
    trancheAmount: num(cycle.tranche_amount_usd),
    triggerType: inferTriggerType(cycle.terms, cycle.trigger_type),
    triggerDate: isoDate(cycle.trigger_date),
    triggerOffsetDays: cycle.trigger_offset_days ?? 0,
    notes: cycle.notes ?? null,
  }
}

/**
 * share_grant.created / share_grant.updated payload.
 * Field names follow the v2 spec (holderName, sharesHeld, sharesVested,
 * vestingCliffMonths, vestingTotalMonths, agreementReference).
 */
export function buildShareGrantPayload(grant: ESOPGrant): Record<string, unknown> {
  return {
    legalExternalId: grant.id,
    companyCode: mapEntityToCompanyCode(grant.entity),
    sport: grant.sport ?? null,
    holderName: grant.employee_name,
    holderEmail: grant.employee_email,
    holderType: grant.holder_type ?? defaultHolderType(),
    shareClass: grant.share_class ?? defaultShareClass(),
    sharesHeld: grant.total_shares,
    sharesVested: grant.vested_shares,
    exercisePrice: num(grant.exercise_price),
    grantDate: isoDate(grant.grant_date),
    vestingStartDate: isoDate(grant.vesting_start_date),
    vestingEndDate: isoDate(grant.vesting_end_date),
    vestingCliffMonths: grant.cliff_months,
    vestingTotalMonths: grant.vesting_months,
    agreementReference: grant.agreement_reference ?? null,
  }
}
