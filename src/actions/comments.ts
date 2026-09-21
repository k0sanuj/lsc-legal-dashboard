'use server'

import { requireGlobalDocumentAccess } from "@/lib/document-access"
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function addDocumentComment(documentId: string, content: string) {
  const session = await requireSession()
  await requireGlobalDocumentAccess()
  if (!content.trim()) return { success: false, error: 'Comment is required' }
  await prisma.documentComment.create({
    data: { document_id: documentId, content: content.trim(), author_id: session.userId },
  })
  revalidatePath(`/legal/documents/${documentId}`)
  return { success: true }
}

export async function resolveDocumentComment(commentId: string, documentId: string) {
  await requireSession()
  await requireGlobalDocumentAccess()
  await prisma.documentComment.update({ where: { id: commentId }, data: { resolved: true } })
  revalidatePath(`/legal/documents/${documentId}`)
  return { success: true }
}
