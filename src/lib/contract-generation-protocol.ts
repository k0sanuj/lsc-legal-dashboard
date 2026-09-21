/** Pure validation and hash boundaries shared by the app and isolated CLI worker. */
import { createHash } from "node:crypto"

export const GENERATION_SKILL_VERSION = "legal-v2-2026-09-21"
export const GENERATION_SKILL_HASH = "9de5c2916b89121ef9f360caf104c08ea8fcda73d29dfc2cc12c97a0c9057744"
export const MAX_GENERATION_TEXT = 120_000
export const WORKER_FRESHNESS_MS = 120_000
export const GENERATION_LEASE_MS = 15 * 60_000

export type ReviewFinding = { severity: "blocker" | "warning"; issue: string; excerpt: string }
export type GenerationReview = { draftHash: string; pass: boolean; findings: ReviewFinding[] }
export type GenerationResult = {
  draft: string
  draftHash: string
  substantive: GenerationReview
  references: GenerationReview
  model: string
  sessionIds: string[]
  skillHash: string
}

export function hashDraft(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function boundedText(value: unknown, max = MAX_GENERATION_TEXT): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max
}

export function parseReview(value: unknown, draftHash: string): GenerationReview {
  if (!isRecord(value) || value.draftHash !== draftHash || typeof value.pass !== "boolean" || !Array.isArray(value.findings) || value.findings.length > 100) {
    throw new Error("Review is malformed or belongs to another draft")
  }
  const findings = value.findings.map((item): ReviewFinding => {
    if (!isRecord(item) || (item.severity !== "blocker" && item.severity !== "warning") || !boundedText(item.issue, 2000) || !boundedText(item.excerpt, 2000)) {
      throw new Error("Review finding is malformed")
    }
    return { severity: item.severity, issue: item.issue, excerpt: item.excerpt }
  })
  if (value.pass && findings.some((finding) => finding.severity === "blocker")) throw new Error("Review claims pass with unresolved blockers")
  return { draftHash, pass: value.pass, findings }
}

export function parseGenerationResult(value: unknown): GenerationResult {
  if (!isRecord(value) || !boundedText(value.draft) || value.draftHash !== hashDraft(value.draft) || value.skillHash !== GENERATION_SKILL_HASH || !boundedText(value.model, 120) || !Array.isArray(value.sessionIds) || value.sessionIds.length !== 3 || new Set(value.sessionIds).size !== 3 || !value.sessionIds.every((id) => boundedText(id, 120))) {
    throw new Error("Generation result has invalid content, provenance or hash")
  }
  const substantive = parseReview(value.substantive, value.draftHash as string)
  const references = parseReview(value.references, value.draftHash as string)
  for (const finding of [...substantive.findings, ...references.findings]) {
    if (!value.draft.includes(finding.excerpt)) throw new Error("Review excerpt is absent from the draft")
  }
  return { draft: value.draft, draftHash: value.draftHash as string, substantive, references, model: value.model, sessionIds: value.sessionIds as string[], skillHash: GENERATION_SKILL_HASH }
}

export function resultPassesReviews(result: GenerationResult): boolean {
  return result.substantive.pass && result.references.pass
}
