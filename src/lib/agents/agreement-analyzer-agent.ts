import { prisma } from '@/lib/prisma'
import { BaseAgent } from './base-agent'
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

const SYSTEM_PROMPT = `You are an expert legal analyst for League Sports Co (LSC), a UAE-based sports and entertainment holding company. LSC operates under UAE commercial law and has subsidiaries including:
- TBR (Team Blue Rising) — E1 racing team
- FSP (Future of Sports) — technology platform
- Tournament properties: Bowling, Squash, Basketball, Beer Pong, Padel
- Foundation Events — charitable arm

Your task is to analyze legal documents and extract structured information. Consider UAE-specific legal requirements, DIFC/ADGM regulations where applicable, and standard international commercial law.

Respond ONLY with valid JSON matching this exact structure (no markdown, no explanation):
{
  "suggestedCategory": "one of: SPONSORSHIP, VENDOR, EMPLOYMENT, ESOP, NDA, ARENA_HOST, TERMS_OF_SERVICE, WAIVER, IP_ASSIGNMENT, PILOT_PROGRAM, BOARD_RESOLUTION, POLICY, MSA, SLA, CONTRACTOR, REFERRAL_PARTNER, VENUE, PRODUCTION_PARTNER, CLICKWRAP, REGISTERED_OFFICE, SAAS_SUBSCRIPTION, INSURANCE, GOVERNMENT_FILING, LITIGATION_DOC, SUBSIDY_GRANT, OTHER",
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
  "entity": "one of: LSC, TBR, FSP, BOWLING, SQUASH, BASKETBALL, BEER_PONG, PADEL, FOUNDATION or null"
}`

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
      rawResponse = await this.callAI(
        SYSTEM_PROMPT,
        `Analyze the following legal document:\n\n${content}`
      )
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
  const validEntities = [
    'LSC',
    'TBR',
    'FSP',
    'BOWLING',
    'SQUASH',
    'BASKETBALL',
    'BEER_PONG',
    'PADEL',
    'FOUNDATION',
  ]
  return validEntities.includes(value)
}
