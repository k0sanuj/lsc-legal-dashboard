import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const event = body?.event

  if (!event) return Response.json({ ok: true })

  const eventType = event.event_type
  const signatureRequest = event.signature_request

  if (eventType === 'signature_request_signed') {
    // A signer completed — update their SignatureRequest
    for (const signature of signatureRequest?.signatures ?? []) {
      if (signature.status_code === 'signed') {
        await prisma.signatureRequest.updateMany({
          where: { signatory_email: signature.signer_email_address, status: 'SENT' },
          data: { status: 'SIGNED', signed_at: new Date() },
        })
      }
    }
  }

  if (eventType === 'signature_request_all_signed') {
    // All signed — find and transition the document
    // Match by title (HelloSign doesn't store our doc ID)
    const title = signatureRequest?.title
    if (title) {
      const doc = await prisma.legalDocument.findFirst({
        where: { title, lifecycle_status: 'AWAITING_SIGNATURE' },
      })
      if (doc) {
        await prisma.legalDocument.update({
          where: { id: doc.id },
          data: { lifecycle_status: 'SIGNED' },
        })
        await prisma.lifecycleEvent.create({
          data: {
            document_id: doc.id,
            from_status: 'AWAITING_SIGNATURE',
            to_status: 'SIGNED',
            transitioned_by: 'system',
            notes: 'All parties signed via HelloSign',
          },
        })
      }
    }
  }

  return Response.json({ ok: true })
}
