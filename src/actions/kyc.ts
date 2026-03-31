'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { Entity, Jurisdiction, KycDocStatus } from '@/generated/prisma/client'

export async function createKycDocument(formData: FormData) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  await prisma.kycDocument.create({
    data: {
      entity: formData.get('entity') as Entity,
      jurisdiction: formData.get('jurisdiction') as Jurisdiction,
      document_type: formData.get('document_type') as string,
      document_name: formData.get('document_name') as string,
      status: 'COLLECTED',
      expiry_date: formData.get('expiry_date') ? new Date(formData.get('expiry_date') as string) : null,
    },
  })

  revalidatePath('/legal/kyc')
  return { success: true }
}

export async function updateKycStatus(docId: string, status: KycDocStatus) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  await prisma.kycDocument.update({
    where: { id: docId },
    data: {
      status,
      verified_by: status === 'VERIFIED' ? session.userId : undefined,
      verified_at: status === 'VERIFIED' ? new Date() : undefined,
    },
  })

  revalidatePath('/legal/kyc')
  return { success: true }
}

export async function createAdminAccount(formData: FormData) {
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN'])

  await prisma.adminAccount.create({
    data: {
      entity: formData.get('entity') as Entity,
      platform_name: formData.get('platform_name') as string,
      platform_url: (formData.get('platform_url') as string) || null,
      account_holder: formData.get('account_holder') as string,
      access_level: formData.get('access_level') as string,
      two_factor_enabled: formData.get('two_factor_enabled') === 'true',
      recovery_documented: formData.get('recovery_documented') === 'true',
    },
  })

  revalidatePath('/legal/admin-accounts')
  return { success: true }
}

export async function createSubsidy(formData: FormData) {
  await requireRole(['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  await prisma.subsidy.create({
    data: {
      title: formData.get('title') as string,
      entity: formData.get('entity') as Entity,
      jurisdiction: formData.get('jurisdiction') as Jurisdiction,
      source: formData.get('source') as string,
      amount: formData.get('amount') ? parseFloat(formData.get('amount') as string) : null,
      conditions: (formData.get('conditions') as string) || null,
      website_url: (formData.get('website_url') as string) || null,
    },
  })

  revalidatePath('/legal/subsidies')
  return { success: true }
}

export async function updateSubsidyStatus(subsidyId: string, status: string) {
  await requireRole(['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  const data: Record<string, unknown> = { status }
  if (status === 'APPROVED') data.approval_date = new Date()
  if (status === 'APPLYING') data.application_date = new Date()
  if (status === 'DISBURSED') data.disbursement_date = new Date()

  await prisma.subsidy.update({
    where: { id: subsidyId },
    data: data as any,
  })

  revalidatePath('/legal/subsidies')
  return { success: true }
}
