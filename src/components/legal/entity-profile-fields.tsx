/** Editable sourced identity fields. Legal entity mapping is always explicit. */
import type { EntityProfile } from '@/generated/prisma/client'
import { ENTITY_CODES, JURISDICTION_CODES } from '@/lib/entity-input'
import { EntityField, fieldClass } from './entity-fields'

export function EntityProfileFields({ profile }: { profile?: EntityProfile }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    {profile && <input name="id" type="hidden" value={profile.id} />}
    <EntityField label="Legal name *"><input className={fieldClass} name="legal_name" required maxLength={300} defaultValue={profile?.legal_name} /></EntityField>
    <EntityField label="Jurisdiction *"><select className={fieldClass} name="jurisdiction" required defaultValue={profile?.jurisdiction ?? ''}><option value="" disabled>Select jurisdiction</option>{JURISDICTION_CODES.map((item) => <option key={item}>{item}</option>)}</select></EntityField>
    <EntityField label="Existing platform entity mapping"><select className={fieldClass} name="legacy_entity" defaultValue={profile?.legacy_entity ?? ''}><option value="">Unconfirmed</option>{ENTITY_CODES.map((item) => <option key={item}>{item}</option>)}</select></EntityField>
    <EntityField label="Registration number"><input className={fieldClass} name="registration_number" defaultValue={profile?.registration_number ?? ''} /></EntityField>
    <EntityField label="Incorporation date"><input className={fieldClass} name="incorporation_date" type="date" defaultValue={profile?.incorporation_date?.toISOString().slice(0, 10) ?? ''} /></EntityField>
    <EntityField label="Registered agent"><input className={fieldClass} name="registered_agent_name" defaultValue={profile?.registered_agent_name ?? ''} /></EntityField>
    <EntityField label="Agent contact"><input className={fieldClass} name="registered_agent_contact" defaultValue={profile?.registered_agent_contact ?? ''} /></EntityField>
    <EntityField label="Registered office"><input className={fieldClass} name="registered_office" defaultValue={profile?.registered_office ?? ''} /></EntityField>
    <EntityField label="Source reference or URL"><input className={fieldClass} name="source_reference" defaultValue={profile?.source_reference ?? ''} /></EntityField>
    <EntityField label="Notes"><input className={fieldClass} name="notes" defaultValue={profile?.notes ?? ''} /></EntityField>
  </div>
}
