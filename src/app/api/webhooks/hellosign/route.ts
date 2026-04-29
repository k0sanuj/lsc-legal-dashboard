import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'
import { emitFinanceEvent } from '@/lib/finance-webhook'
import { buildContractPayload } from '@/lib/finance-payloads'
import { mapLifecycleStatusToContractStatus } from '@/lib/finance-mapping'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const event = body?.event

  if (!event) return Response.json({ ok: true })

  const eventType = event.event_type
  const signatureRequest = event.signature_request
  const signatureRequestId =
    signatureRequest?.signature_request_id ?? signatureRequest?.signatureRequestId
  const signatureRequestTitle = signatureRequest?.title

  if (eventType === 'signature_request_signed') {
    const linkedDoc = signatureRequestId || signatureRequestTitle
      ? await prisma.legalDocument.findFirst({
          where: {
            OR: [
              ...(signatureRequestId ? [{ hellosign_envelope_id: signatureRequestId }] : []),
              ...(signatureRequestTitle ? [{ title: signatureRequestTitle }] : []),
            ],
          },
          select: { id: true },
        })
      : null

    // A signer completed — update their SignatureRequest
    for (const signature of signatureRequest?.signatures ?? []) {
      if (signature.status_code === 'signed' && linkedDoc) {
        await prisma.signatureRequest.updateMany({
          where: {
            signatory_email: signature.signer_email_address,
            status: 'SENT',
            document_id: linkedDoc.id,
          },
          data: { status: 'SIGNED', signed_at: new Date() },
        })
      }
    }
  }

  if (eventType === 'signature_request_all_signed') {
    // All signed — find and transition the document
    // Prefer the persisted Dropbox Sign envelope id; title is a legacy fallback.
    const title = signatureRequestTitle
    if (signatureRequestId || title) {
      const doc = await prisma.legalDocument.findFirst({
        where: {
          lifecycle_status: 'AWAITING_SIGNATURE',
          OR: [
            ...(signatureRequestId ? [{ hellosign_envelope_id: signatureRequestId }] : []),
            ...(title ? [{ title }] : []),
          ],
        },
      })
      if (doc) {
        const updated = await prisma.legalDocument.update({
          where: { id: doc.id },
          data: {
            lifecycle_status: 'SIGNED',
            // Auto-promote contract_status so the Finance payload is correct
            contract_status: mapLifecycleStatusToContractStatus('SIGNED'),
          },
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

        // Mirror to Finance — first-time = contract.created, otherwise update.
        // Errors are logged; the durable queue + cron handles retries.
        try {
          const eventType = doc.last_finance_post_at
            ? 'contract.updated'
            : 'contract.created'
          const result = await emitFinanceEvent(
            eventType,
            buildContractPayload(updated),
            { entityType: 'LegalDocument', entityId: updated.id }
          )
          await prisma.legalDocument.update({
            where: { id: updated.id },
            data: {
              last_finance_post_at: new Date(),
              finance_post_status: result.ok ? 'synced' : 'failed',
              last_finance_post_error: result.ok
                ? null
                : (result.error ?? 'Unknown error'),
            },
          })
        } catch (err) {
          console.error(
            `HelloSign → Finance sync failed for doc ${updated.id}:`,
            err
          )
        }
      }
    }
  }

  return Response.json({ ok: true })
}
