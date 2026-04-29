import { prisma } from '@/lib/prisma'
import { BaseAgent } from './base-agent'
import { LSC_LEGAL_CONTEXT } from './shared-context'
import type { AgentResult } from './types'

interface AnalyzerInput {
  documentId: string
  content: string
}

interface AnalysisResult {
  suggestedCategory: string
  keyDates: { label: string; date: string }[]
  obligations: { party: string; obligation: string; deadline?: string }[]
  financialTerms: {
    totalValue?: string
    currency?: string
    paymentSchedule?: string
    penalties?: string
  }
  unusualClauses: { clause: string; concern: string; riskLevel: 'low' | 'medium' | 'high' }[]
  suggestedFileName: string
}

const TASK_INSTRUCTIONS = `Task: Analyze the legal document below and extract structured information.

Output JSON schema:
{
  "suggestedCategory": "<one of the Category enum values>",
  "keyDates": [{ "label": "string", "date": "YYYY-MM-DD" }],
  "obligations": [{ "party": "string", "obligation": "string", "deadline": "YYYY-MM-DD or null" }],
  "financialTerms": {
    "totalValue": "string or null",
    "currency": "string or null",
    "paymentSchedule": "string or null",
    "penalties": "string or null"
  },
  "unusualClauses": [{ "clause": "string", "concern": "string", "riskLevel": "low|medium|high" }],
  "counterparty": "string or null",
  "entity": "LSC|TBR|FSP|XTZ|XTE or null",
  "sport": "BOWLING|SQUASH|BASKETBALL|WORLD_PONG|FOUNDATION (when entity=FSP and contract is for a tournament property) or null"
}`

const SYSTEM_PROMPT = `${LSC_LEGAL_CONTEXT}\n\n${TASK_INSTRUCTIONS}`

export class AgreementAnalyzerAgent extends BaseAgent {
  id = 'agreement-analyzer' as const
  name = 'Agreement Analyzer Agent'
  description =
    'Analyzes legal documents using AI to extract categories, key dates, obligations, financial terms, unusual clauses, and suggests standardized file names.'

  async run(input?: unknown): Promise<AgentResult> {
    const { documentId, content } = (input ?? {}) as AnalyzerInput

    if (!documentId || !content) {
      return {
        success: false,
        error: 'Missing required input: documentId and content are required.',
      }
    }

    await this.log('analysis_started', { documentId, contentLength: content.length })

    // ── 1. Call AI for document analysis ──────────────────────────────────────

    let rawResponse: string
    try {
      rawResponse = await this.callAI({
        system: SYSTEM_PROMPT,
        user: `Document to analyze:\n\n${content}`,
        model: 'haiku',
        maxTokens: 1024,
        expectJson: true,
      })
    } catch (error) {
      await this.log('ai_call_failed', { documentId, error: String(error) })
      return { success: false, error: `AI analysis failed: ${String(error)}` }
    }

    // ── 2. Parse AI response ─────────────────────────────────────────────────

    let parsed: AnalysisResult & { counterparty?: string | null; entity?: string | null }
    try {
      // Strip markdown fences if present
      const cleaned = rawResponse.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      await this.log('parse_failed', { documentId, rawResponse: rawResponse.slice(0, 500) })
      return {
        success: false,
        error: 'Failed to parse AI response as JSON.',
        data: { rawResponse },
      }
    }

    // ── 3. Generate standardized file name ───────────────────────────────────

    const entity = parsed.entity ?? 'LSC'
    const category = parsed.suggestedCategory ?? 'OTHER'
    const counterparty = (parsed.counterparty ?? 'UNKNOWN')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toUpperCase()
      .slice(0, 30)
    const dateStr = new Date().toISOString().split('T')[0]!.replace(/-/g, '')
    const ext = 'pdf' // default extension; real implementation would detect from file

    const suggestedFileName = `${entity}_${category}_${counterparty}_${dateStr}_v1.${ext}`

    // ── 4. Log the file naming suggestion ────────────────────────────────────

    await prisma.fileNamingLog.create({
      data: {
        original_name: documentId,
        renamed_to: suggestedFileName,
        entity: isValidEntity(entity) ? (entity as any) : null,
        category,
      },
    })

    // ── 5. Return analysis ───────────────────────────────────────────────────

    const analysis: AnalysisResult = {
      suggestedCategory: parsed.suggestedCategory,
      keyDates: parsed.keyDates ?? [],
      obligations: parsed.obligations ?? [],
      financialTerms: parsed.financialTerms ?? {},
      unusualClauses: parsed.unusualClauses ?? [],
      suggestedFileName,
    }

    await this.log('analysis_complete', {
      documentId,
      category: analysis.suggestedCategory,
      keyDates: analysis.keyDates,
      keyDatesCount: analysis.keyDates.length,
      obligationsCount: analysis.obligations.length,
      unusualClausesCount: analysis.unusualClauses.length,
    })

    return {
      success: true,
      data: analysis,
    }
  }
}

/** Validate entity string against the Entity enum values */
function isValidEntity(value: string): boolean {
  const validEntities = ['LSC', 'TBR', 'FSP', 'XTZ', 'XTE']
  return validEntities.includes(value)
}
