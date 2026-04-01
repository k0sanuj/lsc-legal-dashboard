'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { Entity } from '@/generated/prisma/client'

export async function createClickwrapAcceptance(formData: FormData) {
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  await prisma.clickwrapAcceptance.create({
    data: {
      person_name: formData.get('person_name') as string,
      person_email: formData.get('person_email') as string,
      agreement_title: formData.get('agreement_title') as string,
      agreement_version: formData.get('agreement_version')
        ? parseInt(formData.get('agreement_version') as string, 10)
        : 1,
      ip_address: (formData.get('ip_address') as string) || null,
      entity: formData.get('entity') ? (formData.get('entity') as Entity) : null,
    },
  })

  revalidatePath('/legal/clickwrap')
  return { success: true }
}
