'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendSignatureRequest } from '@/lib/hellosign'
import { revalidatePath } from 'next/cache'

export async function sendForSignature(documentId: string) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  const doc = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    include: { signature_requests: true },
  })
  if (!doc) return { success: false, error: 'Document not found' }

  const signers = doc.signature_requests
    .filter((sr) => sr.status !== 'SIGNED')
    .map((sr) => ({ name: sr.signatory_name, email: sr.signatory_email }))

  if (signers.length === 0) return { success: false, error: 'No pending signatories' }

  try {
    await sendSignatureRequest({
      title: doc.title,
      subject: `Signature required: ${doc.title}`,
      message: `Please review and sign this document from League Sports Co.`,
      signers,
      fileUrl: doc.file_url ?? undefined,
    })

    // Update signature requests to SENT
    await prisma.signatureRequest.updateMany({
      where: { document_id: documentId, status: 'PENDING' },
      data: { status: 'SENT', sent_at: new Date() },
    })

    // Transition document to AWAITING_SIGNATURE if in NEGOTIATION
    if (doc.lifecycle_status === 'NEGOTIATION') {
      await prisma.legalDocument.update({
        where: { id: documentId },
        data: { lifecycle_status: 'AWAITING_SIGNATURE' },
      })
      await prisma.lifecycleEvent.create({
        data: {
          document_id: documentId,
          from_status: 'NEGOTIATION',
          to_status: 'AWAITING_SIGNATURE',
          transitioned_by: session.userId,
          notes: 'Sent for signature via HelloSign',
        },
      })
    }

    revalidatePath(`/legal/documents/${documentId}`)
    revalidatePath('/legal/signatures')
    return { success: true }
  } catch (error) {
    console.error('HelloSign error:', error)
    return { success: false, error: 'Failed to send signature request' }
  }
}
