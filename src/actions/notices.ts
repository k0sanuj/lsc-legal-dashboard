'use server'

import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { notifyAdmins } from './notifications'
import type { NoticeCategory, NoticeStatus } from '@/generated/prisma/client'

export async function createIncomingNotice(data: {
  subject: string
  from_email?: string
  body?: string
  category: NoticeCategory
}) {
  await requireSession()

  const notice = await prisma.incomingNotice.create({
    data: {
      subject: data.subject,
      from_email: data.from_email || null,
      body: data.body || null,
      category: data.category,
    },
  })

  // Notify admins
  await notifyAdmins(
    'incoming_notice',
    'New Incoming Notice',
    `${data.category}: ${data.subject}`,
    '/legal/compliance'
  )

  revalidatePath('/legal/compliance')
  return { success: true, noticeId: notice.id }
}

export async function updateNoticeStatus(noticeId: string, status: NoticeStatus, assignedTo?: string) {
  await requireSession()

  await prisma.incomingNotice.update({
    where: { id: noticeId },
    data: {
      status,
      assigned_to: assignedTo ?? undefined,
    },
  })

  revalidatePath('/legal/compliance')
  return { success: true }
}
