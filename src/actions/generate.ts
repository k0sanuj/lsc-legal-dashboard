'use server'

// Owns AI drafting and draft saves. Authorize before returning the shared pause.
import { createHash } from 'node:crypto'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CONTRACT_GENERATION_PAUSED, CONTRACT_GENERATION_PAUSED_MESSAGE } from '@/lib/contract-generation'
import { revalidatePath } from 'next/cache'
import { Entity, DocumentCategory, Prisma } from '@/generated/prisma/client'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { requestRefinement, readGenerationJob, cancelGenerationJob, requireReviewedGeneration, requestTemplateGeneration } from '@/lib/contract-generation-queue'
import { uploadBufferToS3 } from '@/lib/s3'
import { recordArtifact } from '@/lib/document-artifacts'
import { boundedText, isRecord } from '@/lib/contract-generation-protocol'
import { saveTextTemplate } from '@/lib/template-service'

function paused() {
  return { success: false as const, draft: '', code: 'GENERATION_PAUSED' as const, error: CONTRACT_GENERATION_PAUSED_MESSAGE }
}

export async function generateContract(templateId: string, variables: Record<string, string>, entity: string, reference?: string, requestKey?: string) {
  const actor = await requireRole(['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])
  if (CONTRACT_GENERATION_PAUSED) return paused()
  await requireGlobalDocumentAccess(actor)
  try {
    const job = await requestTemplateGeneration(actor, templateId, variables, entity, reference, requestKey ?? crypto.randomUUID())
    return { success: true as const, draft: '', jobId: job.id }
  } catch (error) {
    return { success: false as const, draft: '', error: error instanceof Error ? error.message : 'Could not queue generation' }
  }
}

export async function refineContract(currentDraft: string, instruction: string, requestKey?: string, parentJobId?: string) {
  const actor = await requireRole(['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])
  if (CONTRACT_GENERATION_PAUSED) return paused()
  await requireGlobalDocumentAccess(actor)
  try {
    if (!boundedText(currentDraft) || !boundedText(instruction, 5000)) throw new Error('A draft and bounded refinement instruction are required')
    if (!parentJobId) throw new Error('Select an owned generation job to refine')
    const parent = await readGenerationJob(actor, parentJobId)
    if (!parent || parent.output_text !== currentDraft) throw new Error('The draft does not match its job')
    const job = await requestRefinement(actor, parentJobId, instruction, requestKey ?? crypto.randomUUID())
    return { success: true as const, draft: '', jobId: job.id }
  } catch (error) {
    return { success: false as const, draft: '', error: error instanceof Error ? error.message : 'Could not queue refinement' }
  }
}

export async function getGenerationJob(id: string) {
  const actor = await requireRole(['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])
  const job = await readGenerationJob(actor, id)
  if (!job) return null
  return { ...job, created_at: job.created_at.toISOString(), completed_at: job.completed_at?.toISOString() ?? null }
}

export async function cancelGeneration(id: string) {
  const actor = await requireRole(['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])
  return { success: await cancelGenerationJob(actor, id) }
}

export async function saveGeneratedDocument(
  title: string, entity: string, category: string, content: string,
  variables: Record<string, string>, reference?: string, jobId?: string
) {
  const actor = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])
  await requireGlobalDocumentAccess(actor)
  try {
    if (!boundedText(title, 250) || !Object.values(Entity).includes(entity as Entity) || !Object.values(DocumentCategory).includes(category as DocumentCategory)) throw new Error('Invalid document details')
    const job = await requireReviewedGeneration(actor, jobId, content)
    if (job.document_id) return { success: true as const, documentId: job.document_id }
    const source = isRecord(job.input) ? (job.kind === 'DRAFT' ? job.input : isRecord(job.input.source) ? job.input.source : null) : null
    if (!source || !isRecord(source.variables) || !boundedText(source.templateId, 100) || !boundedText(source.template) || source.entity !== entity || source.category !== category || Object.keys(source.variables).length !== Object.keys(variables).length || Object.entries(source.variables).some(([key, value]) => variables[key] !== value)) throw new Error('Document metadata changed after drafting. Generate a new draft with those details.')
    const amount = variables.value?.trim()
    const suppliedCurrency = variables.currency?.trim().toUpperCase()
    const currency = suppliedCurrency || 'USD'
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Select a valid three-letter agreement currency')
    if (amount && (!/^-?\d+(?:\.\d{1,6})?$/.test(amount) || !suppliedCurrency)) throw new Error('An exact amount and explicit three-letter agreement currency are required')
    const bytes = Buffer.from(content, 'utf8')
    const fileUrl = await uploadBufferToS3(bytes, `generation/${actor.userId}/${job.id}/${job.output_hash}.txt`, 'text/plain; charset=utf-8')
    const sourceBytes = Buffer.from(source.template, 'utf8')
    const sourceHash = createHash('sha256').update(sourceBytes).digest('hex')
    const sourceUrl = await uploadBufferToS3(sourceBytes, `templates/${source.templateId}/${sourceHash}.txt`, 'text/plain; charset=utf-8')
    const document = await prisma.$transaction(async tx => {
      const templateArtifact = await recordArtifact({ templateId: source.templateId as string, stage: 'template', fileUrl: sourceUrl, originalName: `${source.templateId}.txt`, mimeType: 'text/plain', bytes: sourceBytes, actorId: actor.userId, provenance: { source: 'generation-template-snapshot', jobId: job.id } }, tx)
      const document = await tx.legalDocument.create({ data: {
        title, entity: entity as Entity, category: category as DocumentCategory,
        lifecycle_status: 'DRAFT', owner_id: actor.userId, notes: content, file_url: fileUrl,
        counterparty: variables.counterparty || null,
        parties: variables.counterparty ? [variables.counterparty] : undefined,
        currency,
        ...(amount ? { value: new Prisma.Decimal(amount) } : {}),
      } })
      await tx.documentVersion.create({ data: { document_id: document.id, version_number: 1, file_url: fileUrl, change_summary: `Reviewed CLI draft${reference ? `; reference: ${reference}` : ''}`, created_by: actor.userId } })
      await recordArtifact({ documentId: document.id, stage: 'populated', sourceArtifactId: templateArtifact.id, fileUrl, originalName: `${job.id}.txt`, mimeType: 'text/plain', bytes, actorId: actor.userId, deliverableScope: `Codex job ${job.id}` }, tx)
      const claimed = await tx.contractGenerationJob.updateMany({ where: { id: job.id, status: 'READY', document_id: null, output_hash: job.output_hash }, data: { document_id: document.id, human_approved_by: actor.userId, approved_at: new Date() } })
      if (claimed.count !== 1) throw new Error('This draft was already saved; refresh the job')
      return document
    })
    revalidatePath('/legal/documents')
    return { success: true as const, documentId: document.id }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Could not save reviewed draft' }
  }
}

export async function saveAsTemplate(
  name: string, category: string, entity: string | null, content: string,
  variables: { key: string; label: string; placeholder: string }[], jobId?: string
) {
  const actor = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN'])
  await requireGlobalDocumentAccess(actor)
  try {
    await requireReviewedGeneration(actor, jobId, content)
    const template = await saveTextTemplate(actor, { name, category, entity, content, variables })
    revalidatePath('/legal/templates')
    return { success: true as const, templateId: template.templateId }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Could not save template' }
  }
}
