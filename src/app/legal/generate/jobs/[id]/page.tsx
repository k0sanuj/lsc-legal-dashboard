/** Durable job review survives browser refresh and worker unavailability. */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { prisma } from '@/lib/prisma'
import { isRecord, parseGenerationResult } from '@/lib/contract-generation-protocol'
import { saveGeneratedDocument } from '@/actions/generate'

export default async function GenerationJobPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])
  await requireGlobalDocumentAccess(actor)
  const { id } = await params
  const job = await prisma.contractGenerationJob.findFirst({ where: { id, actor_user_id: actor.userId } })
  if (!job) notFound()
  const input = isRecord(job.input) ? job.input : {}
  const source = job.kind === 'DRAFT' ? input : isRecord(input.source) ? input.source : {}
  const variables = isRecord(source.variables) && Object.values(source.variables).every(value => typeof value === 'string') ? source.variables as Record<string, string> : {}
  let findings: { issue: string; excerpt: string; severity: string }[] = []
  if (job.reviews) {
    try { const result = parseGenerationResult(job.reviews); findings = [...result.substantive.findings, ...result.references.findings] } catch { /* Save gate rejects malformed reviews. */ }
  }
  async function approve() {
    'use server'
    const result = await saveGeneratedDocument(`${String(source.templateName ?? 'Reviewed contract')} - ${variables.counterparty ?? 'Draft'}`, String(source.entity ?? ''), String(source.category ?? ''), job!.output_text ?? '', variables, typeof source.reference === 'string' ? source.reference : undefined, id)
    if (!result.success) throw new Error(result.error)
    redirect(`/legal/documents/${result.documentId}`)
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-bold">Contract draft review</h1><Link className="underline" href="/legal/generate">Generator</Link></div>
    <p className="text-sm">{job.status} · {job.id}</p>
    {job.error && <p role="alert">{job.error}</p>}
    {['QUEUED', 'RUNNING'].includes(job.status) && <p>Processing. Refresh this page to read the next durable result.</p>}
    {findings.length > 0 && <ul className="space-y-3">{findings.map((finding, index) => <li key={index}><strong>{finding.severity}: {finding.issue}</strong><blockquote className="border-l border-border pl-3 text-sm">{finding.excerpt}</blockquote></li>)}</ul>}
    {job.output_text && <pre className="whitespace-pre-wrap border-y border-border py-6 font-sans text-sm leading-relaxed">{job.output_text}</pre>}
    {job.document_id ? <Link href={`/legal/documents/${job.document_id}`} className="underline">Open saved draft</Link> : job.status === 'READY' && ['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'].includes(actor.role) ? <form action={approve}><button type="submit" className="bg-primary px-5 py-3 text-primary-foreground">Approve and save this reviewed draft</button></form> : <p className="text-sm">Saving requires both reviews to pass and a legal editor to approve.</p>}
  </div>
}
