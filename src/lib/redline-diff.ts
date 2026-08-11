/**
 * Word-level diff helpers for redlines.
 *
 * Pure functions only. No I/O, no env reads, no Prisma, so these stay
 * trivially testable and safe to import from either side of the boundary.
 * Word tokens beat line tokens here: extracted PDF text has unreliable line
 * breaks, so a line diff would report noise on every paragraph.
 *
 * A word diff is O(base x proposed) in the worst case, and the two sides can
 * legitimately be hundreds of thousands of characters that share almost
 * nothing (someone pastes a counterparty's full redraft). Left unbounded that
 * blocks the request for tens of seconds, and because the editor lives on the
 * same page the redline becomes unopenable and therefore unfixable. So the
 * diff is bounded twice, by input size and by wall clock, and it reports which
 * bound it hit instead of quietly returning a wrong or partial answer.
 */

import { diffLines, diffWords } from "diff"

export interface RedlineDiffSegment {
  type: "unchanged" | "added" | "removed"
  value: string
}

export interface RedlineDiffSummary {
  added: number
  removed: number
  unchanged: number
}

/**
 * ok         word diff completed
 * line_mode  word diff timed out, fell back to the much cheaper line diff
 * too_large  both bounds gave up; render the texts rather than a diff
 */
export type RedlineDiffStatus = "ok" | "line_mode" | "too_large"

export interface RedlineDiffResult {
  segments: RedlineDiffSegment[]
  status: RedlineDiffStatus
}

/** Beyond this combined length a word diff is not attempted at all. */
const MAX_WORD_DIFF_CHARS = 120_000

/** Per-diff wall-clock ceiling. jsdiff returns undefined when it is hit. */
const WORD_DIFF_TIMEOUT_MS = 1_500
const LINE_DIFF_TIMEOUT_MS = 1_500

type DiffPart = { value: string; added?: boolean; removed?: boolean }

function toSegments(parts: DiffPart[]): RedlineDiffSegment[] {
  return parts.map((part): RedlineDiffSegment => {
    if (part.added) return { type: "added", value: part.value }
    if (part.removed) return { type: "removed", value: part.value }
    return { type: "unchanged", value: part.value }
  })
}

/**
 * Diff base vs proposed text, degrading predictably on large inputs.
 */
export function buildRedlineDiffResult(
  baseText: string,
  proposedText: string
): RedlineDiffResult {
  const combined = baseText.length + proposedText.length

  if (combined <= MAX_WORD_DIFF_CHARS) {
    const parts = diffWords(baseText, proposedText, { timeout: WORD_DIFF_TIMEOUT_MS })
    if (parts) return { segments: toSegments(parts), status: "ok" }
  }

  const lineParts = diffLines(baseText, proposedText, { timeout: LINE_DIFF_TIMEOUT_MS })
  if (lineParts) return { segments: toSegments(lineParts), status: "line_mode" }

  return { segments: [], status: "too_large" }
}

/** Segments only, for callers that do not care which bound was hit. */
export function buildRedlineDiff(
  baseText: string,
  proposedText: string
): RedlineDiffSegment[] {
  return buildRedlineDiffResult(baseText, proposedText).segments
}

/** Counts of segments, not characters, per type. */
export function summarizeRedlineDiff(
  segments: RedlineDiffSegment[]
): RedlineDiffSummary {
  const summary: RedlineDiffSummary = { added: 0, removed: 0, unchanged: 0 }
  for (const segment of segments) {
    summary[segment.type] += 1
  }
  return summary
}
