'use server'

import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function getNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: 20,
  })
}

export async function markNotificationRead(notificationId: string) {
  const session = await requireSession()
  await prisma.notification.update({
    where: { id: notificationId, user_id: session.userId },
    data: { read: true },
  })
  return { success: true }
}

export async function markAllNotificationsRead() {
  const session = await requireSession()
  await prisma.notification.updateMany({
    where: { user_id: session.userId, read: false },
    data: { read: true },
  })
  return { success: true }
}

export async function notifyAdmins(
  type: string,
  title: string,
  message: string,
  link?: string
) {
  const admins = await prisma.appUser.findMany({
    where: {
      role: { in: ['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'] },
      is_active: true,
    },
    select: { id: true },
  })

  if (admins.length === 0) return

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      user_id: admin.id,
      type,
      title,
      message,
      link,
    })),
  })
}
