/** Calendar-based review recurrence and directed dependency validation. No I/O. */
const DAY = 86_400_000
export type ReviewKind = 'PUBLIC' | 'INTERNAL'
export type ReviewRule = { kind: string; start_date: Date; interval_months: number | null; steady_interval_months: number | null }

export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function addCalendarMonths(date: Date, months: number): Date {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay))
  return first
}

export function validateReviewRule(rule: ReviewRule): void {
  if (!Number.isFinite(rule.start_date.getTime())) throw new Error('Review start date is required.')
  if (!['PUBLIC', 'INTERNAL'].includes(rule.kind)) throw new Error('Unknown review kind.')
  if (rule.kind === 'INTERNAL' && ![4, 5, 6].includes(rule.interval_months ?? 0)) {
    throw new Error('Internal policies require a 4, 5 or 6 month interval.')
  }
  if (rule.steady_interval_months !== null && (!Number.isInteger(rule.steady_interval_months) || rule.steady_interval_months < 1 || rule.steady_interval_months > 24)) {
    throw new Error('A confirmed steady-state interval must be between 1 and 24 months.')
  }
}

/** Includes missed dates and the first future date; keys are anchored to the start. */
export function reviewDueDates(rule: ReviewRule, through: Date): Date[] {
  validateReviewRule(rule)
  const start = utcDay(rule.start_date)
  const end = utcDay(through)
  const dates: Date[] = []
  const initialEnd = addCalendarMonths(start, 6)
  if (rule.kind === 'PUBLIC') {
    for (let due = new Date(start.getTime() + 14 * DAY); due <= initialEnd; due = new Date(due.getTime() + 14 * DAY)) {
      dates.push(due)
      if (due > end) return dates
    }
    if (rule.steady_interval_months === null) return dates
  }
  const months = rule.kind === 'INTERNAL' ? rule.interval_months! : rule.steady_interval_months!
  const anchor = rule.kind === 'INTERNAL' ? start : initialEnd
  for (let occurrence = 1; occurrence <= 600; occurrence++) {
    const due = addCalendarMonths(anchor, occurrence * months)
    dates.push(due)
    if (due > end) return dates
  }
  throw new Error('Review schedule exceeds the supported 200-year history.')
}

export type ReviewEdge = { source_schedule_id: string; target_schedule_id: string }
export function validateDependencies(edges: readonly ReviewEdge[], scheduleIds: ReadonlySet<string>): void {
  const graph = new Map<string, string[]>()
  for (const edge of edges) {
    if (!scheduleIds.has(edge.source_schedule_id) || !scheduleIds.has(edge.target_schedule_id)) throw new Error('A dependency references a missing schedule.')
    if (edge.source_schedule_id === edge.target_schedule_id) throw new Error('A review cannot depend on itself.')
    graph.set(edge.source_schedule_id, [...(graph.get(edge.source_schedule_id) ?? []), edge.target_schedule_id])
  }
  const visited = new Set<string>(), visiting = new Set<string>()
  function visit(id: string): void {
    if (visiting.has(id)) throw new Error('Dependencies contain a cycle.')
    if (visited.has(id)) return
    visiting.add(id)
    for (const target of graph.get(id) ?? []) visit(target)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of graph.keys()) visit(id)
}

export function parseDependencyImport(input: string): ReviewEdge[] {
  let value: unknown
  try { value = JSON.parse(input) } catch { throw new Error('Dependency import must be valid JSON.') }
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) throw new Error('Import between 1 and 500 dependency rows.')
  return value.map((row: unknown) => {
    if (!row || typeof row !== 'object' || !('source_schedule_id' in row) || !('target_schedule_id' in row) || typeof row.source_schedule_id !== 'string' || typeof row.target_schedule_id !== 'string') {
      throw new Error('Each row needs source_schedule_id and target_schedule_id.')
    }
    return { source_schedule_id: row.source_schedule_id.trim(), target_schedule_id: row.target_schedule_id.trim() }
  })
}
