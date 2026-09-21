'use server'

/** Cookie-authenticated dashboard adapters for shared review operations. */
import { requireSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { createReviewScheduleForSession, saveReviewScheduleForSession, finishReviewForSession, refreshReviewTasksForSession, importReviewDependenciesForSession, recordReviewChangeForSession, setReviewScheduleActiveForSession, createInternalPolicyForSession } from '@/lib/review-schedule-service'

export async function createReviewSchedule(form: FormData) {
  const result = await createReviewScheduleForSession(await requireSession(), form)
  revalidatePath('/legal/compliance/reviews')
  return result
}

export async function saveReviewSchedule(form: FormData) {
  const result = await saveReviewScheduleForSession(await requireSession(), form)
  revalidatePath('/legal/compliance/reviews')
  return result
}

export async function finishReview(form: FormData) {
  const result = await finishReviewForSession(await requireSession(), form)
  revalidatePath('/legal/compliance/reviews')
  return result
}

export async function refreshReviewTasks() {
  const result = await refreshReviewTasksForSession(await requireSession())
  revalidatePath('/legal/compliance/reviews')
  return result
}

export async function importReviewDependencies(form: FormData) {
  const result = await importReviewDependenciesForSession(await requireSession(), form)
  revalidatePath('/legal/compliance/reviews')
  return result
}

export async function recordReviewChange(form: FormData) {
  const result = await recordReviewChangeForSession(await requireSession(), form)
  revalidatePath('/legal/compliance/reviews')
  return result
}

export async function setReviewScheduleActive(form: FormData) {
  const result = await setReviewScheduleActiveForSession(await requireSession(), form)
  revalidatePath('/legal/compliance/reviews')
  return result
}

export async function createInternalPolicy(form: FormData) {
  const result = await createInternalPolicyForSession(await requireSession(), form)
  revalidatePath('/legal/compliance/reviews')
  revalidatePath('/legal/policies')
  return result
}
