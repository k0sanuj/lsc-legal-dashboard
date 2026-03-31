'use server'

import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function addDocumentNote(documentId: string, content: string) {
  const session = await requireSession()
  if (!content.trim()) return { success: false, error: 'Note content is required' }
  await prisma.documentNote.create({
    data: { document_id: documentId, content: content.trim(), author_id: session.userId },
  })
  revalidatePath(`/legal/documents/${documentId}`)
  return { success: true }
}
