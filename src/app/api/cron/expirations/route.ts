import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyAdmins } from '@/actions/notifications'

export async function GET(request: Request) {
  // Verify cron secret for Vercel
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const in30d = new Date(now.getTime() + 30 * 86400000)

  // Find documents expiring within 30 days that are still active
  const expiringDocs = await prisma.legalDocument.findMany({
    where: {
      expiry_date: { gte: now, lte: in30d },
      lifecycle_status: { in: ['ACTIVE', 'SIGNED'] },
    },
    select: { id: true, title: true, expiry_date: true, entity: true },
  })

  // Auto-transition ACTIVE docs within 30 days to EXPIRING
  const toTransition = expiringDocs.filter(
    (doc) => doc.expiry_date && doc.expiry_date <= in30d
  )

  let transitioned = 0

  for (const doc of toTransition) {
    try {
      await prisma.$transaction([
        prisma.legalDocument.update({
          where: { id: doc.id, lifecycle_status: 'ACTIVE' },
          data: { lifecycle_status: 'EXPIRING' },
        }),
        prisma.lifecycleEvent.create({
          data: {
            document_id: doc.id,
            from_status: 'ACTIVE',
            to_status: 'EXPIRING',
            transitioned_by: 'System (Cron)',
            notes: 'Auto-transitioned: document expiring within 30 days',
          },
        }),
      ])
      transitioned++
    } catch {
      // Document may have already been transitioned
    }
  }

  // Notify admins if any documents are expiring
  if (expiringDocs.length > 0) {
    await notifyAdmins(
      'expiration_warning',
      'Documents Expiring Soon',
      `${expiringDocs.length} document${expiringDocs.length === 1 ? '' : 's'} expiring within 30 days.`,
      '/legal/expirations'
    )
  }

  // Check for overdue compliance deadlines
  const overdueDeadlines = await prisma.complianceDeadline.findMany({
    where: {
      deadline_date: { lt: now },
      status: { in: ['UPCOMING', 'DUE_SOON'] },
    },
  })

  // Mark them as overdue
  if (overdueDeadlines.length > 0) {
    await prisma.complianceDeadline.updateMany({
      where: {
        id: { in: overdueDeadlines.map((d) => d.id) },
      },
      data: { status: 'OVERDUE' },
    })

    await notifyAdmins(
      'compliance_overdue',
      'Compliance Deadlines Overdue',
      `${overdueDeadlines.length} compliance deadline${overdueDeadlines.length === 1 ? '' : 's'} now overdue.`,
      '/legal/compliance'
    )
  }

  return NextResponse.json({
    ok: true,
    expiringDocuments: expiringDocs.length,
    transitioned,
    overdueDeadlines: overdueDeadlines.length,
    timestamp: now.toISOString(),
  })
}
