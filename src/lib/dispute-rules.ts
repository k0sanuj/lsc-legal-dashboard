/** Dispute validation and exact Finance payloads. Exposure is never an invoice. */
import { Prisma } from '@/generated/prisma/client'

export const DISPUTE_KINDS = ['LITIGATION', 'ARBITRATION', 'UNCLASSIFIED'] as const
export type DisputeKind = typeof DISPUTE_KINDS[number]
export const DISPUTE_STATUSES = ['PRE_FILING', 'FILED', 'DISCOVERY', 'TRIAL', 'APPEAL', 'SETTLED', 'CLOSED'] as const

export function parseDisputeAmount(value: string | null): Prisma.Decimal | null {
  if (value === null || value === '') return null
  if (!/^\d{1,24}(?:\.\d{1,8})?$/.test(value)) throw new Error('Exposure must be a non-negative decimal amount with at most eight decimal places.')
  return new Prisma.Decimal(value)
}

export function disputeCurrency(value: string): string {
  const currency = value.trim().toUpperCase()
  if (!Intl.supportedValuesOf('currency').includes(currency)) throw new Error('Choose a supported three-letter agreement currency.')
  return currency
}

export function buildDisputeExposurePayload(record: {
  id: string; case_name: string; entity: string; dispute_kind: string; claim_type: string | null;
  status: string; estimated_liability: Prisma.Decimal | null; currency: string;
  exposure_basis: string | null; exposure_as_of: Date | null; exposure_revision: number;
}, action: 'created' | 'updated' | 'closed') {
  return {
    schemaVersion: 1,
    caseId: record.id,
    caseName: record.case_name,
    entity: record.entity,
    disputeKind: record.dispute_kind,
    claimType: record.claim_type,
    action,
    status: record.status,
    revision: record.exposure_revision,
    estimatedLiability: record.estimated_liability?.toFixed() ?? null,
    currency: record.currency,
    exposureBasis: record.exposure_basis,
    asOf: record.exposure_as_of?.toISOString().slice(0, 10) ?? null,
  }
}
