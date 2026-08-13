/**
 * Pure legal tracker message builders. Take plain scalars, return the
 * LegalTrackerMessage that src/lib/legal-tracker.ts renders per driver.
 *
 * No I/O, no env reads, no Prisma types. The caller passes appBaseUrl so this
 * stays pure and trivially testable.
 */
import type { LegalTrackerMessage, LegalTrackerMessageField } from "./legal-tracker"

export interface RedlineSentInput {
  documentTitle: string
  redlineTitle: string
  round: number
  counterparty: string | null
  sentBy: string
  url?: string
}

export interface AgreementSentInput {
  documentId: string
  title: string
  entity: string
  category: string
  counterparty: string | null
  value: number | string | null
  currency: string | null
  signerNames: string[]
  sentByEmail: string
  appBaseUrl: string
}

function text(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ""
  return trimmed || fallback
}

/**
 * AED is the primary currency, so an unset currency is read as AED. A currency
 * code Intl cannot use falls back to "<amount> <code>" instead of throwing.
 */
function formatMoney(value: number | string | null, currency: string | null): string | null {
  if (value === null || value === "") return null

  const amount = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(amount)) return null

  const code = (currency ?? "AED").trim().toUpperCase() || "AED"
  if (!/^[A-Z]{3}$/.test(code)) return `${amount} ${code}`

  return new Intl.NumberFormat("en-AE", { style: "currency", currency: code }).format(amount)
}

export function buildLegalDocumentUrl(appBaseUrl: string, documentId: string): string {
  const path = `/legal/documents/${documentId}`
  const base = appBaseUrl.trim().replace(/\/+$/, "")
  return base ? `${base}${path}` : path
}

/**
 * "An agreement went out for signature" notice for the legal tracker channel.
 * mention is true because this is the event Aditya Mishra must be pinged for.
 */
export function buildAgreementSentMessage(input: AgreementSentInput): LegalTrackerMessage {
  const title = text(input.title, "Untitled agreement")
  const entity = text(input.entity, "Unknown entity")
  const counterparty = text(input.counterparty, "Unknown counterparty")
  const sentBy = text(input.sentByEmail, "an unknown sender")
  const signerList = input.signerNames.map((name) => name.trim()).filter((name) => name.length > 0)
  const signers = signerList.length > 0 ? signerList.join(", ") : "No signer on record"
  const money = formatMoney(input.value, input.currency)

  const fields: LegalTrackerMessageField[] = [
    { label: "Document", value: title },
    { label: "Entity", value: entity },
    { label: "Category", value: text(input.category, "OTHER") },
    { label: "Counterparty", value: counterparty },
    { label: "Signers", value: signers },
    { label: "Sent by", value: sentBy },
  ]
  if (money) {
    fields.push({ label: "Value", value: money })
  }

  return {
    title: `Agreement sent for signature: ${title}`,
    summary: `${title} (${entity}) has been sent out for signature to ${signers}. Counterparty: ${counterparty}. Sent by ${sentBy}.`,
    url: buildLegalDocumentUrl(input.appBaseUrl, input.documentId),
    fields,
    mention: true,
  }
}

/**
 * "A redline round left the building" notice, for the redline transition into
 * SENT_TO_COUNTERPARTY. The caller supplies an already absolute url.
 */
export function buildRedlineSentMessage(input: RedlineSentInput): LegalTrackerMessage {
  const documentTitle = text(input.documentTitle, "Untitled agreement")
  const redlineTitle = text(input.redlineTitle, "Untitled redline")
  const counterparty = text(input.counterparty, "Unknown counterparty")
  const sentBy = text(input.sentBy, "an unknown sender")

  return {
    title: `Redline sent to counterparty: ${documentTitle}`,
    summary: `Round ${input.round} redline "${redlineTitle}" on ${documentTitle} has been sent to ${counterparty}. Sent by ${sentBy}.`,
    url: input.url,
    fields: [
      { label: "Document", value: documentTitle },
      { label: "Redline", value: redlineTitle },
      { label: "Round", value: String(input.round) },
      { label: "Counterparty", value: counterparty },
      { label: "Sent by", value: sentBy },
    ],
    mention: true,
  }
}
