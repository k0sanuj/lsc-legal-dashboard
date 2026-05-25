import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export interface AnalysisPayload {
  summary?: string | null
  keyFields?: unknown
  suggestedCategory?: string | null
  keyDates?: unknown
  keyClauses?: unknown
  obligations?: unknown
  financialTerms?: unknown
  unusualClauses?: unknown
  missingGaps?: unknown
  recommendedNextSteps?: unknown
  suggestedFileName?: string | null
}

export interface AnalysisTarget {
  documentId?: string | null
  versionId?: string | null
  kycDocumentId?: string | null
  litigationDocumentId?: string | null
  sourceType: "legal_document" | "document_version" | "kyc_document" | "litigation_document" | "gmail_import" | "drive_import"
  sourceLabel?: string | null
}

function jsonOrNull(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return value as Prisma.InputJsonValue
}

export async function persistDocumentAnalysisSuccess(
  target: AnalysisTarget,
  analysis: AnalysisPayload,
  rawPayload?: unknown
) {
  return prisma.documentAnalysis.create({
    data: {
      document_id: target.documentId ?? null,
      version_id: target.versionId ?? null,
      kyc_document_id: target.kycDocumentId ?? null,
      litigation_document_id: target.litigationDocumentId ?? null,
      source_type: target.sourceType,
      source_label: target.sourceLabel ?? null,
      status: "complete",
      summary: analysis.summary ?? null,
      suggested_category: analysis.suggestedCategory ?? null,
      suggested_file_name: analysis.suggestedFileName ?? null,
      key_fields: jsonOrNull(analysis.keyFields),
      key_dates: jsonOrNull(analysis.keyDates),
      key_clauses: jsonOrNull(analysis.keyClauses),
      obligations: jsonOrNull(analysis.obligations),
      financial_terms: jsonOrNull(analysis.financialTerms),
      unusual_clauses: jsonOrNull(analysis.unusualClauses),
      missing_gaps: jsonOrNull(analysis.missingGaps),
      recommended_next_steps: jsonOrNull(analysis.recommendedNextSteps),
      raw_payload: jsonOrNull(rawPayload),
    },
  })
}

export async function persistDocumentAnalysisFailure(
  target: AnalysisTarget,
  error: string,
  rawPayload?: unknown
) {
  return prisma.documentAnalysis.create({
    data: {
      document_id: target.documentId ?? null,
      version_id: target.versionId ?? null,
      kyc_document_id: target.kycDocumentId ?? null,
      litigation_document_id: target.litigationDocumentId ?? null,
      source_type: target.sourceType,
      source_label: target.sourceLabel ?? null,
      status: "failed",
      error,
      raw_payload: jsonOrNull(rawPayload),
    },
  })
}
