'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { Entity, Jurisdiction, RegistrationStatus } from '@/generated/prisma/client'

export async function upsertComplianceRecord(formData: FormData) {
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  const entity = formData.get('entity') as Entity
  const jurisdiction = formData.get('jurisdiction') as Jurisdiction
  const checkType = formData.get('check_type') as string

  await prisma.complianceRecord.upsert({
    where: { entity_jurisdiction_check_type: { entity, jurisdiction, check_type: checkType } },
    update: {
      status: formData.get('status') as RegistrationStatus,
      registration_number: (formData.get('registration_number') as string) || null,
      notes: (formData.get('notes') as string) || null,
      last_checked: new Date(),
      next_check: formData.get('next_check') ? new Date(formData.get('next_check') as string) : null,
    },
    create: {
      entity,
      jurisdiction,
      check_type: checkType,
      status: (formData.get('status') as RegistrationStatus) || 'PENDING',
      registration_number: (formData.get('registration_number') as string) || null,
      notes: (formData.get('notes') as string) || null,
      last_checked: new Date(),
      next_check: formData.get('next_check') ? new Date(formData.get('next_check') as string) : null,
    },
  })

  revalidatePath('/legal/compliance')
  return { success: true }
}

export async function createRegisteredOffice(formData: FormData) {
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN'])

  await prisma.registeredOfficeAgreement.create({
    data: {
      entity: formData.get('entity') as Entity,
      jurisdiction: formData.get('jurisdiction') as Jurisdiction,
      address: formData.get('address') as string,
      landlord: (formData.get('landlord') as string) || null,
      renewal_date: new Date(formData.get('renewal_date') as string),
      cost_annual: formData.get('cost_annual') ? parseFloat(formData.get('cost_annual') as string) : null,
      auto_renew: formData.get('auto_renew') === 'true',
    },
  })

  revalidatePath('/legal/compliance/registered-offices')
  return { success: true }
}

export async function upsertDataProtection(formData: FormData) {
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN'])

  const entity = formData.get('entity') as Entity
  const jurisdiction = formData.get('jurisdiction') as Jurisdiction

  await prisma.dataProtectionRecord.upsert({
    where: { entity_jurisdiction: { entity, jurisdiction } },
    update: {
      applicable_law: formData.get('applicable_law') as string,
      dpo_required: formData.get('dpo_required') === 'true',
      dpo_name: (formData.get('dpo_name') as string) || null,
      dpo_email: (formData.get('dpo_email') as string) || null,
      registration_status: (formData.get('registration_status') as string) || null,
      privacy_policy_url: (formData.get('privacy_policy_url') as string) || null,
      dpa_in_place: formData.get('dpa_in_place') === 'true',
      breach_procedure: formData.get('breach_procedure') === 'true',
    },
    create: {
      entity,
      jurisdiction,
      applicable_law: formData.get('applicable_law') as string,
      dpo_required: formData.get('dpo_required') === 'true',
      dpo_name: (formData.get('dpo_name') as string) || null,
      dpo_email: (formData.get('dpo_email') as string) || null,
      registration_status: (formData.get('registration_status') as string) || null,
      privacy_policy_url: (formData.get('privacy_policy_url') as string) || null,
      dpa_in_place: formData.get('dpa_in_place') === 'true',
      breach_procedure: formData.get('breach_procedure') === 'true',
    },
  })

  revalidatePath('/legal/compliance/data-protection')
  return { success: true }
}
