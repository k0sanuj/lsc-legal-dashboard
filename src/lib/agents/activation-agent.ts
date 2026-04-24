import { prisma } from '@/lib/prisma'
import { BaseAgent } from './base-agent'
import { LSC_LEGAL_CONTEXT } from './shared-context'
import type { AgentResult } from './types'

interface ActivationInput {
  documentId: string
}

interface KeyDate {
  label: string
  date: string
}

interface ExtractedDates {
  keyDates: KeyDate[]
}

const TASK_INSTRUCTIONS = `Task: Extract milestone dates from an active contract so they can be tracked as compliance deadlines.

Only include dates that represent an actionable obligation (renewal, payment milestone, filing, delivery, notice period, termination option window). Skip recital-only dates (e.g., "effective date of a referenced agreement").

Output JSON schema:
{
  "keyDates": [{ "label": "concise description < 60 chars", "date": "YYYY-MM-DD" }]
}

Return at most 20 dates. Deduplicate. If no actionable dates are found, return an empty array.`

const SYSTEM_PROMPT = `${LSC_LEGAL_CONTEXT}\n\n${TASK_INSTRUCTIONS}`

// Jurisdiction to use for auto-created compliance deadlines.
// TODO: derive from document's governing law when we surface that field.
const DEFAULT_JURISDICTION = 'UAE'

export class ActivationAgent extends BaseAgent {
  id = 'activation' as const
  name = 'Activation Agent'
  description =
    'Runs on SIGNED → ACTIVE. Extracts milestone dates from the contract body and creates ComplianceDeadline records linked to the document. Skips AI if key dates were already captured by the analyzer.'

  async run(input?: unknown): Promise<AgentResult> {
    const { documentId } = (input ?? {}) as ActivationInput
    if (!documentId) return { success: false, error: 'Missing documentId' }

    const doc = await prisma.legalDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        notes: true,
        entity: true,
        category: true,
        expiry_date: true,
        owner_id: true,
      },
    })
    if (!doc) return { success: false, error: 'Document not found' }

    await this.log('activation_started', { documentId })

    // Check if the analyzer has already logged key dates for this doc —
    // lets us skip a Claude call entirely on the common happy path.
    const priorLog = await prisma.agentActivityLog.findFirst({
      where: {
        agent_id: 'agreement-analyzer',
        action: 'analysis_complete',
      },
      orderBy: { created_at: 'desc' },
    })

    let keyDates: KeyDate[] = []
    let usedAI = false

    const priorDetails = priorLog?.details as { documentId?: string; keyDates?: KeyDate[] } | null
    if (priorDetails?.documentId === documentId && Array.isArray(priorDetails.keyDates)) {
      keyDates = priorDetails.keyDates
    } else if (doc.notes?.trim()) {
      usedAI = true
      try {
        const raw = await this.callAI({
          system: SYSTEM_PROMPT,
          user: `Title: ${doc.title}\nEntity: ${doc.entity}\nCategory: ${doc.category}\n\nDocument body:\n${doc.notes}`,
          model: 'haiku',
          maxTokens: 512,
          expectJson: true,
        })
        const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()
        const parsed = JSON.parse(cleaned) as ExtractedDates
        keyDates = Array.isArray(parsed.keyDates) ? parsed.keyDates : []
      } catch (error) {
        await this.log('ai_call_failed', { documentId, error: String(error) })
        // Continue with whatever we have; expiry_date below is still useful
      }
    }

    // Always include the document's own expiry_date as an additional deadline
    if (doc.expiry_date) {
      keyDates.push({
        label: `Expiry — ${doc.title}`,
        date: doc.expiry_date.toISOString().split('T')[0]!,
      })
    }

    // Deduplicate by date+label combo
    const seen = new Set<string>()
    const unique = keyDates.filter((kd) => {
      if (!kd.date || !kd.label) return false
      const key = `${kd.date}::${kd.label}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    let created = 0
    for (const kd of unique.slice(0, 20)) {
      const parsed = new Date(kd.date)
      if (isNaN(parsed.getTime())) continue

      // Avoid creating duplicate deadlines on repeat transitions
      const existing = await prisma.complianceDeadline.findFirst({
        where: {
          linked_document_id: documentId,
          title: kd.label.slice(0, 200),
          deadline_date: parsed,
        },
        select: { id: true },
      })
      if (existing) continue

      await prisma.complianceDeadline.create({
        data: {
          title: kd.label.slice(0, 200),
          description: `Auto-generated from document activation: ${doc.title}`,
          jurisdiction: DEFAULT_JURISDICTION as any,
          category: doc.category,
          deadline_date: parsed,
          linked_document_id: documentId,
        },
      })
      created++
    }

    // Notify the document owner
    if (created > 0) {
      await prisma.notification.create({
        data: {
          user_id: doc.owner_id,
          type: 'document_activated',
          title: `Activated — ${doc.title}`,
          message: `${created} compliance deadline${created === 1 ? '' : 's'} auto-created from the contract.`,
          link: `/legal/documents/${doc.id}`,
        },
      })
    }

    await this.log('activation_complete', {
      documentId,
      deadlinesCreated: created,
      keyDatesFound: unique.length,
      usedAI,
    })

    return {
      success: true,
      data: { deadlinesCreated: created, keyDatesFound: unique.length, usedAI },
    }
  }
}
