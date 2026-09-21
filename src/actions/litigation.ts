'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { runAgent } from '@/lib/agents/orchestrator'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { saveDispute, setDisputeStatus } from '@/lib/dispute-service'
import { parseDisputeAmount, disputeCurrency, DISPUTE_KINDS } from '@/lib/dispute-rules'
import { dateField, enumField, requiredText, textField, ENTITY_CODES, JURISDICTION_CODES } from '@/lib/entity-input'
import { uploadToS3, getS3Key } from '@/lib/s3'
import { extractTextFromFile } from '@/lib/extract-text'
import type { LitigationStatus } from '@/generated/prisma/client'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export async function createLitigationCase(formData: FormData) {
  const session = await requireGlobalDocumentAccess(await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN']))
  const id = textField(formData, 'id') ?? undefined
  const result = await saveDispute(session, {
    id, revision: id ? Number(requiredText(formData, 'revision')) : undefined,
    case_name: requiredText(formData, 'case_name', 300),
    case_number: textField(formData, 'case_number', false, 200),
    jurisdiction: enumField(formData, 'jurisdiction', JURISDICTION_CODES),
    court_tribunal: textField(formData, 'court_tribunal', false, 400),
    entity: enumField(formData, 'entity', ENTITY_CODES),
    dispute_kind: enumField(formData, 'dispute_kind', DISPUTE_KINDS),
    claim_type: requiredText(formData, 'claim_type', 200),
    plaintiff: requiredText(formData, 'plaintiff', 400),
    defendant: requiredText(formData, 'defendant', 400),
    estimated_liability: parseDisputeAmount(textField(formData, 'estimated_liability', false, 40)),
    currency: disputeCurrency(requiredText(formData, 'currency', 3)),
    exposure_basis: textField(formData, 'exposure_basis'),
    exposure_as_of: dateField(formData, 'exposure_as_of'),
    notes: textField(formData, 'notes'),
  })
  revalidatePath('/legal/litigation')
  revalidatePath('/legal/arbitration')
  revalidatePath(`/legal/litigation/${result.caseId}`)
  return result
}

export async function updateLitigationStatus(caseId: string, newStatus: LitigationStatus) {
  const session = await requireGlobalDocumentAccess(await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN']))
  const result = await setDisputeStatus(session, caseId, newStatus)
  revalidatePath('/legal/litigation')
  revalidatePath('/legal/arbitration')
  revalidatePath(`/legal/litigation/${caseId}`)
  return result
}

export async function updateDisputeStatusForm(formData: FormData) {
  const status = enumField(formData, 'status', ['PRE_FILING', 'FILED', 'DISCOVERY', 'TRIAL', 'APPEAL', 'SETTLED', 'CLOSED'] as const)
  return updateLitigationStatus(requiredText(formData, 'case_id'), status)
}

export async function addLitigationEvent(formData: FormData) {
  const session = await requireGlobalDocumentAccess(await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN']))

  await prisma.litigationEvent.create({
    data: {
      case_id: requiredText(formData, 'case_id'),
      created_by: session.userId,
      event_type: requiredText(formData, 'event_type', 100),
      title: requiredText(formData, 'title', 400),
      description: (formData.get('description') as string) || null,
      event_date: dateField(formData, 'event_date', true)!,
    },
  })

  const caseId = formData.get('case_id') as string
  revalidatePath(`/legal/litigation/${caseId}`)
  return { success: true }
}

export async function uploadLitigationDocument(formData: FormData) {
  const session = await requireGlobalDocumentAccess(await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN']))

  const caseId = formData.get('caseId') as string
  const file = formData.get('file') as File
  const title = ((formData.get('title') as string) || file?.name || '').trim()
  const docType = ((formData.get('docType') as string) || 'case_document').trim()

  if (!caseId || !file || !title) {
    return { success: false, error: 'Case, title, and file are required.' }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { success: false, error: 'File too large (max 25MB).' }
  }

  const caseRecord = await prisma.litigationCase.findUnique({
    where: { id: caseId },
    select: { entity: true, case_name: true },
  })
  if (!caseRecord) {
    return { success: false, error: 'Litigation case not found.' }
  }

  const key = getS3Key(caseRecord.entity, 'litigation', file.name)
  const fileUrl = await uploadToS3(file, key)
  const extractedText = await extractTextFromFile(file)

  const document = await prisma.litigationDocument.create({
    data: {
      case_id: caseId,
      title,
      doc_type: docType,
      file_url: fileUrl,
      uploaded_by: session.userId,
    },
  })

  await prisma.litigationEvent.create({
    data: {
      case_id: caseId,
      event_type: 'document_upload',
      title: `Document uploaded: ${title}`,
      event_date: new Date(),
      created_by: session.userId,
    },
  })

  const content = extractedText.trim() || `${caseRecord.case_name}\n${title}`
  after(async () => {
    try {
      await runAgent('agreement-analyzer', {
        litigationDocumentId: document.id,
        sourceType: 'litigation_document',
        sourceLabel: file.name,
        content,
      })
    } catch (error) {
      console.error('Litigation document analysis failed (non-blocking):', error)
    }
  })

  revalidatePath(`/legal/litigation/${caseId}`)
  return { success: true, documentId: document.id, hasFile: true }
}
