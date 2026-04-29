'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createEmbeddedUnclaimedDraft } from '@/lib/hellosign'
import { getPresignedUrl, getS3KeyFromUrl } from '@/lib/s3'
import { revalidatePath } from 'next/cache'

function getDropboxSignErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('HELLOSIGN_API_KEY')) {
      return 'Dropbox Sign API key is not configured. Add HELLOSIGN_API_KEY to the environment.'
    }
    if (error.message.includes('HELLOSIGN_CLIENT_ID')) {
      return 'Dropbox Sign Embedded Requesting is not configured. Add HELLOSIGN_CLIENT_ID from the Dropbox Sign API app.'
    }
    if (error.message.includes('claim URL')) {
      return 'Dropbox Sign did not return an embedded preparation URL. Check the API app setup.'
    }
  }
  return 'Failed to create Dropbox Sign preparation session'
}

async function getDropboxSignFileUrl(fileUrl: string): Promise<string> {
  const s3Key = getS3KeyFromUrl(fileUrl)
  if (!s3Key) return fileUrl
  return getPresignedUrl(s3Key)
}

export async function createEmbeddedSignatureDraft(documentId: string) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    include: { signature_requests: true },
  })
  if (!doc) return { success: false, error: 'Document not found' }

  const signers = doc.signature_requests
    .filter((sr) => sr.status === 'PENDING')
    .map((sr) => ({ name: sr.signatory_name, email: sr.signatory_email }))

  if (signers.length === 0) return { success: false, error: 'No pending signatories' }
  if (!doc.file_url) return { success: false, error: 'Document file required before sending for signature' }

  try {
    const fileUrl = await getDropboxSignFileUrl(doc.file_url)
    const draft = await createEmbeddedUnclaimedDraft({
      title: doc.title,
      subject: `Signature required: ${doc.title}`,
      message: `Please review and sign this document from League Sports Co.`,
      requesterEmailAddress: session.email,
      signers,
      fileUrl,
      metadata: { documentId: doc.id },
    })

    if (draft.signatureRequestId) {
      await prisma.legalDocument.update({
        where: { id: documentId },
        data: { hellosign_envelope_id: draft.signatureRequestId },
      })
    }

    revalidatePath(`/legal/documents/${documentId}`)
    revalidatePath('/legal/signatures')
    return { success: true, ...draft }
  } catch (error) {
    console.error('Dropbox Sign embedded draft error:', error)
    return { success: false, error: getDropboxSignErrorMessage(error) }
  }
}

export async function sendForSignature(documentId: string) {
  return createEmbeddedSignatureDraft(documentId)
}
