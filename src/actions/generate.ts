'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')
const PROVIDER = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase()
const SONNET = 'claude-sonnet-4-6'

type Turn = { role: 'user' | 'assistant'; content: string }

async function callGenerationAI(system: string, turns: Turn[], maxTokens = 4096): Promise<string> {
  if (PROVIDER === 'gemini') {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro', systemInstruction: system })
    if (turns.length === 1) {
      return (await model.generateContent(turns[0]!.content)).response.text()
    }
    const history = turns.slice(0, -1).map((t) => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.content }],
    }))
    const chat = model.startChat({ history })
    return (await chat.sendMessage(turns[turns.length - 1]!.content)).response.text()
  }
  const res = await anthropic.messages.create({
    model: SONNET,
    max_tokens: maxTokens,
    temperature: 0.2,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  })
  const block = res.content[0]
  return block && block.type === 'text' ? block.text : ''
}

const ENTITY_LABELS: Record<string, string> = {
  LSC: 'League Sports Co',
  TBR: 'Team Blue Rising',
  FSP: 'Future of Sports',
  BOWLING: 'Bowl & Darts',
  SQUASH: 'Squash',
  BASKETBALL: 'Basketball',
  BEER_PONG: 'Ping Pong',
  FOUNDATION: 'Foundation Events',
}

const SYSTEM_PROMPT = `You are a legal contract drafting assistant for League Sports Co (LSC), a UAE-based sports holding company. Generate professional, legally-structured contract drafts based on templates and variables provided. Use formal legal language appropriate for UAE jurisdiction. All monetary values are in AED unless stated otherwise. Output ONLY the contract text, no preamble or explanation.`

export async function generateContract(
  templateId: string,
  variables: Record<string, string>,
  entity: string,
  reference?: string
) {
  await requireRole(['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

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
    const draft = await callGenerationAI(SYSTEM_PROMPT, [{ role: 'user', content: userPrompt }])
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
  await requireRole(['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  try {
    const refined = await callGenerationAI(SYSTEM_PROMPT, [
      { role: 'user', content: `Here is the current contract draft:\n\n${currentDraft}` },
      { role: 'assistant', content: 'I have the contract draft. What changes would you like me to make?' },
      {
        role: 'user',
        content: `Apply the following change to the contract and output the FULL updated contract text. Do not add any preamble or explanation — output only the contract.\n\nInstruction: ${instruction}`,
      },
    ])
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
