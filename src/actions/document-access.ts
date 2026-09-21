'use server'

/** Legal approves a specific document and expiry, retaining the requesting actor. */
import { requireSession } from '@/lib/auth'
import { requireGlobalDocumentAccess, requestDocumentAccess } from '@/lib/document-access'
import { decideDocumentAccess, revokeDocumentGrant } from '@/lib/document-access-management'
import { revalidatePath } from 'next/cache'

export async function requestAccess(form: FormData): Promise<void> {
  const actor = await requireSession()
  await requestDocumentAccess(actor, String(form.get('reference') ?? ''), String(form.get('reason') ?? ''))
  revalidatePath('/legal/access')
}

export async function decideAccess(form: FormData): Promise<void> {
  const actor = await requireGlobalDocumentAccess()
  const id = String(form.get('request_id') ?? '')
  const approve = form.get('decision') === 'approve'
  const documentId = String(form.get('document_id') ?? '')
  const expires = new Date(String(form.get('expires_at') ?? ''))
  if (approve && (!documentId || !Number.isFinite(expires.getTime()) || expires <= new Date())) throw new Error('Choose a document and future expiry.')
  await decideDocumentAccess(actor, id, approve, documentId, expires)
  revalidatePath('/legal/access')
}

export async function revokeAccess(form: FormData): Promise<void> {
  const actor = await requireGlobalDocumentAccess()
  const id = String(form.get('grant_id') ?? '')
  await revokeDocumentGrant(actor, id)
  revalidatePath('/legal/access')
}
