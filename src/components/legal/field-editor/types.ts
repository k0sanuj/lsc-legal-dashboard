// Client-side field model for the DocuSign-style placement editor.
//
// Geometry is stored ONLY as fractions of the rendered page box, origin
// top-left, mirroring OpenSignFieldPlacement in src/lib/opensign.ts. The
// client never computes PDF point coordinates; src/lib/opensign.ts owns that
// conversion at the provider boundary using the page dims captured here.

export type EditorFieldType =
  | "signature"
  | "initials"
  | "date"
  | "text input"
  | "name"
  | "email"

// One placed field. id and signerEmail are editor bookkeeping; the rest is
// exactly the shared OpenSignFieldPlacement shape.
export interface EditorField {
  id: string
  signerEmail: string
  page: number // 1-based
  xPct: number
  yPct: number
  wPct: number
  hPct: number
  type: EditorFieldType
  required: boolean
}

// Page dimensions in PDF points from getViewport({ scale: 1 }), mirroring
// OpenSignPageDims in src/lib/opensign.ts.
export interface EditorPageDims {
  pageNumber: number
  widthPt: number
  heightPt: number
}

export interface EditorSigner {
  name: string
  email: string
}

// Wire shape for one widget inside the widgetsJson FormData field; structurally
// identical to OpenSignFieldPlacement.
export interface FieldPlacementPayload {
  page: number
  xPct: number
  yPct: number
  wPct: number
  hPct: number
  type: EditorFieldType
  required: boolean
}

export const SIGNER_PALETTE = ["#93a3db", "#e6c3a5", "#a5d6c3", "#d6a5c9"] as const

export function signerColor(index: number): string {
  return SIGNER_PALETTE[((index % SIGNER_PALETTE.length) + SIGNER_PALETTE.length) % SIGNER_PALETTE.length]
}

export const FIELD_TYPE_LABELS: Record<EditorFieldType, string> = {
  signature: "Signature",
  initials: "Initials",
  date: "Date",
  "text input": "Text",
  name: "Name",
  email: "Email",
}

// Default drop sizes as fractions of the page width/height.
export const FIELD_DEFAULT_SIZES: Record<EditorFieldType, { wPct: number; hPct: number }> = {
  signature: { wPct: 0.24, hPct: 0.06 },
  initials: { wPct: 0.08, hPct: 0.05 },
  date: { wPct: 0.16, hPct: 0.03 },
  "text input": { wPct: 0.24, hPct: 0.03 },
  name: { wPct: 0.24, hPct: 0.03 },
  email: { wPct: 0.24, hPct: 0.03 },
}

// Smallest box a resize can produce, as fractions of the page box.
export const MIN_FIELD_W_PCT = 0.03
export const MIN_FIELD_H_PCT = 0.015

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Fractions are serialized at 4 decimals; on an A4 page that is < 0.1pt.
export function roundPct(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

export function roundPt(value: number): number {
  return Math.round(value * 100) / 100
}

// CSS px within a rendered page box -> fraction of that box.
export function pxToPct(px: number, boxSizePx: number): number {
  if (boxSizePx <= 0) return 0
  return px / boxSizePx
}

// Fraction of a rendered page box -> CSS px within it.
export function pctToPx(pct: number, boxSizePx: number): number {
  return pct * boxSizePx
}

// Keeps a field fully inside its page after a drop, move, or resize.
export function clampFieldToPage(field: EditorField): EditorField {
  const wPct = clamp(field.wPct, MIN_FIELD_W_PCT, 1)
  const hPct = clamp(field.hPct, MIN_FIELD_H_PCT, 1)
  return {
    ...field,
    wPct,
    hPct,
    xPct: clamp(field.xPct, 0, 1 - wPct),
    yPct: clamp(field.yPct, 0, 1 - hPct),
  }
}

// Serializes placed fields into the widgetsJson wire shape: lowercased signer
// email -> OpenSignFieldPlacement[]. Signers with no fields are omitted; the
// server decides what a missing signer key means.
export function buildWidgetsPayload(fields: EditorField[]): Record<string, FieldPlacementPayload[]> {
  const bySigner: Record<string, FieldPlacementPayload[]> = {}
  const ordered = [...fields].sort(
    (a, b) => a.page - b.page || a.yPct - b.yPct || a.xPct - b.xPct
  )
  for (const field of ordered) {
    const email = field.signerEmail.trim().toLowerCase()
    if (!email) continue
    const list = bySigner[email] ?? []
    list.push({
      page: field.page,
      xPct: roundPct(field.xPct),
      yPct: roundPct(field.yPct),
      wPct: roundPct(field.wPct),
      hPct: roundPct(field.hPct),
      type: field.type,
      required: field.required,
    })
    bySigner[email] = list
  }
  return bySigner
}

export function signerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0].charAt(0)
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ""
  return `${first}${last}`.toUpperCase() || "?"
}
