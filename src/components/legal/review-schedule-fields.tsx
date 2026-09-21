/** Server-rendered creation and revision fields for sourced review schedules. */
import type { ReviewSchedule } from '@/generated/prisma/client'
import { EntityField, fieldClass } from './entity-fields'

type Choice = { id: string; title: string }
export function ReviewScheduleFields({ schedule, documents, policies, users }: {
  schedule?: ReviewSchedule
  documents: Choice[]
  policies: Choice[]
  users: { id: string; full_name: string }[]
}) {
  return <div className="grid gap-4 sm:grid-cols-2">
    {schedule && <><input type="hidden" name="id" value={schedule.id} /><input type="hidden" name="expected_updated_at" value={schedule.updated_at.toISOString()} /><input type="hidden" name="kind" value={schedule.kind} /><input type="hidden" name="document_id" value={schedule.document_id ?? ''} /><input type="hidden" name="policy_id" value={schedule.policy_id ?? ''} /><input type="hidden" name="start_date" value={schedule.start_date.toISOString().slice(0, 10)} /></>}
    <EntityField label="Schedule title *"><input className={fieldClass} name="title" defaultValue={schedule?.title ?? ''} required /></EntityField>
    {!schedule && <>
      <EntityField label="Kind"><select className={fieldClass} name="kind"><option value="PUBLIC">Public-facing document</option><option value="INTERNAL">Internal Policies & Procedures</option></select></EntityField>
      <EntityField label="Public document"><select className={fieldClass} name="document_id"><option value="">Choose only for public reviews</option>{documents.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></EntityField>
      <EntityField label="Internal policy"><select className={fieldClass} name="policy_id"><option value="">Choose only for internal reviews</option>{policies.map(policy => <option key={policy.id} value={policy.id}>{policy.title}</option>)}</select></EntityField>
      <EntityField label="Confirmed review start *"><input className={fieldClass} name="start_date" type="date" required /></EntityField>
    </>}
    <EntityField label="Owner *"><select className={fieldClass} name="owner_id" defaultValue={schedule?.owner_id ?? ''} required><option value="">Select owner</option>{users.map(user => <option key={user.id} value={user.id}>{user.full_name}</option>)}</select></EntityField>
    {(!schedule || schedule.kind === 'INTERNAL') && <EntityField label="Internal interval"><select className={fieldClass} name="interval_months" defaultValue={schedule?.interval_months ?? ''}><option value="">Choose for internal policy</option>{[4, 5, 6].map(month => <option key={month} value={month}>{month} months</option>)}</select></EntityField>}
    {(!schedule || schedule.kind === 'PUBLIC') && <EntityField label="Public interval after six months, only if confirmed"><input className={fieldClass} type="number" min="1" max="24" name="steady_interval_months" defaultValue={schedule?.steady_interval_months ?? ''} placeholder="Leave blank when unknown" /></EntityField>}
    <EntityField label="Evidence for start and cadence *"><input className={fieldClass} name="source_reference" defaultValue={schedule?.source_reference ?? ''} required /></EntityField>
    {schedule && <p className="text-xs text-muted-foreground sm:col-span-2">Cadence changes apply to future open scheduled reviews. Due reviews, completions and dependency history are retained. Source and start date stay fixed.</p>}
  </div>
}
