/** Sourced entity profiles, filings and ownership. No inferred entity mappings. */
import { Prisma } from '@/generated/prisma/client'
import { requireEntityWriter } from '@/lib/entity-service'
import { prisma } from '@/lib/prisma'
import { dateField, enumField, evidenceReference, requiredText, textField, ENTITY_CODES, FILING_TYPES, JURISDICTION_CODES } from '@/lib/entity-input'
import { validateDependencies } from '@/lib/review-rules'

import type { SessionPayload } from '@/lib/session'

export async function saveEntityProfileForSession(session: SessionPayload, form: FormData) {
  await requireEntityWriter(session)
  const legacy = textField(form, 'legacy_entity')
  const data = {
    legal_name: requiredText(form, 'legal_name', 300),
    jurisdiction: enumField(form, 'jurisdiction', JURISDICTION_CODES),
    legacy_entity: legacy ? enumField(form, 'legacy_entity', ENTITY_CODES) : null,
    registration_number: textField(form, 'registration_number', false, 200),
    incorporation_date: dateField(form, 'incorporation_date'),
    registered_agent_name: textField(form, 'registered_agent_name', false, 300),
    registered_agent_contact: textField(form, 'registered_agent_contact', false, 500),
    registered_office: textField(form, 'registered_office'),
    source_reference: evidenceReference(form),
    notes: textField(form, 'notes'),
  }
  const id = textField(form, 'id')
  const record = id ? await prisma.entityProfile.update({ where: { id }, data }) : await prisma.entityProfile.create({ data })
  return { success: true, id: record.id }
}

export async function saveEntityFilingForSession(session: SessionPayload, form: FormData) {
  await requireEntityWriter(session)
  const entityProfileId = requiredText(form, 'entity_profile_id')
  const data = {
    entity_profile_id: entityProfileId,
    filing_type: enumField(form, 'filing_type', FILING_TYPES),
    reporting_period: textField(form, 'reporting_period', false, 100),
    due_date: dateField(form, 'due_date'),
    filed_date: dateField(form, 'filed_date'),
    source_reference: evidenceReference(form),
    notes: textField(form, 'notes'),
  }
  if (data.filed_date && !data.source_reference) throw new Error('A completed filing requires its receipt or evidence reference.')
  const id = textField(form, 'id')
  const record = id ? await prisma.entityFiling.update({ where: { id, entity_profile_id: entityProfileId }, data }) : await prisma.entityFiling.create({ data })
  return { success: true, id: record.id }
}

export async function saveEntityOwnershipForSession(session: SessionPayload, form: FormData) {
  await requireEntityWriter(session)
  const ownedId = requiredText(form, 'owned_entity_id')
  const ownerId = textField(form, 'owner_entity_id')
  const ownerName = textField(form, 'owner_name', false, 300)
  if (Boolean(ownerId) === Boolean(ownerName)) throw new Error('Choose either an existing owner entity or an external shareholder name.')
  if (ownedId === ownerId) throw new Error('An entity cannot own itself.')
  const rawPercentage = textField(form, 'percentage', false, 12)
  if (rawPercentage && !/^\d{1,3}(?:\.\d{1,4})?$/.test(rawPercentage)) throw new Error('Ownership must be a percentage with up to four decimal places.')
  const percentage = rawPercentage ? new Prisma.Decimal(rawPercentage) : null
  if (percentage && (percentage.lt(0) || percentage.gt(100))) throw new Error('Ownership must be between 0 and 100 percent.')
  const sourceReference = evidenceReference(form, 'source_reference', true)!
  const effectiveDate = dateField(form, 'effective_date')
  const id = textField(form, 'id')
  const record = await prisma.$transaction(async (tx) => {
    const [profiles, holdings] = await Promise.all([tx.entityProfile.findMany({ select: { id: true } }), tx.entityOwnership.findMany()])
    const ids = new Set(profiles.map((profile) => profile.id))
    if (!ids.has(ownedId) || (ownerId && !ids.has(ownerId))) throw new Error('Entity record not found.')
    if (id && !holdings.some((holding) => holding.id === id && holding.owned_entity_id === ownedId)) throw new Error('Shareholding record not found for this entity.')
    const otherHoldings = holdings.filter((holding) => holding.id !== id)
    const peers = otherHoldings.filter((holding) => holding.owned_entity_id === ownedId)
    if (peers.some((holding) => ownerId ? holding.owner_entity_id === ownerId : holding.owner_name?.toLowerCase() === ownerName?.toLowerCase())) throw new Error('That shareholder is already listed. Correct its existing record before adding another.')
    const total = peers.reduce((sum, holding) => sum.plus(holding.percentage ?? 0), new Prisma.Decimal(0)).plus(percentage ?? 0)
    if (total.gt(100)) throw new Error('Known ownership percentages would exceed 100 percent.')
    if (ownerId) {
      try {
        validateDependencies([...otherHoldings.flatMap((holding) => holding.owner_entity_id ? [{ source_schedule_id: holding.owner_entity_id, target_schedule_id: holding.owned_entity_id }] : []), { source_schedule_id: ownerId, target_schedule_id: ownedId }], ids)
      } catch { throw new Error('Ownership would create a circular entity relationship.') }
    }
    const data = { owned_entity_id: ownedId, owner_entity_id: ownerId, owner_name: ownerName, percentage, effective_date: effectiveDate, source_reference: sourceReference }
    return id ? tx.entityOwnership.update({ where: { id, owned_entity_id: ownedId }, data }) : tx.entityOwnership.create({ data })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  return { success: true, id: record.id }
}

export async function linkKycToEntityForSession(session: SessionPayload, form: FormData) {
  await requireEntityWriter(session)
  const id = requiredText(form, 'kyc_document_id')
  const profileId = requiredText(form, 'entity_profile_id')
  await prisma.kycDocument.update({ where: { id }, data: { entity_profile_id: profileId } })
  return { success: true }
}
