'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const ENTITY_LABELS: Record<string, string> = {
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

const SYSTEM_PROMPT = `You are a legal contract drafting assistant for League Sports Co (LSC), a UAE-based sports holding company. Generate professional, legally-structured contract drafts based on templates and variables provided. Use formal legal language appropriate for UAE jurisdiction. All monetary values are in AED unless stated otherwise. Output ONLY the contract text, no preamble or explanation.`

export async function generateContract(
  templateId: string,
  variables: Record<string, string>,
  entity: string,
  reference?: string
) {
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  let templateContent = ''
  let templateName = templateId
  const template = await prisma.contractTemplate.findUnique({
    where: { id: templateId },
  })

  if (template) {
    templateContent = template.content
    templateName = template.name
    await prisma.contractTemplate.update({
      where: { id: templateId },
      data: { usage_count: { increment: 1 } },
    })
  }

  const entityLabel = ENTITY_LABELS[entity] ?? entity

  const variablesList = Object.entries(variables)
    .filter(([, v]) => v.trim())
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')

  const userPrompt = `Generate a contract draft with the following parameters:

Entity: ${entityLabel}
Template: ${templateName}
${reference ? `\nReference / Internal Note: ${reference}\n` : ''}
${templateContent ? `\nTemplate content to follow — use this as the base structure. Replace variable placeholders with the provided values, keep all other clauses intact:\n${templateContent}\n` : ''}
Variables:
${variablesList || '(none provided)'}

${templateContent
    ? 'Fill in the variable fields in the template above with the provided values. Keep the rest of the template exactly as written. Output the complete contract.'
    : `Generate a complete, professional contract draft. Include standard clauses for:
1. Parties and recitals
2. Scope / subject matter
3. Term and termination
4. Payment terms (if applicable)
5. Confidentiality
6. Indemnification
7. Governing law (UAE)
8. Dispute resolution
9. General provisions
10. Signature blocks`}`

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      systemInstruction: SYSTEM_PROMPT,
    })

    const result = await model.generateContent(userPrompt)
    const draft = result.response.text()

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

/** Chat-based refinement of an existing draft */
export async function refineContract(
  currentDraft: string,
  instruction: string
) {
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      systemInstruction: SYSTEM_PROMPT,
    })

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: `Here is the current contract draft:\n\n${currentDraft}` }],
        },
        {
          role: 'model',
          parts: [{ text: 'I have the contract draft. What changes would you like me to make?' }],
        },
      ],
    })

    const result = await chat.sendMessage(
      `Apply the following change to the contract and output the FULL updated contract text. Do not add any preamble or explanation — output only the contract.\n\nInstruction: ${instruction}`
    )
    const refined = result.response.text()

    return { success: true, draft: refined }
  } catch (error) {
    console.error('AI refinement error:', error)
    return {
      success: false,
      draft: '',
      error: 'Failed to refine contract. Please try again.',
    }
  }
}

export async function saveGeneratedDocument(
  title: string,
  entity: string,
  category: string,
  content: string,
  variables: Record<string, string>,
  reference?: string
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

  await prisma.documentVersion.create({
    data: {
      document_id: document.id,
      version_number: 1,
      change_summary: `AI-generated draft${reference ? ` — Ref: ${reference}` : ''}`,
      created_by: session.fullName,
    },
  })

  revalidatePath('/legal/documents')
  return { success: true, documentId: document.id }
}

/** Save the current draft as a reusable template */
export async function saveAsTemplate(
  name: string,
  category: string,
  entity: string | null,
  content: string,
  variables: { key: string; label: string; placeholder: string }[]
) {
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN'])

  const template = await prisma.contractTemplate.create({
    data: {
      name,
      category: category as any,
      entity: entity as any ?? undefined,
      content,
      variables: variables as any,
    },
  })

  revalidatePath('/legal/templates')
  return { success: true, templateId: template.id }
}
