import { prisma } from "@/lib/prisma"

export type RiskLevel = "low" | "medium" | "high"

export interface DocumentAnalysisSummary {
  status: "none" | "pending" | "complete" | "failed"
  documentId: string
  createdAt?: string
  error?: string
  summary?: string
  suggestedCategory?: string
  suggestedFileName?: string
  keyFields: { label: string; value: string; confidence?: RiskLevel }[]
  keyDates: { label: string; date: string }[]
  keyClauses: { clause: string; summary: string; riskLevel?: RiskLevel }[]
  obligations: { party: string; obligation: string; deadline?: string | null }[]
  financialTerms: {
    totalValue?: string | null
    currency?: string | null
    paymentSchedule?: string | null
    penalties?: string | null
  }
  unusualClauses: { clause: string; concern: string; riskLevel?: RiskLevel }[]
  missingGaps: { gap: string; impact: string; severity?: RiskLevel }[]
  recommendedNextSteps: { action: string; owner?: string | null; priority?: RiskLevel }[]
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function asRiskLevel(value: unknown): RiskLevel | undefined {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : undefined
}

function normalizeKeyFields(value: unknown): DocumentAnalysisSummary["keyFields"] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((item) => {
      const record = asRecord(item)
      const label = asString(record.label)
      const fieldValue = asString(record.value)
      if (!label || !fieldValue) return []
      const field: DocumentAnalysisSummary["keyFields"][number] = {
        label,
        value: fieldValue,
      }
      const confidence = asRiskLevel(record.confidence)
      if (confidence) field.confidence = confidence
      return [field]
    })
}

function normalizeKeyDates(value: unknown): DocumentAnalysisSummary["keyDates"] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((item) => {
      const record = asRecord(item)
      const label = asString(record.label)
      const date = asString(record.date)
      if (!label || !date) return []
      return [{ label, date }]
    })
}

function normalizeKeyClauses(value: unknown): DocumentAnalysisSummary["keyClauses"] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((item) => {
      const record = asRecord(item)
      const clause = asString(record.clause)
      const summary = asString(record.summary)
      if (!clause || !summary) return []
      const normalized: DocumentAnalysisSummary["keyClauses"][number] = {
        clause,
        summary,
      }
      const riskLevel = asRiskLevel(record.riskLevel)
      if (riskLevel) normalized.riskLevel = riskLevel
      return [normalized]
    })
}

function normalizeObligations(value: unknown): DocumentAnalysisSummary["obligations"] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((item) => {
      const record = asRecord(item)
      const party = asString(record.party)
      const obligation = asString(record.obligation)
      if (!party || !obligation) return []
      return [{
        party,
        obligation,
        deadline: asString(record.deadline) ?? null,
      }]
    })
}

function normalizeFinancialTerms(value: unknown): DocumentAnalysisSummary["financialTerms"] {
  const record = asRecord(value)
  return {
    totalValue: asString(record.totalValue) ?? null,
    currency: asString(record.currency) ?? null,
    paymentSchedule: asString(record.paymentSchedule) ?? null,
    penalties: asString(record.penalties) ?? null,
  }
}

function normalizeUnusualClauses(value: unknown): DocumentAnalysisSummary["unusualClauses"] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((item) => {
      const record = asRecord(item)
      const clause = asString(record.clause)
      const concern = asString(record.concern)
      if (!clause || !concern) return []
      const normalized: DocumentAnalysisSummary["unusualClauses"][number] = {
        clause,
        concern,
      }
      const riskLevel = asRiskLevel(record.riskLevel)
      if (riskLevel) normalized.riskLevel = riskLevel
      return [normalized]
    })
}

function normalizeMissingGaps(value: unknown): DocumentAnalysisSummary["missingGaps"] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((item) => {
      const record = asRecord(item)
      const gap = asString(record.gap)
      const impact = asString(record.impact)
      if (!gap || !impact) return []
      const normalized: DocumentAnalysisSummary["missingGaps"][number] = {
        gap,
        impact,
      }
      const severity = asRiskLevel(record.severity)
      if (severity) normalized.severity = severity
      return [normalized]
    })
}

function normalizeRecommendedNextSteps(
  value: unknown
): DocumentAnalysisSummary["recommendedNextSteps"] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((item) => {
      const record = asRecord(item)
      const action = asString(record.action)
      if (!action) return []
      const normalized: DocumentAnalysisSummary["recommendedNextSteps"][number] = {
        action,
        owner: asString(record.owner) ?? null,
      }
      const priority = asRiskLevel(record.priority)
      if (priority) normalized.priority = priority
      return [normalized]
    })
}

function normalizeCompleteDetails(
  details: unknown,
  documentId: string,
  createdAt: Date
): DocumentAnalysisSummary {
  const root = asRecord(details)
  const analysis = asRecord(root.analysis)
  const source = Object.keys(analysis).length > 0 ? analysis : root

  return {
    status: "complete",
    documentId,
    createdAt: createdAt.toISOString(),
    summary: asString(source.summary),
    suggestedCategory: asString(source.suggestedCategory) ?? asString(root.category),
    suggestedFileName: asString(source.suggestedFileName),
    keyFields: normalizeKeyFields(source.keyFields),
    keyDates: normalizeKeyDates(source.keyDates ?? root.keyDates),
    keyClauses: normalizeKeyClauses(source.keyClauses),
    obligations: normalizeObligations(source.obligations),
    financialTerms: normalizeFinancialTerms(source.financialTerms),
    unusualClauses: normalizeUnusualClauses(source.unusualClauses),
    missingGaps: normalizeMissingGaps(source.missingGaps),
    recommendedNextSteps: normalizeRecommendedNextSteps(source.recommendedNextSteps),
  }
}

function emptySummary(documentId: string): DocumentAnalysisSummary {
  return {
    status: "none",
    documentId,
    keyFields: [],
    keyDates: [],
    keyClauses: [],
    obligations: [],
    financialTerms: {},
    unusualClauses: [],
    missingGaps: [],
    recommendedNextSteps: [],
  }
}

function normalizeStoredAnalysis(
  row: {
    status: string
    summary: string | null
    suggested_category: string | null
    suggested_file_name: string | null
    key_fields: unknown
    key_dates: unknown
    key_clauses: unknown
    obligations: unknown
    financial_terms: unknown
    unusual_clauses: unknown
    missing_gaps: unknown
    recommended_next_steps: unknown
    error: string | null
    created_at: Date
  },
  documentId: string
): DocumentAnalysisSummary {
  if (row.status === "failed") {
    return {
      ...emptySummary(documentId),
      status: "failed",
      createdAt: row.created_at.toISOString(),
      error: row.error ?? "AI analysis failed.",
    }
  }

  return {
    status: row.status === "pending" ? "pending" : "complete",
    documentId,
    createdAt: row.created_at.toISOString(),
    summary: row.summary ?? undefined,
    suggestedCategory: row.suggested_category ?? undefined,
    suggestedFileName: row.suggested_file_name ?? undefined,
    keyFields: normalizeKeyFields(row.key_fields),
    keyDates: normalizeKeyDates(row.key_dates),
    keyClauses: normalizeKeyClauses(row.key_clauses),
    obligations: normalizeObligations(row.obligations),
    financialTerms: normalizeFinancialTerms(row.financial_terms),
    unusualClauses: normalizeUnusualClauses(row.unusual_clauses),
    missingGaps: normalizeMissingGaps(row.missing_gaps),
    recommendedNextSteps: normalizeRecommendedNextSteps(row.recommended_next_steps),
  }
}

export async function getLatestUploadAnalysisSummary({
  documentId,
  kycDocumentId,
  litigationDocumentId,
}: {
  documentId?: string
  kycDocumentId?: string
  litigationDocumentId?: string
}): Promise<DocumentAnalysisSummary> {
  const targetId = documentId ?? kycDocumentId ?? litigationDocumentId ?? ""

  const stored = await prisma.documentAnalysis.findFirst({
    where: {
      ...(documentId ? { document_id: documentId } : {}),
      ...(kycDocumentId ? { kyc_document_id: kycDocumentId } : {}),
      ...(litigationDocumentId ? { litigation_document_id: litigationDocumentId } : {}),
    },
    orderBy: { created_at: "desc" },
  })

  if (stored) {
    return normalizeStoredAnalysis(stored, targetId)
  }

  if (!documentId) {
    return emptySummary(targetId)
  }

  const completeLog = await prisma.agentActivityLog.findFirst({
    where: {
      agent_id: "agreement-analyzer",
      action: "analysis_complete",
      details: {
        path: ["documentId"],
        equals: documentId,
      },
    },
    orderBy: { created_at: "desc" },
  })

  if (completeLog) {
    return normalizeCompleteDetails(completeLog.details, documentId, completeLog.created_at)
  }

  const latestLog = await prisma.agentActivityLog.findFirst({
    where: {
      agent_id: "agreement-analyzer",
      action: {
        in: ["analysis_started", "ai_call_failed", "parse_failed"],
      },
      details: {
        path: ["documentId"],
        equals: documentId,
      },
    },
    orderBy: { created_at: "desc" },
  })

  if (!latestLog) {
    return emptySummary(documentId)
  }

  const details = asRecord(latestLog.details)
  if (latestLog.action === "ai_call_failed" || latestLog.action === "parse_failed") {
    return {
      status: "failed",
      documentId,
      createdAt: latestLog.created_at.toISOString(),
      error:
        asString(details.error) ??
        (latestLog.action === "parse_failed"
          ? "AI returned a response that could not be parsed."
          : "AI analysis failed."),
      keyFields: [],
      keyDates: [],
      keyClauses: [],
      obligations: [],
      financialTerms: {},
      unusualClauses: [],
      missingGaps: [],
      recommendedNextSteps: [],
    }
  }

  return {
    status: "pending",
    documentId,
    createdAt: latestLog.created_at.toISOString(),
    keyFields: [],
    keyDates: [],
    keyClauses: [],
    obligations: [],
    financialTerms: {},
    unusualClauses: [],
    missingGaps: [],
    recommendedNextSteps: [],
  }
}

export async function getLatestDocumentAnalysisSummary(
  documentId: string
): Promise<DocumentAnalysisSummary> {
  return getLatestUploadAnalysisSummary({ documentId })
}
