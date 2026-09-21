/** Validates sourced entity and operational form inputs without inventing values. */
export function textField(form: FormData, name: string, required = false, max = 4000): string | null {
  const raw = form.get(name)
  if (raw !== null && typeof raw !== 'string') throw new Error(`${name} must be text.`)
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (required && !value) throw new Error(`${name.replaceAll('_', ' ')} is required.`)
  if (value.length > max) throw new Error(`${name.replaceAll('_', ' ')} is too long.`)
  return value || null
}

export function requiredText(form: FormData, name: string, max = 4000): string {
  const value = textField(form, name, true, max)
  if (!value) throw new Error(`${name} is required.`)
  return value
}

export function dateField(form: FormData, name: string, required = false): Date | null {
  const value = textField(form, name, required, 10)
  if (!value) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name.replaceAll('_', ' ')} must be a valid calendar date.`)
  }
  return date
}

export function enumField<T extends string>(form: FormData, name: string, values: readonly T[]): T {
  const value = requiredText(form, name, 80)
  const match = values.find((candidate) => candidate === value)
  if (!match) throw new Error(`Choose a valid ${name.replaceAll('_', ' ')}.`)
  return match
}

/** Restrict evidence links to web URLs. Plain reference text remains supported. */
export function evidenceReference(form: FormData, name = 'source_reference', required = false): string | null {
  const value = textField(form, name, required)
  if (value && /^(?:javascript|data|file):/i.test(value)) throw new Error('Use a source reference or an HTTP(S) URL.')
  return value
}

export function isWebReference(value: string): boolean {
  try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false }
}

export const ENTITY_CODES = ['LSC', 'TBR', 'FSP', 'XTZ', 'XTE'] as const
export const JURISDICTION_CODES = ['UAE', 'US_DELAWARE', 'GLOBAL', 'INDIA', 'KENYA', 'UK', 'SINGAPORE', 'CAYMAN'] as const
export const FILING_TYPES = ['REGISTRATION', 'ANNUAL_REPORT', 'AGENT_APPOINTMENT', 'OFFICE_AGREEMENT'] as const
