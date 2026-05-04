import { createHash } from 'node:crypto'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { decodeGmailPubSubData, getRecentMessages, isWatchedMailbox } from '@/lib/gmail'
import { notifyAdmins } from '@/actions/notifications'
import { runAgent } from '@/lib/agents/orchestrator'
import { isAuthorizedSharedSecretRequest } from '@/lib/webhook-auth'

export const runtime = 'nodejs'

type WebhookLogStartResult = {
  id: string
  duplicate: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function getPubSubMessage(body: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(body)?.message)
}

function getGmailEventHash(body: unknown): string {
  const message = getPubSubMessage(body)
  const messageId = getString(message?.messageId) ?? getString(message?.message_id)
  if (messageId) return `gmail:${messageId}`

  return `gmail:${createHash('sha256').update(JSON.stringify(body) ?? '').digest('hex')}`
}

async function startWebhookEventLog(body: unknown): Promise<WebhookLogStartResult> {
  const eventHash = getGmailEventHash(body)
  const existing = await prisma.webhookEventLog.findUnique({
    where: { event_hash: eventHash },
    select: { id: true, processing_status: true },
  })

  if (existing && ['processed', 'ignored'].includes(existing.processing_status)) {
    return { id: existing.id, duplicate: true }
  }

  if (existing) {
    const updated = await prisma.webhookEventLog.update({
      where: { id: existing.id },
      data: {
        event_type: 'gmail.pubsub',
        processing_status: 'processing',
        raw_payload: body as Prisma.InputJsonValue,
        error: null,
        processed_at: null,
      },
      select: { id: true },
    })
    return { id: updated.id, duplicate: false }
  }

  const created = await prisma.webhookEventLog.create({
    data: {
      provider: 'gmail',
      event_hash: eventHash,
      event_type: 'gmail.pubsub',
      processing_status: 'processing',
      raw_payload: body as Prisma.InputJsonValue,
    },
    select: { id: true },
  })
  return { id: created.id, duplicate: false }
}

async function finishWebhookEventLog(
  id: string,
  processingStatus: 'processed' | 'ignored' | 'failed',
  error?: string
) {
  await prisma.webhookEventLog.update({
    where: { id },
    data: {
      processing_status: processingStatus,
      error: error ?? null,
      processed_at: new Date(),
    },
  })
}

export async function POST(request: Request) {
  if (!isAuthorizedSharedSecretRequest(request, 'GMAIL_WEBHOOK_SECRET')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const eventLog = await startWebhookEventLog(body)
  if (eventLog.duplicate) {
    return Response.json({ ok: true, duplicate: true })
  }

  // Gmail Pub/Sub sends base64 encoded data
  const data = getString(getPubSubMessage(body)?.data)
  if (!data) {
    await finishWebhookEventLog(eventLog.id, 'ignored', 'Missing Pub/Sub message.data')
    return Response.json({ ok: true, ignored: true })
  }

  let notification: ReturnType<typeof decodeGmailPubSubData>
  try {
    notification = decodeGmailPubSubData(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finishWebhookEventLog(eventLog.id, 'ignored', `Invalid Pub/Sub data: ${message}`)
    return Response.json({ ok: true, ignored: true })
  }
  const mailbox = notification.emailAddress?.toLowerCase()
  if (!isWatchedMailbox(mailbox)) {
    await finishWebhookEventLog(
      eventLog.id,
      'ignored',
      mailbox ? `Mailbox ${mailbox} is not watched` : 'Missing notification emailAddress'
    )
    return Response.json({ ok: true, ignored: true })
  }

  // Fetch recent unread messages for only the mailbox that changed.
  let created = 0
  let skipped = 0
  let invoiceAgentFailures = 0

  try {
    const messages = await getRecentMessages(mailbox, 5)

    for (const msg of messages) {
      // Check if we already have this notice
      const existing = await prisma.incomingNotice.findFirst({
        where: {
          subject: msg.subject,
          from_email: msg.from,
          source_mailbox: msg.mailbox,
        },
      })
      if (existing) {
        skipped += 1
        continue
      }

      // Auto-categorize
      const subject = msg.subject.toLowerCase()
      let category: 'DATA_PROTECTION' | 'COMPLAINT' | 'LEGAL_NOTICE' | 'REGULATORY' | 'OTHER' =
        'OTHER'
      if (subject.includes('data') || subject.includes('gdpr') || subject.includes('privacy'))
        category = 'DATA_PROTECTION'
      else if (subject.includes('complaint') || subject.includes('dispute'))
        category = 'COMPLAINT'
      else if (subject.includes('notice') || subject.includes('legal'))
        category = 'LEGAL_NOTICE'
      else if (
        subject.includes('regulatory') ||
        subject.includes('compliance') ||
        subject.includes('filing')
      )
        category = 'REGULATORY'

      await prisma.incomingNotice.create({
        data: {
          subject: msg.subject,
          from_email: msg.from,
          source_mailbox: msg.mailbox,
          body: msg.snippet,
          category,
          forwarded_to: ['arvind@leaguesports.co', 'ak@leaguesports.co'],
        },
      })
      created += 1

      await notifyAdmins(
        'NOTICE_RECEIVED',
        `New email: ${msg.subject}`,
        `To: ${msg.mailbox}\nFrom: ${msg.from}`,
        '/legal/compliance'
      )

      // Run invoice detection agent on the email
      try {
        await runAgent('email-inbox.invoice-detection', {
          emailBody: msg.snippet,
          mailbox: msg.mailbox,
          from: msg.from,
          subject: msg.subject,
        })
      } catch (e) {
        invoiceAgentFailures += 1
        console.error('Invoice detection agent failed (non-blocking):', e)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finishWebhookEventLog(eventLog.id, 'failed', message)
    console.error('Gmail webhook error:', error)
    return Response.json({ error: 'Gmail webhook processing failed' }, { status: 500 })
  }

  await finishWebhookEventLog(
    eventLog.id,
    'processed',
    invoiceAgentFailures
      ? `Invoice detection agent failed for ${invoiceAgentFailures} message(s)`
      : undefined
  )

  return Response.json({ ok: true, created, skipped, invoiceAgentFailures })
}
