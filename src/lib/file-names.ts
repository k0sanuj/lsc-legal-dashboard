/** Published names use approved codes and supplied facts; internal object keys remain immutable. */
export const ARENA_CODES = ["FSP", "WBL", "WPS", "TLC", "TBRC", "TBR"] as const
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

export interface NamingFacts {
  arena: string
  category: string
  counterparty: string
  date: string
  initials: string
  extension: string
}

export function publishedFilename(facts: NamingFacts, approvedCategories: readonly string[]): string {
  if (!ARENA_CODES.some((code) => code === facts.arena)) throw new Error("Select a supplied arena code")
  if (!/^[A-Z]{3}$/.test(facts.category) || !approvedCategories.includes(facts.category)) throw new Error("Category code requires lexicon approval")
  if (!/^[A-Z]{2,8}$/.test(facts.initials)) throw new Error("Supply the owner's confirmed uppercase initials")
  if (!/^[a-z0-9]{1,10}$/.test(facts.extension)) throw new Error("Supply the source file extension")
  const date = new Date(`${facts.date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(facts.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== facts.date) throw new Error("Supply the confirmed naming date")
  const name = facts.counterparty.trim().normalize("NFC")
  if (!name || /[\u0000-\u001f/\\:*?"<>|]/.test(name)) throw new Error("Full counterparty is required and must not contain path/control characters")
  const stamp = `${String(date.getUTCDate()).padStart(2, "0")}${MONTHS[date.getUTCMonth()]}${date.getUTCFullYear()}`
  const result = `${facts.arena}_${facts.category}_${name}_${stamp}_${facts.initials}.${facts.extension}`
  if (Buffer.byteLength(result, "utf8") > 240) throw new Error("Full filename exceeds the portable limit; obtain an approved counterparty spelling, never silently truncate")
  return result
}
