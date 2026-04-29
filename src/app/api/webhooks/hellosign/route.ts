import {
  EventCallbackHelper,
  EventCallbackRequest,
  EventCallbackRequestEvent,
  type SignatureRequestResponse,
} from '@dropbox/sign'
import { NextRequest } from 'next/server'
import { Prisma, type LegalDocument } from '@/generated/prisma/client'
import { emitFinanceEvent } from '@/lib/finance-webhook'
import { buildContractPayload } from '@/lib/finance-payloads'
import { getDropboxSignApiKey, downloadSignatureRequestPdf } from '@/lib/hellosign'
import { mapLifecycleStatusToContractStatus } from '@/lib/finance-mapping'
import { prisma } from '@/lib/prisma'
import { getS3Key, uploadBufferToS3 } from '@/lib/s3'

export const runtime = 'nodejs'

const ACCEPTED_RESPONSE = 'Hello API Event Received'
const PROVIDER = 'dropbox_sign'

type WebhookProcessResult = {
  documentId?: string
  status: 'processed' | 'ignored'
  error?: string
}

function accepted() {
  return new Response(ACCEPTED_RESPONSE, { status: 200 })
}

async function parseDropboxSignPayload(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const json = formData.get('json')
    if (typeof json !== 'string') {
      throw new Error('Dropbox Sign multipart callback did not include json field')
    }
    return JSON.parse(json)
  }

  return request.json()
}

function getEventDate(eventTime?: string): Date {
  const unixSeconds = Number(eventTime)
  if (!Number.isFinite(unixSeconds)) return new Date()
  return new Date(unixSeconds * 1000)
}

function normalizeEmail(email?: string | null): string | null {
  return email ? email.trim().toLowerCase() : null
}

function getMetadataDocumentId(
  signatureRequest?: SignatureRequestResponse
): string | undefined {
  const documentId = signatureRequest?.metadata?.documentId
  return typeof documentId === 'string' && documentId ? documentId : undefined
}

async function findLinkedDocument(signatureRequest?: SignatureRequestResponse) {
  const signatureRequestId = signatureRequest?.signatureRequestId
  const metadataDocumentId = getMetadataDocumentId(signatureRequest)
  const title = signatureRequest?.title
  const or: Prisma.LegalDocumentWhereInput[] = []

  if (metadataDocumentId) or.push({ id: metadataDocumentId })
  if (signatureRequestId) {
    or.push({ hellosign_envelope_id: signatureRequestId })
  }
  if (title) or.push({ title })
  if (or.length === 0) return null

  return prisma.legalDocument.findFirst({ where: { OR: or } })
}

async function markSignatureRequestSent(
  signatureRequest: SignatureRequestResponse | undefined,
  eventTime?: string
): Promise<WebhookProcessResult> {
  const doc = await findLinkedDocument(signatureRequest)
  if (!doc) {
    return {
      status: 'ignored',
      error: 'No Legal document matched the Dropbox Sign request',
    }
  }

  const signatureRequestId = signatureRequest?.signatureRequestId ?? null
  const sentAt = getEventDate(eventTime)

  await prisma.$transaction(async (tx) => {
    await tx.legalDocument.update({
      where: { id: doc.id },
      data: {
        hellosign_envelope_id: signatureRequestId ?? doc.hellosign_envelope_id,
        lifecycle_status:
          doc.lifecycle_status === 'SIGNED'
            ? doc.lifecycle_status
            : 'AWAITING_SIGNATURE',
      },
    })

    await tx.signatureRequest.updateMany({
      where: { document_id: doc.id, status: 'PENDING' },
      data: { status: 'SENT', sent_at: sentAt, stalled_reason: null },
    })

    if (
      doc.lifecycle_status !== 'AWAITING_SIGNATURE' &&
      doc.lifecycle_status !== 'SIGNED'
    ) {
      await tx.lifecycleEvent.create({
        data: {
          document_id: doc.id,
          from_status: doc.lifecycle_status,
          to_status: 'AWAITING_SIGNATURE',
          transitioned_by: 'system',
          notes: 'Sent for signature via Dropbox Sign',
        },
      })
    }
  })

  return { status: 'processed', documentId: doc.id }
}

async function rememberPreparedRequest(
  signatureRequest: SignatureRequestResponse | undefined
): Promise<WebhookProcessResult> {
  const doc = await findLinkedDocument(signatureRequest)
  if (!doc) {
    return {
      status: 'ignored',
      error: 'Prepared Dropbox Sign request did not match a Legal document',
    }
  }

  if (signatureRequest?.signatureRequestId) {
    await prisma.legalDocument.update({
      where: { id: doc.id },
      data: { hellosign_envelope_id: signatureRequest.signatureRequestId },
    })
  }

  return { status: 'processed', documentId: doc.id }
}

async function markSignedSigners(
  signatureRequest: SignatureRequestResponse | undefined,
  eventTime?: string
): Promise<WebhookProcessResult> {
  const doc = await findLinkedDocument(signatureRequest)
  if (!doc) {
    return {
      status: 'ignored',
      error: 'No Legal document matched the signed Dropbox Sign request',
    }
  }

  const signedAtFallback = getEventDate(eventTime)

  for (const signature of signatureRequest?.signatures ?? []) {
    if (signature.statusCode !== 'signed') continue

    const email = normalizeEmail(signature.signerEmailAddress)
    if (!email) continue

    await prisma.signatureRequest.updateMany({
      where: {
        document_id: doc.id,
        signatory_email: email,
        status: { in: ['PENDING', 'SENT', 'STALLED'] },
      },
      data: {
        status: 'SIGNED',
        signed_at: signature.signedAt
          ? new Date(signature.signedAt * 1000)
          : signedAtFallback,
        stalled_reason: null,
      },
    })
  }

  return { status: 'processed', documentId: doc.id }
}

async function storeSignedPdfAndSyncFinance(
  doc: LegalDocument,
  signatureRequestId: string,
  eventTime?: string
) {
  const signedPdf = await downloadSignatureRequestPdf(signatureRequestId)
  const key = getS3Key(doc.entity, 'signed', `${doc.title}-signed.pdf`)
  const signedFileUrl = await uploadBufferToS3(
    signedPdf,
    key,
    'application/pdf'
  )
  const signedAt = getEventDate(eventTime)

  const updated = await prisma.$transaction(async (tx) => {
    const lastVersion = await tx.documentVersion.findFirst({
      where: { document_id: doc.id },
      orderBy: { version_number: 'desc' },
      select: { version_number: true },
    })

    await tx.signatureRequest.updateMany({
      where: { document_id: doc.id, status: { not: 'SIGNED' } },
      data: { status: 'SIGNED', signed_at: signedAt, stalled_reason: null },
    })

    await tx.documentVersion.create({
      data: {
        document_id: doc.id,
        version_number: (lastVersion?.version_number ?? 0) + 1,
        file_url: signedFileUrl,
        change_summary: 'Completed signed copy from Dropbox Sign',
        created_by: 'system',
      },
    })

    const updatedDoc = await tx.legalDocument.update({
      where: { id: doc.id },
      data: {
        file_url: signedFileUrl,
        lifecycle_status: 'SIGNED',
        hellosign_envelope_id: signatureRequestId,
        contract_status: mapLifecycleStatusToContractStatus('SIGNED'),
      },
    })

    if (doc.lifecycle_status !== 'SIGNED') {
      await tx.lifecycleEvent.create({
        data: {
          document_id: doc.id,
          from_status: doc.lifecycle_status,
          to_status: 'SIGNED',
          transitioned_by: 'system',
          notes: 'All parties signed via Dropbox Sign',
        },
      })
    }

    return updatedDoc
  })

  const financeEventType = doc.last_finance_post_at
    ? 'contract.updated'
    : 'contract.created'
  const result = await emitFinanceEvent(
    financeEventType,
    buildContractPayload(updated),
    { entityType: 'LegalDocument', entityId: updated.id }
  )

  await prisma.legalDocument.update({
    where: { id: updated.id },
    data: {
      last_finance_post_at: new Date(),
      finance_post_status: result.ok ? 'synced' : 'failed',
      last_finance_post_error: result.ok ? null : (result.error ?? 'Unknown error'),
    },
  })
}

async function markAllSigned(
  signatureRequest: SignatureRequestResponse | undefined,
  eventTime?: string
): Promise<WebhookProcessResult> {
  const doc = await findLinkedDocument(signatureRequest)
  const signatureRequestId = signatureRequest?.signatureRequestId

  if (!doc || !signatureRequestId) {
    return {
      status: 'ignored',
      error: 'All-signed Dropbox Sign event could not be linked to a document',
    }
  }

  await storeSignedPdfAndSyncFinance(doc, signatureRequestId, eventTime)
  return { status: 'processed', documentId: doc.id }
}

async function markStalled(
  signatureRequest: SignatureRequestResponse | undefined,
  eventType: string
): Promise<WebhookProcessResult> {
  const doc = await findLinkedDocument(signatureRequest)
  if (!doc) {
    return {
      status: 'ignored',
      error: 'Stalled Dropbox Sign event did not match a Legal document',
    }
  }

  const affectedEmails = (signatureRequest?.signatures ?? [])
    .filter((signature) => signature.statusCode !== 'signed')
    .map((signature) => normalizeEmail(signature.signerEmailAddress))
    .filter((email): email is string => Boolean(email))

  const declineReason = (signatureRequest?.signatures ?? [])
    .map((signature) => signature.declineReason ?? signature.error)
    .find(Boolean)
  const reason = declineReason
    ? `${eventType}: ${declineReason}`
    : `Dropbox Sign ${eventType}`

  await prisma.$transaction([
    prisma.signatureRequest.updateMany({
      where: {
        document_id: doc.id,
        status: { in: ['PENDING', 'SENT'] },
        ...(affectedEmails.length
          ? { signatory_email: { in: affectedEmails } }
          : {}),
      },
      data: { status: 'STALLED', stalled_reason: reason },
    }),
    prisma.lifecycleEvent.create({
      data: {
        document_id: doc.id,
        from_status: doc.lifecycle_status,
        to_status: doc.lifecycle_status,
        transitioned_by: 'system',
        notes: reason,
      },
    }),
  ])

  return { status: 'processed', documentId: doc.id, error: reason }
}

async function processDropboxSignEvent(
  callback: EventCallbackRequest
): Promise<WebhookProcessResult> {
  const eventType = callback.event.eventType
  const signatureRequest = callback.signatureRequest
  const eventTime = callback.event.eventTime

  switch (eventType) {
    case EventCallbackRequestEvent.EventTypeEnum.CallbackTest:
      return { status: 'processed' }
    case EventCallbackRequestEvent.EventTypeEnum.SignatureRequestPrepared:
      return rememberPreparedRequest(signatureRequest)
    case EventCallbackRequestEvent.EventTypeEnum.SignatureRequestSent:
      return markSignatureRequestSent(signatureRequest, eventTime)
    case EventCallbackRequestEvent.EventTypeEnum.SignatureRequestSigned:
      return markSignedSigners(signatureRequest, eventTime)
    case EventCallbackRequestEvent.EventTypeEnum.SignatureRequestAllSigned:
      return markAllSigned(signatureRequest, eventTime)
    case EventCallbackRequestEvent.EventTypeEnum.SignatureRequestDeclined:
    case EventCallbackRequestEvent.EventTypeEnum.SignatureRequestCanceled:
    case EventCallbackRequestEvent.EventTypeEnum.SignatureRequestExpired:
    case EventCallbackRequestEvent.EventTypeEnum.SignatureRequestInvalid:
    case EventCallbackRequestEvent.EventTypeEnum.SignatureRequestEmailBounce:
    case EventCallbackRequestEvent.EventTypeEnum.FileError:
    case EventCallbackRequestEvent.EventTypeEnum.UnknownError:
      return markStalled(signatureRequest, eventType)
    default:
      return { status: 'ignored', error: `Unhandled Dropbox Sign event ${eventType}` }
  }
}

export async function POST(request: NextRequest) {
  let payload: unknown
  let callback: EventCallbackRequest

  try {
    payload = await parseDropboxSignPayload(request)
    callback = EventCallbackRequest.init(payload)
  } catch (error) {
    console.error('Dropbox Sign webhook parse failed:', error)
    return new Response('Invalid Dropbox Sign callback payload', { status: 400 })
  }

  const eventHash = callback.event?.eventHash
  const eventType = callback.event?.eventType
  if (!eventHash || !eventType) {
    return new Response('Invalid Dropbox Sign callback event', { status: 400 })
  }

  let apiKey: string
  try {
    apiKey = getDropboxSignApiKey()
  } catch (error) {
    console.error('Dropbox Sign webhook missing API key:', error)
    return new Response('Dropbox Sign webhook is not configured', { status: 500 })
  }

  if (!EventCallbackHelper.isValid(apiKey, callback)) {
    return new Response('Invalid Dropbox Sign callback signature', { status: 401 })
  }

  const signatureRequestId = callback.signatureRequest?.signatureRequestId ?? null
  const existing = await prisma.webhookEventLog.findUnique({
    where: { event_hash: eventHash },
    select: { id: true },
  })

  if (existing) {
    return accepted()
  }

  let log: { id: string }
  try {
    log = await prisma.webhookEventLog.create({
      data: {
        provider: PROVIDER,
        event_hash: eventHash,
        event_type: eventType,
        signature_request_id: signatureRequestId,
        processing_status: 'received',
        raw_payload: payload as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return accepted()
    }
    throw error
  }

  try {
    const result = await processDropboxSignEvent(callback)
    await prisma.webhookEventLog.update({
      where: { id: log.id },
      data: {
        document_id: result.documentId ?? null,
        processing_status: result.status,
        error: result.error ?? null,
        processed_at: new Date(),
      },
    })
    return accepted()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Dropbox Sign webhook error'
    console.error('Dropbox Sign webhook processing failed:', error)
    await prisma.webhookEventLog.update({
      where: { id: log.id },
      data: {
        processing_status: 'failed',
        error: message,
        processed_at: new Date(),
      },
    })
    return new Response('Dropbox Sign webhook processing failed', { status: 500 })
  }
}
