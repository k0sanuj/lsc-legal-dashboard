'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function approveFileRename(formData: FormData) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN'])
  const logId = formData.get('logId') as string

  await prisma.fileNamingLog.update({
    where: { id: logId },
    data: { approved: true, approved_by: session.fullName },
  })

  revalidatePath('/legal/file-naming')
  // void return for form action compatibility
}

export async function rejectFileRename(formData: FormData) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN'])
  const logId = formData.get('logId') as string

  await prisma.fileNamingLog.update({
    where: { id: logId },
    data: { approved: false, approved_by: session.fullName },
  })

  revalidatePath('/legal/file-naming')
  // void return for form action compatibility
}
