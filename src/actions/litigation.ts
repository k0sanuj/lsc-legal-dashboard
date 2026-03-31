'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { sendCrossDashboardMessage } from '@/lib/agents/orchestrator'
import type { Entity, Jurisdiction, LitigationStatus } from '@/generated/prisma/client'

export async function createLitigationCase(formData: FormData) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  const caseRecord = await prisma.litigationCase.create({
    data: {
      case_name: formData.get('case_name') as string,
      case_number: (formData.get('case_number') as string) || null,
      jurisdiction: formData.get('jurisdiction') as Jurisdiction,
      court_tribunal: (formData.get('court_tribunal') as string) || null,
      entity: formData.get('entity') as Entity,
      plaintiff: formData.get('plaintiff') as string,
      defendant: formData.get('defendant') as string,
      status: 'PRE_FILING',
      assigned_to: session.userId,
      estimated_liability: formData.get('estimated_liability') ? parseFloat(formData.get('estimated_liability') as string) : null,
    },
  })

  // Notify finance of financial exposure
  if (caseRecord.estimated_liability) {
    await sendCrossDashboardMessage(
      'legal',
      'litigation_exposure_created',
      'LitigationCase',
      caseRecord.id,
      {
        caseName: caseRecord.case_name,
        entity: caseRecord.entity,
        estimatedLiability: Number(caseRecord.estimated_liability),
        currency: caseRecord.currency,
      }
    )
  }

  revalidatePath('/legal/litigation')
  return { success: true, caseId: caseRecord.id }
}

export async function updateLitigationStatus(caseId: string, newStatus: LitigationStatus) {
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  const caseRecord = await prisma.litigationCase.update({
    where: { id: caseId },
    data: { status: newStatus },
  })

  await prisma.litigationEvent.create({
    data: {
      case_id: caseId,
      event_type: 'status_change',
      title: `Status changed to ${newStatus}`,
      event_date: new Date(),
    },
  })

  revalidatePath('/legal/litigation')
  revalidatePath(`/legal/litigation/${caseId}`)
  return { success: true }
}

export async function addLitigationEvent(formData: FormData) {
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  await prisma.litigationEvent.create({
    data: {
      case_id: formData.get('case_id') as string,
      event_type: formData.get('event_type') as string,
      title: formData.get('title') as string,
      description: (formData.get('description') as string) || null,
      event_date: new Date(formData.get('event_date') as string),
    },
  })

  const caseId = formData.get('case_id') as string
  revalidatePath(`/legal/litigation/${caseId}`)
  return { success: true }
}
