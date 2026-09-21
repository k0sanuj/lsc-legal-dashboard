/** Shared litigation/arbitration fields. Unknown money stays blank, never zero. */
import type { LitigationCase } from '@/generated/prisma/client'
import { ENTITY_CODES, JURISDICTION_CODES } from '@/lib/entity-input'
import { DISPUTE_KINDS, type DisputeKind } from '@/lib/dispute-rules'
import { EntityField, fieldClass } from './entity-fields'

export function DisputeFields({ record, kind }: { record?: LitigationCase; kind?: DisputeKind }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    {record && <><input name="id" type="hidden" value={record.id} /><input name="revision" type="hidden" value={record.exposure_revision} /></>}
    <EntityField label="Matter name *"><input className={fieldClass} name="case_name" required defaultValue={record?.case_name} /></EntityField>
    <EntityField label="Case / reference number"><input className={fieldClass} name="case_number" defaultValue={record?.case_number ?? ''} /></EntityField>
    <EntityField label="Tracker *"><select className={fieldClass} name="dispute_kind" defaultValue={record?.dispute_kind ?? kind ?? ''} required><option value="" disabled>Choose tracker</option>{DISPUTE_KINDS.map((item) => <option key={item} value={item}>{item}</option>)}</select></EntityField>
    <EntityField label="Claim type *"><input className={fieldClass} name="claim_type" required defaultValue={record?.claim_type ?? ''} /></EntityField>
    <EntityField label="Entity *"><select className={fieldClass} name="entity" required defaultValue={record?.entity ?? ''}><option value="" disabled>Choose entity</option>{ENTITY_CODES.map((item) => <option key={item}>{item}</option>)}</select></EntityField>
    <EntityField label="Jurisdiction *"><select className={fieldClass} name="jurisdiction" required defaultValue={record?.jurisdiction ?? ''}><option value="" disabled>Choose jurisdiction</option>{JURISDICTION_CODES.map((item) => <option key={item}>{item}</option>)}</select></EntityField>
    <EntityField label="Court / tribunal"><input className={fieldClass} name="court_tribunal" defaultValue={record?.court_tribunal ?? ''} /></EntityField>
    <EntityField label="Agreement currency *"><input className={fieldClass} name="currency" required maxLength={3} pattern="[A-Za-z]{3}" defaultValue={record?.currency ?? ''} placeholder="USD, AED, INR..." /></EntityField>
    <EntityField label="Plaintiff / claimant *"><input className={fieldClass} name="plaintiff" required defaultValue={record?.plaintiff} /></EntityField>
    <EntityField label="Defendant / respondent *"><input className={fieldClass} name="defendant" required defaultValue={record?.defendant} /></EntityField>
    <EntityField label="Exposure, leave blank if unknown"><input className={`${fieldClass} font-mono`} name="estimated_liability" inputMode="decimal" defaultValue={record?.estimated_liability?.toFixed() ?? ''} /></EntityField>
    <EntityField label="Exposure as-of date"><input className={fieldClass} name="exposure_as_of" type="date" defaultValue={record?.exposure_as_of?.toISOString().slice(0, 10) ?? ''} /></EntityField>
    <EntityField label="Exposure basis / evidence"><textarea className={fieldClass} name="exposure_basis" rows={2} defaultValue={record?.exposure_basis ?? ''} /></EntityField>
    <EntityField label="Notes"><textarea className={fieldClass} name="notes" rows={2} defaultValue={record?.notes ?? ''} /></EntityField>
  </div>
}
