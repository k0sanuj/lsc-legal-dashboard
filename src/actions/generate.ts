'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function generateContract(
  templateId: string,
  variables: Record<string, string>,
  entity: string
) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  // Load the template if it exists
  let templateContent = ''
  let templateName = templateId
  const template = await prisma.contractTemplate.findUnique({
    where: { id: templateId },
  })

  if (template) {
    templateContent = template.content
    templateName = template.name
    // Increment usage count
    await prisma.contractTemplate.update({
      where: { id: templateId },
      data: { usage_count: { increment: 1 } },
    })
  }

  const entityLabels: Record<string, string> = {
    LSC: 'League Sports Co',
    TBR: 'Team Blue Rising',
    FSP: 'Future of Sports',
    BOWLING: 'Bowling',
    SQUASH: 'Squash',
    BASKETBALL: 'Basketball',
    BEER_PONG: 'Beer Pong',
    PADEL: 'Padel',
    FOUNDATION: 'Foundation Events',
  }

  const entityLabel = entityLabels[entity] ?? entity

  const variablesList = Object.entries(variables)
    .filter(([, v]) => v.trim())
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')

  const systemPrompt = `You are a legal contract drafting assistant for League Sports Co (LSC), a UAE-based sports holding company. Generate professional, legally-structured contract drafts based on templates and variables provided. Use formal legal language appropriate for UAE jurisdiction. All monetary values are in AED unless stated otherwise. Output ONLY the contract text, no preamble or explanation.`

  const userPrompt = `Generate a contract draft with the following parameters:

Entity: ${entityLabel}
Template: ${templateName}
${templateContent ? `\nTemplate content to follow:\n${templateContent}\n` : ''}
Variables:
${variablesList || '(none provided)'}

Generate a complete, professional contract draft. Include standard clauses for:
1. Parties and recitals
2. Scope / subject matter
3. Term and termination
4. Payment terms (if applicable)
5. Confidentiality
6. Indemnification
7. Governing law (UAE)
8. Dispute resolution
9. General provisions
10. Signature blocks`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const draft = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('\n')

    return { success: true, draft }
  } catch (error) {
    console.error('AI generation error:', error)
    return {
      success: false,
      draft: '',
      error: 'Failed to generate contract. Please try again.',
    }
  }
}

export async function saveGeneratedDocument(
  title: string,
  entity: string,
  category: string,
  content: string,
  variables: Record<string, string>
) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  const document = await prisma.legalDocument.create({
    data: {
      title,
      entity: entity as any,
      category: category as any,
      lifecycle_status: 'DRAFT',
      owner_id: session.userId,
      notes: content,
      parties: variables.counterparty ? [variables.counterparty] : undefined,
      value: variables.value ? parseFloat(variables.value) : undefined,
    },
  })

  // Create initial version
  await prisma.documentVersion.create({
    data: {
      document_id: document.id,
      version_number: 1,
      change_summary: 'AI-generated initial draft',
      created_by: session.fullName,
    },
  })

  revalidatePath('/legal/documents')
  return { success: true, documentId: document.id }
}
