/** Session-explicit text template writes for Slack, preserving immutable source artifacts. */
import { randomUUID, createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { Entity, DocumentCategory } from '@/generated/prisma/client'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { recordArtifact } from '@/lib/document-artifacts'
import { uploadBufferToS3 } from '@/lib/s3'
import { boundedText, isRecord } from '@/lib/contract-generation-protocol'
import type { SessionPayload } from '@/lib/session'

export async function saveTextTemplate(session: SessionPayload, input: unknown) {
  const actor = await requireGlobalDocumentAccess(session)
  if (!['PLATFORM_ADMIN', 'LEGAL_ADMIN'].includes(actor.role)) throw new Error('Template editing access is required')
  if (!isRecord(input) || !boundedText(input.name, 250) || !boundedText(input.content) || !Object.values(DocumentCategory).includes(input.category as DocumentCategory)) throw new Error('Template name, category and complete content are required')
  if (input.entity !== null && input.entity !== undefined && !Object.values(Entity).includes(input.entity as Entity)) throw new Error('Invalid entity')
  if (!Array.isArray(input.variables) || input.variables.length > 80) throw new Error('Provide a variables array with at most 80 entries')
  const variables = input.variables.map(variable => {
    if (!isRecord(variable) || !boundedText(variable.key, 100) || !boundedText(variable.label, 200) || typeof variable.placeholder !== 'string' || variable.placeholder.length > 500) throw new Error('Each variable needs key, label and placeholder')
    return { key: variable.key, label: variable.label, placeholder: variable.placeholder }
  })
  if (new Set(variables.map(variable => variable.key)).size !== variables.length) throw new Error('Template variable keys must be unique')
  const existing = input.id === undefined ? null : boundedText(input.id, 100) ? await prisma.contractTemplate.findUniqueOrThrow({ where: { id: input.id } }) : null
  if (input.id !== undefined && (!existing || input.updatedAt !== existing.updated_at.toISOString())) throw new Error('Template changed. Read its current updatedAt before saving')
  const id = existing?.id ?? randomUUID()
  const bytes = Buffer.from(input.content, 'utf8')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const fileUrl = await uploadBufferToS3(bytes, `templates/${id}/${hash}.txt`, 'text/plain; charset=utf-8')
  const data = { name: input.name, category: input.category as DocumentCategory, entity: (input.entity ?? null) as Entity | null, content: input.content, variables, is_active: true }
  return prisma.$transaction(async tx => {
    if (existing) {
      const changed = await tx.contractTemplate.updateMany({ where: { id, updated_at: existing.updated_at }, data })
      if (changed.count !== 1) throw new Error('Template changed. Refresh before saving')
    } else await tx.contractTemplate.create({ data: { id, ...data } })
    const artifact = await recordArtifact({ templateId: id, stage: 'template', fileUrl, originalName: `${id}.txt`, mimeType: 'text/plain', bytes, actorId: actor.userId }, tx)
    await tx.authAccessEvent.create({ data: { app_user_id: actor.userId, event_type: 'template_saved', event_status: 'success', metadata: { templateId: id, artifactId: artifact.id, hash } } })
    return { templateId: id, artifactId: artifact.id }
  })
}

export async function readTextTemplate(session: SessionPayload, id: string) {
  await requireGlobalDocumentAccess(session)
  return prisma.contractTemplate.findUnique({ where: { id }, select: { id: true, name: true, category: true, entity: true, content: true, variables: true, updated_at: true, is_active: true } })
}
