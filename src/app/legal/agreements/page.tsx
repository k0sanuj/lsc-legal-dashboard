import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { documentScope, isGlobalDocumentUser } from "@/lib/document-access"
import { ENTITIES, LIFECYCLE_STATUS_LABELS, formatDate } from "@/lib/constants"
import { agreementMoney, currencyCode, formatMoney, usdTotal } from "@/lib/money"
import { loadUsdRates } from "@/lib/fx-rates"
import { LifecycleBadge } from "@/components/legal/lifecycle-badge"
import { NewAgreementForm } from "@/components/legal/new-agreement-form"
import { DocumentCategory } from "@/generated/prisma/enums"
import type { Prisma, Entity, LifecycleStatus } from "@/generated/prisma/client"

/** Summary amounts cover the complete authorized filter, separately from the paginated register. */
export default async function AgreementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession()
  const query = await searchParams
  const value = (key: string) => typeof query[key] === "string" ? query[key] : ""
  const entity = value("entity")
  const category = value("category")
  const status = value("status")
  const currency = currencyCode(value("currency"))
  const page = Math.max(0, Math.min(100000, Number.parseInt(value("page"), 10) || 0))
  const where: Prisma.LegalDocumentWhereInput = { AND: [await documentScope(session)] }
  if (ENTITIES.some((item) => item.value === entity)) where.entity = entity as Entity
  if (Object.values(DocumentCategory).some((item) => item === category)) where.category = category as DocumentCategory
  if (status in LIFECYCLE_STATUS_LABELS) where.lifecycle_status = status as LifecycleStatus
  if (currency) where.currency = currency
  const [documents, amounts, rates, global] = await Promise.all([
    prisma.legalDocument.findMany({ where, orderBy: [{ updated_at: "desc" }, { id: "asc" }], skip: page * 50, take: 50, select: { id: true, title: true, category: true, entity: true, counterparty: true, lifecycle_status: true, expiry_date: true, value: true, currency: true } }),
    prisma.legalDocument.findMany({ where, select: { value: true, currency: true } }),
    loadUsdRates(), isGlobalDocumentUser(session),
  ])
  const summary = usdTotal(amounts, rates)
  const field = "rounded border border-input bg-background px-3 py-2 text-sm"
  const pageLink = (next: number) => { const params = new URLSearchParams(); for (const key of ["entity", "category", "status", "currency"]) if (value(key)) params.set(key, value(key)); params.set("page", String(next)); return `/legal/agreements?${params}` }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Agreements</h1>{global && <NewAgreementForm/>}</div>
    <div className="flex flex-wrap gap-10 border-y border-border py-4"><div><p className="text-sm text-muted-foreground">Agreements</p><strong className="text-2xl font-mono tabular-nums">{amounts.length}</strong></div><div><p className="text-sm text-muted-foreground">Agreement value, USD reporting</p><strong className="text-2xl font-mono tabular-nums">{summary.included ? formatMoney(summary.total, "USD") : "Unknown"}</strong><p className="text-xs text-muted-foreground">{summary.included} valued; {summary.missing} missing an amount or current FX quote</p></div>{global && <Link className="self-center text-primary underline text-sm" href="/legal/currencies">FX sources and dates</Link>}</div>
    <form className="flex flex-wrap gap-3"><select className={field} name="entity" aria-label="Entity" defaultValue={entity}><option value="">All entities</option>{ENTITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select className={field} name="category" aria-label="Category" defaultValue={category}><option value="">All categories</option>{Object.values(DocumentCategory).map((item) => <option key={item}>{item}</option>)}</select><select className={field} name="status" aria-label="Lifecycle" defaultValue={status}><option value="">All statuses</option>{Object.entries(LIFECYCLE_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><input className={field} name="currency" aria-label="Agreement currency filter" placeholder="Agreement currency, e.g. USD" pattern="[A-Z]{3}" defaultValue={currency ?? ""}/><button className={field}>Apply</button><Link href="/legal/agreements" className="self-center text-primary">Clear</Link></form>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="py-3">Agreement</th><th>Entity</th><th>Counterparty</th><th>Status</th><th>Expiry</th><th className="text-right">Agreement currency (USD reference)</th></tr></thead><tbody>{documents.map((doc) => <tr key={doc.id} className="border-b border-border"><td className="py-4 pr-4"><Link href={`/legal/documents/${doc.id}`} className="text-primary">{doc.title}</Link><p className="text-xs text-muted-foreground">{doc.category.replace(/_/g, " ")}</p></td><td className="pr-4">{doc.entity}</td><td className="pr-4">{doc.counterparty ?? "Unknown"}</td><td className="pr-4"><LifecycleBadge status={doc.lifecycle_status}/></td><td className="pr-4">{doc.expiry_date ? formatDate(doc.expiry_date) : "Not supplied"}</td><td className="text-right font-mono tabular-nums">{agreementMoney(doc.value, doc.currency, rates)}</td></tr>)}</tbody></table>{!documents.length && <p className="py-8 text-muted-foreground">No agreements match your access and filters.</p>}</div>
    <div className="flex justify-between text-sm"><span>Showing {documents.length} of {amounts.length}</span><div className="flex gap-4">{page > 0 && <Link className="text-primary" href={pageLink(page - 1)}>Previous</Link>}{(page + 1) * 50 < amounts.length && <Link className="text-primary" href={pageLink(page + 1)}>Next</Link>}</div></div>
  </div>
}
