'use server'

/** Cookie-authenticated dashboard adapters for shared entity operations. */
import { requireSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { saveEntityProfileForSession, saveEntityFilingForSession, saveEntityOwnershipForSession, linkKycToEntityForSession } from '@/lib/entity-record-service'

const PATH = '/legal/compliance/entities'

export async function saveEntityProfile(form: FormData) {
  const result = await saveEntityProfileForSession(await requireSession(), form)
  revalidatePath(PATH, 'layout')
  return result
}

export async function saveEntityFiling(form: FormData) {
  const result = await saveEntityFilingForSession(await requireSession(), form)
  revalidatePath(PATH, 'layout')
  return result
}

export async function addEntityOwnership(form: FormData) {
  const result = await saveEntityOwnershipForSession(await requireSession(), form)
  revalidatePath(PATH, 'layout')
  return result
}

export async function linkKycToEntity(form: FormData) {
  const result = await linkKycToEntityForSession(await requireSession(), form)
  revalidatePath(PATH, 'layout')
  return result
}
