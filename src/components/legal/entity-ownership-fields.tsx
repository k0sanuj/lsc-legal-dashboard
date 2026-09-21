/** Shareholding fields shared by record creation and correction. */
import type { EntityOwnership } from '@/generated/prisma/client'
import { EntityField, fieldClass } from './entity-fields'

export function EntityOwnershipFields({ ownedEntityId, profiles, holding }: {
  ownedEntityId: string
  profiles: { id: string; legal_name: string }[]
  holding?: EntityOwnership
}) {
  return <>
    <input name="owned_entity_id" value={ownedEntityId} type="hidden" />
    {holding && <input name="id" value={holding.id} type="hidden" />}
    <div className="grid gap-4 sm:grid-cols-2">
      <EntityField label="Owner entity"><select className={fieldClass} name="owner_entity_id" defaultValue={holding?.owner_entity_id ?? ''}><option value="">External shareholder or unselected</option>{profiles.filter(profile => profile.id !== ownedEntityId).map(profile => <option key={profile.id} value={profile.id}>{profile.legal_name}</option>)}</select></EntityField>
      <EntityField label="Or external shareholder name"><input name="owner_name" className={fieldClass} defaultValue={holding?.owner_name ?? ''} /></EntityField>
      <EntityField label="Stake percentage, leave blank if unknown"><input name="percentage" inputMode="decimal" className={fieldClass} defaultValue={holding?.percentage?.toFixed() ?? ''} /></EntityField>
      <EntityField label="Effective date"><input name="effective_date" type="date" className={fieldClass} defaultValue={holding?.effective_date?.toISOString().slice(0, 10) ?? ''} /></EntityField>
      <EntityField label="Source reference *"><input name="source_reference" required className={fieldClass} defaultValue={holding?.source_reference ?? ''} /></EntityField>
    </div>
  </>
}
