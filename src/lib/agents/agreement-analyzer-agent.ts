import { prisma } from '@/lib/prisma'
import { BaseAgent } from './base-agent'
import { LSC_LEGAL_CONTEXT } from './shared-context'
import type { AgentResult } from './types'
import {
  persistDocumentAnalysisFailure,
  persistDocumentAnalysisSuccess,
  type AnalysisTarget,
} from '@/lib/document-analysis-persistence'

interface AnalyzerInput {
  documentId?: string
  versionId?: string
  kycDocumentId?: string
  litigationDocumentId?: string
  sourceType?: AnalysisTarget["sourceType"]
  sourceLabel?: string
  content: string
}

interface AnalysisResult {
  summary: string
  keyFields: { label: string; value: string; confidence?: 'low' | 'medium' | 'high' }[]
  suggestedCategory: string
  keyDates: { label: string; date: string }[]
  keyClauses: { clause: string; summary: string; riskLevel: 'low' | 'medium' | 'high' }[]
  obligations: { party: string; obligation: string; deadline?: string }[]
  financialTerms: {
    totalValue?: string
    currency?: string
    paymentSchedule?: string
    penalties?: string
  }
  unusualClauses: { clause: string; concern: string; riskLevel: 'low' | 'medium' | 'high' }[]
  missingGaps: { gap: string; impact: string; severity: 'low' | 'medium' | 'high' }[]
  recommendedNextSteps: { action: string; owner?: string; priority: 'low' | 'medium' | 'high' }[]
  suggestedFileName: string
}

const TASK_INSTRUCTIONS = `Task: Analyze the legal document below and extract structured information.

Output JSON schema:
{
  "summary": "plain-English summary of the uploaded document in 2-4 sentences",
  "keyFields": [{ "label": "field name", "value": "field value", "confidence": "low|medium|high" }],
  "suggestedCategory": "<one of the Category enum values>",
  "keyDates": [{ "label": "string", "date": "YYYY-MM-DD" }],
  "keyClauses": [{ "clause": "clause/topic name", "summary": "what the clause does", "riskLevel": "low|medium|high" }],
  "obligations": [{ "party": "string", "obligation": "string", "deadline": "YYYY-MM-DD or null" }],
  "financialTerms": {
    "totalValue": "string or null",
    "currency": "string or null",
    "paymentSchedule": "string or null",
    "penalties": "string or null"
  },
  "unusualClauses": [{ "clause": "string", "concern": "string", "riskLevel": "low|medium|high" }],
  "missingGaps": [{ "gap": "missing or unclear item", "impact": "why it matters", "severity": "low|medium|high" }],
  "recommendedNextSteps": [{ "action": "recommended action", "owner": "suggested owner or null", "priority": "low|medium|high" }],
  "counterparty": "string or null",
  "entity": "LSC|TBR|FSP|XTZ|XTE or null",
  "sport": "BOWLING|SQUASH|BASKETBALL|WORLD_PONG|FOUNDATION (when entity=FSP and contract is for a tournament property) or null"
}

Focus especially on the fields a Legal/Ops user needs immediately after upload:
parties, dates, value/payment terms, renewal/termination mechanics, signing gaps,
missing schedules/exhibits, unresolved placeholders, approval blockers, and next
actions before the document is signed or activated.`

const SYSTEM_PROMPT = `${LSC_LEGAL_CONTEXT}\n\n${TASK_INSTRUCTIONS}`

export class AgreementAnalyzerAgent extends BaseAgent {
  id = 'agreement-analyzer' as const
  name = 'Agreement Analyzer Agent'
  description =
    'Analyzes legal documents using AI to extract categories, key dates, obligations, financial terms, unusual clauses, and suggests standardized file names.'

  async run(input?: unknown): Promise<AgentResult> {
    const {
      documentId,
      versionId,
      kycDocumentId,
      litigationDocumentId,
      sourceType,
      sourceLabel,
      content,
    } = (input ?? {}) as AnalyzerInput
    const referenceId = documentId ?? kycDocumentId ?? litigationDocumentId
    const target: AnalysisTarget = {
      documentId: documentId ?? null,
      versionId: versionId ?? null,
      kycDocumentId: kycDocumentId ?? null,
      litigationDocumentId: litigationDocumentId ?? null,
      sourceType:
        sourceType ??
        (versionId ? 'document_version' : kycDocumentId ? 'kyc_document' : litigationDocumentId ? 'litigation_document' : 'legal_document'),
      sourceLabel: sourceLabel ?? null,
    }

    if (!referenceId || !content) {
      return {
        success: false,
        error: 'Missing required input: a source id and content are required.',
      }
    }

    await this.log('analysis_started', {
      documentId,
      kycDocumentId,
      litigationDocumentId,
      sourceType: target.sourceType,
      contentLength: content.length,
    })

    // ── 1. Call AI for document analysis ──────────────────────────────────────

    let rawResponse: string
    try {
      rawResponse = await this.callAI({
        system: SYSTEM_PROMPT,
        user: `Document to analyze:\n\n${content}`,
        model: 'haiku',
        maxTokens: 1800,
        expectJson: true,
      })
    } catch (error) {
      await this.log('ai_call_failed', { documentId, kycDocumentId, litigationDocumentId, error: String(error) })
      await persistDocumentAnalysisFailure(target, `AI analysis failed: ${String(error)}`)
      return { success: false, error: `AI analysis failed: ${String(error)}` }
    }

    // ── 2. Parse AI response ─────────────────────────────────────────────────

    let parsed: AnalysisResult & { counterparty?: string | null; entity?: string | null }
    try {
      // Strip markdown fences if present
      const cleaned = rawResponse.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      const error = 'Failed to parse AI response as JSON.'
      await this.log('parse_failed', {
        documentId,
        kycDocumentId,
        litigationDocumentId,
        rawResponse: rawResponse.slice(0, 500),
      })
      await persistDocumentAnalysisFailure(target, error, { rawResponse })
      return {
        success: false,
        error,
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
        original_name: referenceId,
        renamed_to: suggestedFileName,
        entity: isValidEntity(entity) ? (entity as any) : null,
        category,
      },
    })

    // ── 5. Return analysis ───────────────────────────────────────────────────

    const analysis: AnalysisResult = {
      summary: parsed.summary ?? 'No summary returned.',
      keyFields: parsed.keyFields ?? [],
      suggestedCategory: parsed.suggestedCategory,
      keyDates: parsed.keyDates ?? [],
      keyClauses: parsed.keyClauses ?? [],
      obligations: parsed.obligations ?? [],
      financialTerms: parsed.financialTerms ?? {},
      unusualClauses: parsed.unusualClauses ?? [],
      missingGaps: parsed.missingGaps ?? [],
      recommendedNextSteps: parsed.recommendedNextSteps ?? [],
      suggestedFileName,
    }

    await persistDocumentAnalysisSuccess(target, analysis, parsed)

    await this.log('analysis_complete', {
      documentId,
      kycDocumentId,
      litigationDocumentId,
      sourceType: target.sourceType,
      analysis,
      summary: analysis.summary,
      keyFields: analysis.keyFields,
      category: analysis.suggestedCategory,
      keyDates: analysis.keyDates,
      keyClauses: analysis.keyClauses,
      keyDatesCount: analysis.keyDates.length,
      obligationsCount: analysis.obligations.length,
      unusualClausesCount: analysis.unusualClauses.length,
      missingGapsCount: analysis.missingGaps.length,
      recommendedNextStepsCount: analysis.recommendedNextSteps.length,
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
