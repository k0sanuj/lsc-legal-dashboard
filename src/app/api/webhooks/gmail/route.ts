import { prisma } from '@/lib/prisma'
import { getRecentMessages } from '@/lib/gmail'
import { notifyAdmins } from '@/actions/notifications'
import { runAgent } from '@/lib/agents/orchestrator'

export async function POST(request: Request) {
  const body = await request.json()

  // Gmail Pub/Sub sends base64 encoded data
  const data = body?.message?.data
  if (!data) return Response.json({ ok: true })

  // Fetch recent unread messages
  try {
    const messages = await getRecentMessages(5)

    for (const msg of messages) {
      // Check if we already have this notice
      const existing = await prisma.incomingNotice.findFirst({
        where: { subject: msg.subject, from_email: msg.from },
      })
      if (existing) continue

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
          body: msg.snippet,
          category,
          forwarded_to: ['arvind@leaguesports.co', 'ak@leaguesports.co'],
        },
      })

      await notifyAdmins(
        'NOTICE_RECEIVED',
        `New email: ${msg.subject}`,
        `From: ${msg.from}`,
        '/legal/compliance'
      )

      // Run invoice detection agent on the email
      try {
        await runAgent('email-inbox.invoice-detection', {
          emailBody: msg.snippet,
          from: msg.from,
          subject: msg.subject,
        })
      } catch (e) {
        console.error('Invoice detection agent failed (non-blocking):', e)
      }
    }
  } catch (error) {
    console.error('Gmail webhook error:', error)
  }

  return Response.json({ ok: true })
}
