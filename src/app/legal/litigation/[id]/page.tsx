/** One matter history and attachment store, surfaced through either dispute tracker. */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { prisma } from '@/lib/prisma'
import { loadUsdRates } from '@/lib/fx-rates'
import { agreementMoney } from '@/lib/money'
import { DISPUTE_STATUSES } from '@/lib/dispute-rules'
import { addLitigationEvent, createLitigationCase, updateDisputeStatusForm } from '@/actions/litigation'
import { EntityActionForm } from '@/components/legal/entity-action-form'
import { EntityField, fieldClass } from '@/components/legal/entity-fields'
import { DisputeFields } from '@/components/legal/dispute-fields'
import { LitigationDocumentUploadForm } from '@/components/legal/litigation-document-upload-form'
import { DocumentAnalysisSummaryDrawer } from '@/components/legal/document-analysis-summary'

export default async function LitigationDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireGlobalDocumentAccess()
  const { id } = await params
  const [record, rates] = await Promise.all([
    prisma.litigationCase.findUnique({ where: { id }, include: { events: { orderBy: { event_date: 'desc' } }, documents: { orderBy: { created_at: 'desc' } }, assignee: true } }),
    loadUsdRates(),
  ])
  if (!record) notFound()
  return <div className="space-y-8">
    <Link className="text-sm text-primary underline" href={record.dispute_kind === 'ARBITRATION' ? '/legal/arbitration' : '/legal/litigation'}>Back to tracker</Link>
    <header><h1 className="text-2xl font-semibold">{record.case_name}</h1><p className="mt-2 text-sm text-muted-foreground">{record.dispute_kind} · {record.entity} · {record.status.replaceAll('_', ' ')}</p></header>
    {record.dispute_kind === 'UNCLASSIFIED' && <p className="border-l-2 border-primary pl-4 text-sm">This existing matter needs classification. Its history and files are retained.</p>}
    <div className="grid gap-5 border-y border-border py-5 md:grid-cols-3"><div><p className="text-xs text-muted-foreground">Exposure</p><p className="mt-2 font-mono">{agreementMoney(record.estimated_liability, record.currency, rates)}</p><p className="mt-1 text-xs text-muted-foreground">As of {record.exposure_as_of?.toISOString().slice(0, 10) ?? 'unknown'}</p></div><div><p className="text-xs text-muted-foreground">Legal fees / projected cost</p><p className="mt-2 font-mono text-sm">{agreementMoney(record.legal_fees_to_date, record.currency, rates)} / {agreementMoney(record.projected_total_cost, record.currency, rates)}</p></div><div><p className="text-xs text-muted-foreground">Finance delivery</p><p className="mt-2 text-sm">{record.finance_post_status === 'synced' ? 'Receiver accepted' : record.finance_post_status?.replaceAll('_', ' ') ?? 'Not delivered'}</p><p className="mt-1 text-xs text-muted-foreground">{record.last_finance_post_error}</p></div></div>
    <div className="grid gap-5 text-sm sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Claim / court or tribunal</p><p>{record.claim_type ?? 'Unclassified'} · {record.court_tribunal ?? 'Forum unknown'}</p></div><div><p className="text-xs text-muted-foreground">{record.dispute_kind === 'ARBITRATION' ? 'Claimant / respondent' : 'Plaintiff / defendant'}</p><p>{record.plaintiff} / {record.defendant}</p></div><div><p className="text-xs text-muted-foreground">Assigned counsel</p><p>{record.assigned_counsel ?? 'Not supplied'} · {record.external_counsel ?? 'External counsel not supplied'}</p></div><div><p className="text-xs text-muted-foreground">Next hearing / limitation date</p><p>{record.next_hearing?.toISOString().slice(0, 10) ?? 'Not supplied'} / {record.statute_of_limitations?.toISOString().slice(0, 10) ?? 'Not supplied'}</p></div></div>
    {record.exposure_basis && <p className="whitespace-pre-wrap text-sm">Assessment basis: {record.exposure_basis}</p>}
    <EntityActionForm action={updateDisputeStatusForm} submitLabel="Update status" reset={false}><input name="case_id" value={id} type="hidden" /><EntityField label="Matter status"><select className={fieldClass} name="status" defaultValue={record.status}>{DISPUTE_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></EntityField></EntityActionForm>
    <details className="border-t border-border pt-5"><summary className="cursor-pointer text-sm">Edit matter, classification and exposure</summary><EntityActionForm action={createLitigationCase} className="mt-5" reset={false}><DisputeFields record={record} /></EntityActionForm></details>
    <section className="space-y-4 border-t border-border pt-6"><div className="flex flex-wrap justify-between gap-4"><h2 className="text-lg font-medium">Matter documents</h2><LitigationDocumentUploadForm caseId={id} /></div>{record.documents.map((doc) => <div key={doc.id} className="flex flex-wrap justify-between gap-4 border-b border-border py-3 text-sm"><span>{doc.title} · {doc.doc_type}</span><div className="flex gap-4">{doc.file_url && <Link href={`/api/litigation-documents/${doc.id}/file`} className="text-primary underline">Download</Link>}<DocumentAnalysisSummaryDrawer documentId={doc.id} targetType="litigation" compact /></div></div>)}{!record.documents.length && <p className="text-sm text-muted-foreground">No documents attached.</p>}</section>
    <section className="space-y-4 border-t border-border pt-6"><h2 className="text-lg font-medium">Matter history</h2>{record.events.map((event) => <div key={event.id} className="border-b border-border py-3 text-sm"><p>{event.event_date.toISOString().slice(0, 10)} · {event.title}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{event.description}</p></div>)}<details><summary className="cursor-pointer text-sm">Add event</summary><EntityActionForm action={addLitigationEvent} className="mt-4"><input name="case_id" type="hidden" value={id} /><div className="grid gap-4 sm:grid-cols-2"><EntityField label="Event title *"><input name="title" className={fieldClass} required /></EntityField><EntityField label="Event type *"><input name="event_type" className={fieldClass} required /></EntityField><EntityField label="Date *"><input name="event_date" type="date" className={fieldClass} required /></EntityField><EntityField label="Description"><textarea name="description" className={fieldClass} /></EntityField></div></EntityActionForm></details></section>
  </div>
}
