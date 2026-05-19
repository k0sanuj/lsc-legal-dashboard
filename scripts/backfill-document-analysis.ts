import { config } from "dotenv"
import type {
  DocumentCategory,
  Entity,
  LegalDocument,
  LifecycleStatus,
} from "../src/generated/prisma/client"
import { mapLifecycleStatusToContractStatus } from "../src/lib/finance-mapping"

config({ path: ".env" })
config({ path: ".env.local", override: true })

type Analysis = {
  status: LifecycleStatus
  category: DocumentCategory
  entity: Entity
  sport: string | null
  counterparty: string | null
  startDate: Date | null
  endDate: Date | null
  expiryDate: Date | null
  contractValue: number | null
  currencyCode: string
  isRecurring: boolean
  billingFrequency: string | null
  autoRenew: boolean
  templateEligible: boolean
  templateContent: string | null
  templateVariables: TemplateVariable[]
  reasons: string[]
}

type TemplateVariable = {
  key: string
  label: string
  placeholder: string
  type?: "text" | "textarea" | "date" | "number"
  required?: boolean
}

type Args = {
  apply: boolean
  limit: number
  offset: number
}

const SOURCE_MARKER_START = "--- Automated Document Analysis Backfill ---"
const SOURCE_MARKER_END = "--- End Automated Document Analysis Backfill ---"

const SYNCABLE_STATUSES = new Set<LifecycleStatus>([
  "SIGNED",
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "TERMINATED",
])

const PRESERVE_FINAL_STATUSES = new Set<LifecycleStatus>([
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "TERMINATED",
])

const CATEGORY_KEYWORDS: Array<[DocumentCategory, RegExp]> = [
  ["NDA", /\b(mnda|nda|non[- ]?disclosure|mutual non[- ]?disclosure)\b/i],
  ["MSA", /\b(master services?|msa)\b/i],
  ["SLA", /\b(service level|sla)\b/i],
  ["SPONSORSHIP", /\b(sponsorship|sponsor)\b/i],
  ["WAIVER", /\b(waiver|release)\b/i],
  ["EMPLOYMENT", /\b(employment|employee|pilot agreement|mechanic contract|retainership|retainer|salary|increment)\b/i],
  ["ESOP", /\b(token grant|option|options agreement|share grant|side letter|pro rata)\b/i],
  ["REFERRAL_PARTNER", /\b(referral|introducer|introduction agreement)\b/i],
  ["CONTRACTOR", /\b(consultancy|consultant|contractor|freelancer|engagement letter)\b/i],
  ["VENUE", /\b(venue|host agreement)\b/i],
  ["TERMS_OF_SERVICE", /\b(terms of use|terms of service|website terms)\b/i],
  ["POLICY", /\b(policy|code of conduct)\b/i],
  ["GOVERNMENT_FILING", /\b(certificate of incorporation|gst certificate|trade license|registration certificate)\b/i],
  ["IP_ASSIGNMENT", /\b(ip assignment|intellectual property assignment|grant of rights)\b/i],
]

const ENTITY_KEYWORDS: Array<[Entity, RegExp]> = [
  ["TBR", /\b(team blue rising|tbr|e1 series|e1 championship|e1 season)\b/i],
  ["FSP", /\b(future of sports|fsp|fsp labs)\b/i],
  ["XTZ", /\b(xtz|xtz esports|esports tech)\b/i],
  ["XTE", /\bxte\b/i],
  ["LSC", /\b(league sports co|lsc)\b/i],
]

const ENTITY_ALIASES = [
  "lsc",
  "league sports co",
  "league sports company",
  "team blue rising",
  "tbr",
  "future of sports",
  "fsp",
  "xtz",
  "xtz esports tech",
  "xte",
  "e1",
]

const GENERIC_COUNTERPARTY_PHRASES = [
  "as the",
  "the following",
  "the context",
  "provision of services",
  "fails to remedy",
  "grant to",
  "information acquired",
  "pricing products",
  "you an option",
  "together with",
  "tournament related",
  "urnament related",
  "gether with",
  "or in connection",
]

const GENERIC_COUNTERPARTY_WORDS = [
  "mechanic",
  "pilot",
  "forms",
  "form",
  "referral",
  "consultancy",
  "consultant",
  "version",
  "venue",
  "sponsorship",
  "participation",
  "team entry",
  "team participation",
  "term sheet",
  "tap comments",
  "engg",
  "intro",
]

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  return {
    apply: args.includes("--apply"),
    limit: Number(args.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 10_000),
    offset: Number(args.find((arg) => arg.startsWith("--offset="))?.split("=")[1] ?? 0),
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s$.,/%&@]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function stripPreviousBackfill(notes: string | null): string {
  const value = notes ?? ""
  const start = value.indexOf(SOURCE_MARKER_START)
  const end = value.indexOf(SOURCE_MARKER_END)
  if (start === -1 || end === -1 || end < start) return value.trim()
  return `${value.slice(0, start)}${value.slice(end + SOURCE_MARKER_END.length)}`.trim()
}

function extractedPreview(notes: string | null): string {
  if (!notes) return ""
  const marker = "Extracted preview:"
  const index = notes.indexOf(marker)
  if (index === -1) return ""
  return notes.slice(index + marker.length).trim()
}

function evidenceText(doc: LegalDocument): string {
  return `${doc.title}\n${doc.notes ?? ""}`
}

function metadataText(doc: LegalDocument): string {
  const notes = doc.notes ?? ""
  const previewIndex = notes.indexOf("Extracted preview:")
  return `${doc.title}\n${previewIndex === -1 ? notes : notes.slice(0, previewIndex)}`
}

function inferEntity(doc: LegalDocument, text: string): Entity {
  for (const [entity, pattern] of ENTITY_KEYWORDS) {
    if (pattern.test(text)) return entity
  }
  return doc.entity
}

function inferCategory(doc: LegalDocument, metadata: string, fullText: string): DocumentCategory {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(metadata)) return category
  }
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(fullText)) return category
  }
  return doc.category
}

function inferSport(text: string, current: string | null): string | null {
  if (/\b(world bowling league|wbl|bowling)\b/i.test(text)) return "BOWLING"
  if (/\bsquash\b/i.test(text)) return "SQUASH"
  if (/\bbasketball\b/i.test(text)) return "BASKETBALL"
  if (/\b(ping pong|world pong|beer pong)\b/i.test(text)) return "WORLD_PONG"
  if (/\bfoundation\b/i.test(text)) return "FOUNDATION"
  return current
}

function hasStrongSignedEvidence(text: string, currentStatus: LifecycleStatus): boolean {
  const normalized = normalizeText(text)
  if (currentStatus === "SIGNED") {
    if (/\b(unsigned|not signed|draft only|for signature|signature requested|awaiting signature)\b/i.test(normalized)) {
      return false
    }
    return true
  }
  return (
    /\b(executed|fully executed|execution copy|signature copy|signed copy|completed signed|complete with docusign|completed with docusign|everyone has signed|has been signed|all parties signed|signature certificate)\b/i.test(normalized) ||
    /\b(signed documents?|signed for e1|signed pdf|signed)\b/i.test(normalized) && !/\b(unsigned|not signed|for signature|signature requested|awaiting signature|signature block)\b/i.test(normalized)
  )
}

function inferStatus(doc: LegalDocument, text: string, signed: boolean): LifecycleStatus {
  if (PRESERVE_FINAL_STATUSES.has(doc.lifecycle_status)) return doc.lifecycle_status
  if (signed) return "SIGNED"
  const normalized = normalizeText(text)
  if (doc.lifecycle_status === "AWAITING_SIGNATURE" || /\b(awaiting signature|signature requested|for signature)\b/i.test(normalized)) {
    return "AWAITING_SIGNATURE"
  }
  if (doc.lifecycle_status === "NEGOTIATION" || /\b(negotiation|negotiating|redline|comments|mark up|markup)\b/i.test(normalized)) {
    return "NEGOTIATION"
  }
  if (doc.lifecycle_status === "IN_REVIEW" || /\b(reviewed|for review|review copy|final draft|clean copy)\b/i.test(normalized)) {
    return "IN_REVIEW"
  }
  return "DRAFT"
}

function validYear(year: number): boolean {
  return year >= 2018 && year <= 2035
}

function makeDate(year: number, month: number, day: number): Date | null {
  if (!validYear(year) || month < 0 || month > 11 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return null
  }
  return date
}

function parseTwoDigitYear(value: number): number {
  return value >= 70 ? 1900 + value : 2000 + value
}

function extractDates(text: string): Date[] {
  const dates = new Map<string, Date>()
  const add = (date: Date | null) => {
    if (!date) return
    dates.set(date.toISOString().slice(0, 10), date)
  }

  for (const match of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    add(makeDate(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  }

  for (const match of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const yearRaw = Number(match[3])
    const year = yearRaw < 100 ? parseTwoDigitYear(yearRaw) : yearRaw
    const first = Number(match[1])
    const second = Number(match[2])
    add(makeDate(year, second - 1, first))
  }

  const monthNames = Object.keys(MONTHS).join("|")
  const dayMonthYear = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+day\\s+of)?\\s+(${monthNames})\\s*,?\\s*(\\d{4})\\b`, "gi")
  for (const match of text.matchAll(dayMonthYear)) {
    add(makeDate(Number(match[3]), MONTHS[match[2]!.toLowerCase()]!, Number(match[1])))
  }

  const monthDayYear = new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})\\b`, "gi")
  for (const match of text.matchAll(monthDayYear)) {
    add(makeDate(Number(match[3]), MONTHS[match[1]!.toLowerCase()]!, Number(match[2])))
  }

  return [...dates.values()].sort((a, b) => a.getTime() - b.getTime())
}

function datesNear(text: string, keywords: RegExp): Date[] {
  const dates: Date[] = []
  for (const match of text.matchAll(new RegExp(keywords.source, `${keywords.flags.includes("i") ? "i" : ""}g`))) {
    const start = Math.max(0, match.index - 180)
    const end = Math.min(text.length, match.index + 260)
    dates.push(...extractDates(text.slice(start, end)))
  }
  return [...new Map(dates.map((d) => [d.toISOString().slice(0, 10), d])).values()]
}

function addTerm(start: Date | null, text: string): Date | null {
  if (!start) return null
  const match = normalizeText(text).match(/\b(?:term|period|duration)\s+of\s+(\d+|one|two|three|four|five|six|twelve)\s+(month|months|year|years)\b/)
  if (!match) return null
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    twelve: 12,
  }
  const quantity = Number(match[1]) || words[match[1]!] || 0
  if (!quantity) return null
  const end = new Date(start)
  if (match[2]!.startsWith("year")) end.setUTCFullYear(end.getUTCFullYear() + quantity)
  else end.setUTCMonth(end.getUTCMonth() + quantity)
  return end
}

function inferDates(doc: LegalDocument, text: string): Pick<Analysis, "startDate" | "endDate" | "expiryDate"> {
  const body = extractedPreview(doc.notes) || text
  const startCandidates = [
    ...extractDates(doc.title),
    ...datesNear(body, /\b(effective date|commencement date|start date|executed on|entered into|dated)\b/i),
  ]
  const endCandidates = datesNear(body, /\b(expiry|expiration|end date|valid until|terminates on|termination date|until)\b/i)
  const allDates = extractDates(body)

  const startDate = doc.contract_start_date ?? startCandidates[0] ?? null
  const inferredEnd = endCandidates.find((date) => !startDate || date > startDate) ?? addTerm(startDate, body)
  const endDate = doc.contract_end_date ?? inferredEnd ?? null
  const expiryDate = doc.expiry_date ?? endDate ?? null

  return {
    startDate: startDate ?? (allDates.length === 1 ? allDates[0]! : null),
    endDate,
    expiryDate,
  }
}

function cleanCounterparty(value: string): string | null {
  const aliasesPattern = new RegExp(`\\b(${ENTITY_ALIASES.map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi")
  let cleaned = compact(
    value
      .replace(/\.(pdf|docx?|rtf|txt)\b/gi, "")
      .replace(/\[[^\]]+\]|\([^)]*\)/g, " ")
      .replace(aliasesPattern, " ")
      .replace(/\b(agreement|contract|mou|nda|mnda|waiver|term sheet|terms of use|template|clean|copy|final|draft|lc|signed|executed|team participation|team entry|mechanic|pilot|forms?|version|referral|consultancy|consultant)\b/gi, " ")
      .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, " ")
      .replace(/\b\d{1,2}[-/.]\d{1,2}\b/g, " ")
      .replace(/\b\d{6,8}\b/g, " ")
      .replace(/\b\d{4}\b/g, " ")
  )
  cleaned = compact(cleaned.replace(/^[-–—:|[(]+|[-–—:|[(]+$/g, ""))
  if (!cleaned) return null
  const normalized = normalizeText(cleaned)
  if (GENERIC_COUNTERPARTY_PHRASES.some((phrase) => normalized.includes(phrase))) return null
  if (GENERIC_COUNTERPARTY_WORDS.includes(normalized)) return null
  if (ENTITY_ALIASES.includes(normalizeText(cleaned))) return null
  if (cleaned.length < 2 || cleaned.length > 120) return null
  return cleaned
}

function inferCounterparty(doc: LegalDocument): string | null {
  if (doc.counterparty) {
    const existing = cleanCounterparty(doc.counterparty)
    if (existing) return existing
  }
  const title = doc.title.replace(/[_-]+/g, " ")
  const rawXParts = title.split(/\s+x\s+|\s+X\s+/)
  if (rawXParts.length > 1) {
    const xParts = rawXParts.map(cleanCounterparty).filter(Boolean) as string[]
    const nonEntity = xParts
      .filter((part) => !ENTITY_ALIASES.includes(normalizeText(part)))
      .sort((a, b) => a.length - b.length)[0]
    if (nonEntity) return nonEntity
  }

  const titlePatterns = [
    /\b(?:agreement|contract|mou|nda|waiver|letter)\s+(?:with\s+)?(?:lsc|xtz|tbr|fsp|team blue rising)?\s*(?:x|and|with|-)\s+(.+?)$/i,
  ]
  for (const pattern of titlePatterns) {
    const match = title.match(pattern)
    if (match?.[1]) {
      const cleaned = cleanCounterparty(match[1])
      if (cleaned) return cleaned
    }
  }

  const preview = extractedPreview(doc.notes)
  const toBlock = preview.match(/\bTo,\s*\n+([^\n]{3,100})/i)
  if (toBlock?.[1]) {
    const cleaned = cleanCounterparty(toBlock[1])
    if (cleaned) return cleaned
  }

  return null
}

function inferMoney(text: string): { amount: number | null; currencyCode: string } {
  const normalized = text.replace(/\s+/g, " ")
  const patterns: Array<[RegExp, string | null]> = [
    [/\b(USD|AED|INR|GBP|EUR)\s*([0-9][0-9,]*(?:\.\d{1,2})?)\b/i, null],
    [/\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*(USD|AED|INR|GBP|EUR)\b/i, null],
    [/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i, "USD"],
    [/AED\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i, "AED"],
  ]

  for (const [pattern, forcedCurrency] of patterns) {
    const match = normalized.match(pattern)
    if (!match) continue
    const currency = forcedCurrency ?? (Number.isNaN(Number(match[1]?.replace(/,/g, ""))) ? match[1] : match[2]) ?? "USD"
    const amountRaw = forcedCurrency ? match[1] : Number.isNaN(Number(match[1]?.replace(/,/g, ""))) ? match[2] : match[1]
    const amount = Number(String(amountRaw).replace(/,/g, ""))
    if (amount > 0 && amount < 1_000_000_000) {
      return { amount, currencyCode: String(currency).toUpperCase() }
    }
  }

  return { amount: null, currencyCode: "USD" }
}

function inferTemplateEligibility(category: DocumentCategory, signed: boolean, text: string): boolean {
  if (signed) return false
  if (["GOVERNMENT_FILING", "BOARD_RESOLUTION"].includes(category)) return false
  if (/\b(certificate of incorporation|gst certificate|passport|invoice|receipt|address proof)\b/i.test(text)) return false
  return /\b(template|agreement|contract|mou|nda|mnda|waiver|terms of use|terms of service|letter|consultancy|referral|sponsorship|policy|service agreement)\b/i.test(text)
}

function inferTemplateVariables(category: DocumentCategory): TemplateVariable[] {
  const base: TemplateVariable[] = [
    { key: "counterparty_name", label: "Counterparty Name", placeholder: "Legal name of the counterparty", type: "text", required: true },
    { key: "effective_date", label: "Effective Date", placeholder: "YYYY-MM-DD", type: "date", required: true },
    { key: "term", label: "Term", placeholder: "e.g. 12 months", type: "text", required: false },
    { key: "governing_law", label: "Governing Law", placeholder: "e.g. UAE", type: "text", required: false },
  ]
  const payment: TemplateVariable[] = [
    { key: "contract_value", label: "Contract Value", placeholder: "Amount", type: "number", required: false },
    { key: "currency", label: "Currency", placeholder: "AED / USD / INR", type: "text", required: false },
    { key: "payment_terms", label: "Payment Terms", placeholder: "e.g. NET 30 / milestone", type: "textarea", required: false },
  ]
  if (["NDA", "WAIVER", "POLICY", "TERMS_OF_SERVICE"].includes(category)) return base
  if (category === "SPONSORSHIP") {
    return [
      ...base,
      ...payment,
      { key: "sponsor_deliverables", label: "Sponsor Deliverables", placeholder: "Branding, hospitality, media rights...", type: "textarea", required: true },
    ]
  }
  if (category === "EMPLOYMENT" || category === "CONTRACTOR") {
    return [
      ...base,
      ...payment,
      { key: "role_title", label: "Role / Scope", placeholder: "Role, services, or engagement scope", type: "textarea", required: true },
      { key: "termination_terms", label: "Termination Terms", placeholder: "Notice and termination rights", type: "textarea", required: false },
    ]
  }
  return [
    ...base,
    ...payment,
    { key: "scope", label: "Scope", placeholder: "Commercial/legal scope", type: "textarea", required: false },
  ]
}

function templateContentFor(doc: LegalDocument): string | null {
  const content = extractedPreview(doc.notes) || stripPreviousBackfill(doc.notes)
  const cleaned = content
    .replace(/^source:[\s\S]*?Extracted preview:\s*/i, "")
    .trim()
  if (cleaned.length < 300) return null
  return cleaned.slice(0, 20_000)
}

function appendAnalysisNotes(notes: string | null, analysis: Analysis): string {
  const base = stripPreviousBackfill(notes)
  const lines = [
    SOURCE_MARKER_START,
    `Status evidence: ${analysis.reasons.join("; ") || "none"}`,
    `Template candidate: ${analysis.templateEligible ? "yes" : "no"}`,
    analysis.counterparty ? `Counterparty: ${analysis.counterparty}` : null,
    analysis.startDate ? `Start date: ${analysis.startDate.toISOString().slice(0, 10)}` : null,
    analysis.endDate ? `End date: ${analysis.endDate.toISOString().slice(0, 10)}` : null,
    analysis.contractValue ? `Contract value: ${analysis.currencyCode} ${analysis.contractValue}` : null,
    SOURCE_MARKER_END,
  ].filter(Boolean)
  return `${base}${base ? "\n\n" : ""}${lines.join("\n")}`.trim()
}

function analyzeDocument(doc: LegalDocument): Analysis {
  const fullText = evidenceText(doc)
  const metadata = metadataText(doc)
  const signed = hasStrongSignedEvidence(metadata, doc.lifecycle_status)
  const status = inferStatus(doc, metadata, signed)
  const category = inferCategory(doc, metadata, fullText)
  const entity = inferEntity(doc, metadata)
  const sport = inferSport(metadata, doc.sport)
  const counterparty = inferCounterparty(doc)
  const { startDate, endDate, expiryDate } = inferDates(doc, fullText)
  const money = inferMoney(extractedPreview(doc.notes) || fullText)
  const normalized = normalizeText(fullText)
  const templateEligible = inferTemplateEligibility(category, signed, fullText)
  const templateContent = templateEligible ? templateContentFor(doc) : null
  const isRecurring = /\b(recurring|monthly|quarterly|annual|annually|subscription|retainer)\b/i.test(normalized)
  const billingFrequency =
    /\bmonthly\b/i.test(normalized) ? "monthly" :
      /\bquarterly\b/i.test(normalized) ? "quarterly" :
        /\b(annual|annually|yearly)\b/i.test(normalized) ? "annual" :
          isRecurring ? "custom" : null
  const autoRenew = /\b(auto renew|auto-renew|automatically renew|renew automatically)\b/i.test(normalized)
  const reasons = [
    signed ? "signed evidence found" : "no signed evidence found",
    templateEligible ? "eligible for reusable template" : "not template eligible",
    startDate || endDate ? "date terms extracted" : "no date terms extracted",
    money.amount ? "commercial value extracted" : "no commercial value extracted",
  ]

  return {
    status,
    category,
    entity,
    sport,
    counterparty,
    startDate,
    endDate,
    expiryDate,
    contractValue: money.amount,
    currencyCode: money.currencyCode,
    isRecurring,
    billingFrequency,
    autoRenew,
    templateEligible: templateEligible && !!templateContent,
    templateContent,
    templateVariables: inferTemplateVariables(category),
    reasons,
  }
}

function sameDate(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

function normalizedTemplateName(title: string): string {
  return normalizeText(`Template - ${title}`).slice(0, 180)
}

async function main() {
  const args = parseArgs()
  const { prisma } = await import("../src/lib/prisma")
  const operator = await prisma.appUser.findFirst({
    where: { role: { in: ["PLATFORM_ADMIN", "LEGAL_ADMIN", "FINANCE_ADMIN"] } },
    orderBy: { created_at: "asc" },
    select: { id: true, email: true },
  })
  if (!operator) throw new Error("No admin user found for lifecycle event attribution")

  const documents = await prisma.legalDocument.findMany({
    skip: args.offset,
    take: args.limit,
    orderBy: { created_at: "asc" },
  })
  const existingTemplates = await prisma.contractTemplate.findMany({
    select: { id: true, name: true, category: true, entity: true },
  })
  const templateIndex = new Map(existingTemplates.map((template) => [normalizeText(template.name), template]))

  const summary = {
    apply: args.apply,
    scanned: documents.length,
    documentsUpdated: 0,
    statusChanged: 0,
    templatesCreated: 0,
    templatesUpdated: 0,
    signed: 0,
    templateEligible: 0,
    datesUpdated: 0,
    valuesUpdated: 0,
    templatesDeactivated: 0,
  }

  for (const doc of documents) {
    const analysis = analyzeDocument(doc)
    if (analysis.status === "SIGNED" || SYNCABLE_STATUSES.has(analysis.status)) summary.signed += 1
    if (analysis.templateEligible) summary.templateEligible += 1

    const nextNotes = appendAnalysisNotes(doc.notes, analysis)
    const nextContractValue = analysis.contractValue ?? doc.contract_value_usd ?? doc.value ?? null
    const nextCurrencyCode = analysis.contractValue
      ? analysis.currencyCode
      : doc.contract_value_usd
        ? doc.currency_code ?? doc.currency ?? "USD"
        : doc.value
          ? doc.currency ?? doc.currency_code ?? "USD"
          : doc.currency_code ?? doc.currency ?? "USD"
    const data: Partial<LegalDocument> = {
      category: analysis.category,
      entity: analysis.entity,
      sport: analysis.sport,
      lifecycle_status: analysis.status,
      contract_status: mapLifecycleStatusToContractStatus(analysis.status),
      contract_name: doc.contract_name ?? doc.title,
      counterparty: analysis.counterparty,
      sponsor_name: doc.sponsor_name ?? analysis.counterparty,
      contract_start_date: analysis.startDate,
      contract_end_date: analysis.endDate,
      expiry_date: analysis.expiryDate,
      contract_value_usd: nextContractValue as never,
      currency_code: nextCurrencyCode,
      is_recurring: analysis.isRecurring,
      billing_frequency: analysis.billingFrequency,
      auto_renew: analysis.autoRenew,
      notes: nextNotes,
    }

    const changed =
      data.category !== doc.category ||
      data.entity !== doc.entity ||
      data.sport !== doc.sport ||
      data.lifecycle_status !== doc.lifecycle_status ||
      data.contract_status !== doc.contract_status ||
      data.counterparty !== doc.counterparty ||
      data.sponsor_name !== doc.sponsor_name ||
      !sameDate(data.contract_start_date as Date | null, doc.contract_start_date) ||
      !sameDate(data.contract_end_date as Date | null, doc.contract_end_date) ||
      !sameDate(data.expiry_date as Date | null, doc.expiry_date) ||
      String(data.contract_value_usd ?? "") !== String(doc.contract_value_usd ?? "") ||
      data.currency_code !== doc.currency_code ||
      data.is_recurring !== doc.is_recurring ||
      data.billing_frequency !== doc.billing_frequency ||
      data.auto_renew !== doc.auto_renew ||
      data.notes !== doc.notes

    if (changed) {
      summary.documentsUpdated += 1
      if (analysis.status !== doc.lifecycle_status) summary.statusChanged += 1
      if (!sameDate(data.contract_start_date as Date | null, doc.contract_start_date) || !sameDate(data.contract_end_date as Date | null, doc.contract_end_date) || !sameDate(data.expiry_date as Date | null, doc.expiry_date)) {
        summary.datesUpdated += 1
      }
      if (nextContractValue && String(nextContractValue) !== String(doc.contract_value_usd ?? "")) {
        summary.valuesUpdated += 1
      }
    }

    const templateName = `Template - ${doc.title}`.slice(0, 180)
    const existingTemplate = templateIndex.get(normalizedTemplateName(doc.title))
    if (analysis.templateEligible) {
      if (existingTemplate) summary.templatesUpdated += 1
      else summary.templatesCreated += 1
    }

    console.log(JSON.stringify({
      id: doc.id,
      title: doc.title,
      status: `${doc.lifecycle_status}->${analysis.status}`,
      category: `${doc.category}->${analysis.category}`,
      entity: `${doc.entity}->${analysis.entity}`,
      counterparty: analysis.counterparty,
      startDate: analysis.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: analysis.endDate?.toISOString().slice(0, 10) ?? null,
      value: analysis.contractValue,
      template: analysis.templateEligible ? (existingTemplate ? "update" : "create") : "no",
      changed,
    }))

    if (!args.apply) continue

    await prisma.$transaction(async (tx) => {
      if (changed) {
        await tx.legalDocument.update({
          where: { id: doc.id },
          data: data as never,
        })
        if (analysis.status !== doc.lifecycle_status) {
          await tx.lifecycleEvent.create({
            data: {
              document_id: doc.id,
              from_status: doc.lifecycle_status,
              to_status: analysis.status,
              transitioned_by: operator.id,
              notes: "Automated document analysis backfill: signed/template/term classification.",
            },
          })
        }
      }

      if (analysis.templateEligible && analysis.templateContent) {
        if (existingTemplate) {
          await tx.contractTemplate.update({
            where: { id: existingTemplate.id },
            data: {
              category: analysis.category,
              entity: analysis.entity,
              sport: analysis.sport,
              content: analysis.templateContent,
              variables: analysis.templateVariables,
              is_active: true,
            },
          })
        } else {
          const created = await tx.contractTemplate.create({
            data: {
              name: templateName,
              category: analysis.category,
              entity: analysis.entity,
              sport: analysis.sport,
              content: analysis.templateContent,
              variables: analysis.templateVariables,
            },
          })
          templateIndex.set(normalizeText(created.name), {
            id: created.id,
            name: created.name,
            category: created.category,
            entity: created.entity,
          })
        }
      }
    }, { maxWait: 20_000, timeout: 60_000 })
  }

  const activeTemplates = await prisma.contractTemplate.findMany({
    where: { is_active: true },
    orderBy: [{ name: "asc" }, { usage_count: "desc" }, { created_at: "asc" }],
    select: { id: true, name: true },
  })
  const seenTemplateNames = new Set<string>()
  const duplicateTemplateIds: string[] = []
  for (const template of activeTemplates) {
    const key = normalizeText(template.name)
    if (seenTemplateNames.has(key)) {
      duplicateTemplateIds.push(template.id)
    } else {
      seenTemplateNames.add(key)
    }
  }
  summary.templatesDeactivated = duplicateTemplateIds.length

  if (args.apply && duplicateTemplateIds.length > 0) {
    await prisma.contractTemplate.updateMany({
      where: { id: { in: duplicateTemplateIds } },
      data: { is_active: false },
    })
  }

  if (args.apply) {
    await prisma.agentActivityLog.create({
      data: {
        agent_id: "document-analysis-backfill",
        agent_name: "Document Analysis Backfill",
        action: "completed",
        details: summary,
      },
    })
  }

  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma")
    await prisma.$disconnect()
  })
