/** Server-derived separate trackers with precise, filter-consistent exposure totals. */
import Link from 'next/link'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { loadUsdRates } from '@/lib/fx-rates'
import { agreementMoney, formatMoney, usdTotal } from '@/lib/money'
import { DISPUTE_STATUSES, type DisputeKind } from '@/lib/dispute-rules'
import { createLitigationCase } from '@/actions/litigation'
import { EntityActionForm } from './entity-action-form'
import { DisputeFields } from './dispute-fields'
import { fieldClass } from './entity-fields'

export async function DisputeRegister({ kind, searchParams }: { kind: DisputeKind; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGlobalDocumentAccess()
  const params = await searchParams
  const unclassified = params.kind === 'UNCLASSIFIED'
  const status = DISPUTE_STATUSES.find((item) => item === params.status)
  const currency = typeof params.currency === 'string' && /^[A-Z]{3}$/.test(params.currency) ? params.currency : undefined
  const where: Prisma.LitigationCaseWhereInput = { dispute_kind: unclassified ? 'UNCLASSIFIED' : kind, ...(status ? { status } : {}), ...(currency ? { currency } : {}) }
  const [cases, amounts, pendingCount, rates] = await Promise.all([
    prisma.litigationCase.findMany({ where, orderBy: { updated_at: 'desc' }, take: 200 }),
    prisma.litigationCase.findMany({ where, select: { estimated_liability: true, currency: true } }),
    prisma.litigationCase.count({ where: { dispute_kind: 'UNCLASSIFIED' } }),
    loadUsdRates(),
  ])
  const total = usdTotal(amounts.map((row) => ({ value: row.estimated_liability, currency: row.currency })), rates)
  const title = unclassified ? 'Unclassified matters' : kind === 'ARBITRATION' ? 'Arbitration' : 'Litigation'
  const base = kind === 'ARBITRATION' ? '/legal/arbitration' : '/legal/litigation'
  return <div className="space-y-7">
    <header><h1 className="text-2xl font-semibold">{title}</h1></header>
    <nav className="flex flex-wrap gap-6 border-b border-border pb-3 text-sm"><Link className="text-primary" href="/legal/litigation">Litigation</Link><Link className="text-primary" href="/legal/arbitration">Arbitration</Link><Link className="text-primary" href={`${base}?kind=UNCLASSIFIED`}>Unclassified ({pendingCount})</Link></nav>
    <div className="flex flex-wrap justify-between gap-6 border-b border-border pb-5"><div><p className="text-xs text-muted-foreground">Recorded exposure, selected statuses</p><p className="mt-2 font-mono text-xl">{total.included ? formatMoney(total.total, 'USD') : 'USD unavailable'}</p><p className="mt-1 text-xs text-muted-foreground">{total.included} matters converted · {total.missing} with unknown exposure or unavailable FX</p></div><p className="self-end text-xs text-muted-foreground">Showing {cases.length} of {amounts.length} matters. Totals include all filtered records.</p></div>
    <form className="flex flex-wrap items-end gap-3">{unclassified && <input name="kind" value="UNCLASSIFIED" type="hidden" />}<label className="text-xs text-muted-foreground">Status<select name="status" className={fieldClass} defaultValue={status ?? ''}><option value="">All statuses</option>{DISPUTE_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs text-muted-foreground">Agreement currency<input name="currency" className={fieldClass} defaultValue={currency ?? ''} maxLength={3} placeholder="All" /></label><button className="border border-border px-3 py-2 text-sm">Filter</button><Link href={base} className="py-2 text-sm text-primary">Reset</Link></form>
    <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="py-3">Matter</th><th>Claim / forum</th><th>{kind === 'ARBITRATION' ? 'Claimant / respondent' : 'Plaintiff / defendant'}</th><th>Exposure</th><th>Finance delivery</th></tr></thead><tbody>{cases.map((record) => <tr key={record.id} className="border-b border-border align-top"><td className="py-4 pr-4"><Link className="text-primary underline" href={`/legal/litigation/${record.id}`}>{record.case_name}</Link><p className="mt-1 text-xs text-muted-foreground">{record.entity} · {record.status.replaceAll('_', ' ')}</p></td><td className="py-4 pr-4">{record.claim_type ?? 'Unclassified'}<p className="mt-1 text-xs text-muted-foreground">{record.court_tribunal ?? 'Forum not supplied'}</p></td><td className="py-4 pr-4">{record.plaintiff}<p className="mt-1 text-xs text-muted-foreground">{record.defendant}</p></td><td className="py-4 pr-4 font-mono">{agreementMoney(record.estimated_liability, record.currency, rates)}</td><td className="py-4 text-xs">{record.finance_post_status === 'synced' ? 'Receiver accepted' : record.finance_post_status?.replaceAll('_', ' ') ?? 'Not delivered'}</td></tr>)}</tbody></table></div>
    {!cases.length && <p className="text-sm text-muted-foreground">No matters in this view. Existing unclassified matters remain available in their own register.</p>}
    <details className="border-t border-border pt-5"><summary className="cursor-pointer text-sm">Add {kind === 'ARBITRATION' ? 'arbitration' : 'litigation'} matter</summary><EntityActionForm action={createLitigationCase} className="mt-5"><DisputeFields kind={kind} /></EntityActionForm></details>
  </div>
}
