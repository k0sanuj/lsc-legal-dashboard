/**
 * pdf-lib layout engine for platform-generated contracts.
 *
 * Owns: rendering template text to an A4 PDF and reporting the exact position
 * of every field anchor it laid out, as fractions of the page box with a
 * TOP-LEFT origin; the same convention OpenSignFieldPlacement uses. The
 * conversion to OpenSign point coordinates happens only in src/lib/opensign.ts.
 *
 * Layout rules: A4 (595.28 x 841.89pt), 64pt margins, Helvetica 10.5pt on a
 * 14.5pt line, left aligned, blank template lines become paragraph spacing,
 * automatic pagination, "Page N of M" bottom center. An inline token
 * [[FIELD:<name>:<widthPt>]] inside body text records an anchor at that exact
 * spot, sized widthPt x 14pt, and renders as an underscored blank. The
 * two-column signature block renders last and moves to a fresh page when it
 * cannot fit whole on the final text page.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { PDFFont, PDFPage } from "pdf-lib"
import type { OpenSignPageDims } from "@/lib/opensign"

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 64
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BODY_SIZE = 10.5
const LINE_HEIGHT = 14.5
const PARAGRAPH_SPACING = 8
const TITLE_SIZE = 13
const TITLE_LINE_HEIGHT = 18
const TITLE_BOTTOM_SPACING = 10
const INLINE_FIELD_HEIGHT = 14
const PAGE_NUMBER_SIZE = 9
const PAGE_NUMBER_BASELINE = 36
const COLUMN_GAP = 24
const BLOCK_SPACING = 24
const COLUMN_SECTION_GAP = 10
const SIGNATURE_BOX_SPACING = 6
const DATE_LABEL_GAP = 6
const RULE_COLOR = rgb(0.45, 0.45, 0.45)
const PAGE_NUMBER_COLOR = rgb(0.55, 0.55, 0.55)

const FIELD_TOKEN = /^\[\[FIELD:([A-Za-z0-9_-]+):(\d+(?:\.\d+)?)\]\]$/
const FIELD_SPLIT = /(\[\[FIELD:[A-Za-z0-9_-]+:\d+(?:\.\d+)?\]\])/

/** Where a field landed, as fractions of the page box, origin TOP-LEFT. */
export interface FieldAnchor {
  page: number
  xPct: number
  yPct: number
  wPct: number
  hPct: number
}

/** A reserved, anchored box inside a signature column. */
export interface SignatureFieldSlot {
  name: string
  label: string
  widthPt: number
  heightPt: number
}

export interface SignatureBlockColumn {
  heading: string
  /** Address and email lines, rendered wrapped inside the column. */
  lines: string[]
  signature: SignatureFieldSlot
  byLine: string
  designationLine?: string
  date: SignatureFieldSlot
}

export interface SignatureBlockSpec {
  left: SignatureBlockColumn
  right: SignatureBlockColumn
}

export interface RenderContractInput {
  title: string
  bodyText: string
  signatureBlock: SignatureBlockSpec
}

export interface RenderContractResult {
  bytes: Buffer
  pages: OpenSignPageDims[]
  anchors: Record<string, FieldAnchor>
}

interface WordItem {
  kind: "word"
  text: string
  width: number
}

interface FieldItem {
  kind: "field"
  name: string
  width: number
}

type LineItem = WordItem | FieldItem

interface Layout {
  doc: PDFDocument
  font: PDFFont
  bold: PDFFont
  pages: PDFPage[]
  /** Distance in points from the page top to the top of the next line box. */
  yTop: number
  anchors: Record<string, FieldAnchor>
}

const CHAR_MAP: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00A0": " ",
  "\u2022": "-",
}

/**
 * Helvetica is WinAnsi encoded; anything outside Latin-1 would make pdf-lib
 * throw at draw time. Common typographic characters are mapped to ASCII and
 * the rest of the unencodable range is replaced, never dropped, so measured
 * widths always match what is drawn.
 */
function sanitizeText(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201C\u201D\u2013\u2014\u2026\u00A0\u2022]/g, (ch) => CHAR_MAP[ch] ?? ch)
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, "?")
}

/** Splits a template line into measured words and inline field tokens. */
function itemsFromLine(line: string, font: PDFFont, size: number): LineItem[] {
  const items: LineItem[] = []
  for (const part of line.split(FIELD_SPLIT)) {
    if (!part) continue
    const token = part.match(FIELD_TOKEN)
    if (token) {
      items.push({ kind: "field", name: token[1], width: Number(token[2]) })
      continue
    }
    for (const word of sanitizeText(part).split(/\s+/)) {
      if (!word) continue
      items.push({ kind: "word", text: word, width: font.widthOfTextAtSize(word, size) })
    }
  }
  return items
}

/** Greedy word wrap over words and fixed-width field items. */
function wrapItems(items: LineItem[], maxWidth: number, spaceWidth: number): LineItem[][] {
  const rows: LineItem[][] = []
  let row: LineItem[] = []
  let width = 0
  for (const item of items) {
    const needed = row.length === 0 ? item.width : width + spaceWidth + item.width
    if (row.length > 0 && needed > maxWidth) {
      rows.push(row)
      row = [item]
      width = item.width
    } else {
      row.push(item)
      width = needed
    }
  }
  if (row.length > 0) rows.push(row)
  return rows
}

function measureRow(row: LineItem[], spaceWidth: number): number {
  const itemWidth = row.reduce((sum, item) => sum + item.width, 0)
  return itemWidth + spaceWidth * Math.max(0, row.length - 1)
}

function currentPage(layout: Layout): PDFPage {
  return layout.pages[layout.pages.length - 1]
}

function addPage(layout: Layout): void {
  layout.pages.push(layout.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]))
  layout.yTop = MARGIN
}

function ensureRoom(layout: Layout, height: number): void {
  if (layout.yTop + height > PAGE_HEIGHT - MARGIN) addPage(layout)
}

/** Records where a field box sits on the CURRENT page, top-left fractions. */
function recordAnchor(layout: Layout, name: string, x: number, yTop: number, w: number, h: number): void {
  layout.anchors[name] = {
    page: layout.pages.length,
    xPct: x / PAGE_WIDTH,
    yPct: yTop / PAGE_HEIGHT,
    wPct: w / PAGE_WIDTH,
    hPct: h / PAGE_HEIGHT,
  }
}

/** Draws the underscored blank whose bottom edge sits at yBottom from the top. */
function drawBlankRule(page: PDFPage, x: number, yBottom: number, width: number): void {
  const y = PAGE_HEIGHT - yBottom
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 0.75,
    color: RULE_COLOR,
  })
}

/**
 * Draws one wrapped row at an explicit top offset on the current page. Field
 * items become recorded anchors drawn as underscored blanks, vertically
 * centered inside the line box.
 */
function drawRowAt(
  layout: Layout,
  row: LineItem[],
  x: number,
  yTop: number,
  size: number,
  font: PDFFont
): void {
  const page = currentPage(layout)
  const spaceWidth = font.widthOfTextAtSize(" ", size)
  const baselineY = PAGE_HEIGHT - yTop - size
  let cursor = x
  for (const item of row) {
    if (item.kind === "word") {
      page.drawText(item.text, { x: cursor, y: baselineY, size, font })
    } else {
      const fieldTop = yTop + (LINE_HEIGHT - INLINE_FIELD_HEIGHT) / 2
      recordAnchor(layout, item.name, cursor, fieldTop, item.width, INLINE_FIELD_HEIGHT)
      drawBlankRule(page, cursor, fieldTop + INLINE_FIELD_HEIGHT, item.width)
    }
    cursor += item.width + spaceWidth
  }
}

interface WriteWrappedOptions {
  font: PDFFont
  size: number
  x: number
  maxWidth: number
  lineHeight?: number
  centered?: boolean
}

/** Writes wrapped text at the layout cursor, paginating between rows. */
function writeWrapped(layout: Layout, text: string, opts: WriteWrappedOptions): void {
  const lineHeight = opts.lineHeight ?? LINE_HEIGHT
  const items = itemsFromLine(text, opts.font, opts.size)
  if (items.length === 0) return
  const spaceWidth = opts.font.widthOfTextAtSize(" ", opts.size)
  for (const row of wrapItems(items, opts.maxWidth, spaceWidth)) {
    ensureRoom(layout, lineHeight)
    const x = opts.centered ? opts.x + (opts.maxWidth - measureRow(row, spaceWidth)) / 2 : opts.x
    drawRowAt(layout, row, x, layout.yTop, opts.size, opts.font)
    layout.yTop += lineHeight
  }
}

/** Body text: each template line wraps; blank lines become paragraph spacing. */
function renderBody(layout: Layout, bodyText: string): void {
  for (const rawLine of bodyText.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      layout.yTop += PARAGRAPH_SPACING
      continue
    }
    writeWrapped(layout, rawLine.trimEnd(), {
      font: layout.font,
      size: BODY_SIZE,
      x: MARGIN,
      maxWidth: CONTENT_WIDTH,
    })
  }
}

/**
 * Draws one wrapped column line at an explicit offset and returns the height
 * it consumed. Used by both the measuring pass and the drawing pass of the
 * signature block, so the two can never disagree.
 */
function drawColumnLine(
  layout: Layout,
  text: string,
  x: number,
  yTop: number,
  colWidth: number,
  font: PDFFont,
  size: number,
  draw: boolean
): number {
  const items = itemsFromLine(text, font, size)
  if (items.length === 0) return LINE_HEIGHT
  const spaceWidth = font.widthOfTextAtSize(" ", size)
  const rows = wrapItems(items, colWidth, spaceWidth)
  if (draw) {
    rows.forEach((row, index) => drawRowAt(layout, row, x, yTop + index * LINE_HEIGHT, size, font))
  }
  return rows.length * LINE_HEIGHT
}

/**
 * Lays out one signature column from topY and returns its total height. With
 * draw false nothing is painted or anchored; the block placement uses that
 * pass to decide whether a fresh page is needed before anything is committed.
 */
function renderColumn(
  layout: Layout,
  column: SignatureBlockColumn,
  x: number,
  colWidth: number,
  topY: number,
  draw: boolean
): number {
  let y = topY
  y += drawColumnLine(layout, column.heading, x, y, colWidth, layout.bold, BODY_SIZE, draw)
  for (const line of column.lines) {
    y += drawColumnLine(layout, line, x, y, colWidth, layout.font, BODY_SIZE, draw)
  }
  y += COLUMN_SECTION_GAP

  y += drawColumnLine(layout, column.signature.label, x, y, colWidth, layout.font, BODY_SIZE, draw)
  if (draw) {
    recordAnchor(layout, column.signature.name, x, y, column.signature.widthPt, column.signature.heightPt)
    drawBlankRule(currentPage(layout), x, y + column.signature.heightPt, column.signature.widthPt)
  }
  y += column.signature.heightPt + SIGNATURE_BOX_SPACING

  y += drawColumnLine(layout, column.byLine, x, y, colWidth, layout.font, BODY_SIZE, draw)
  if (column.designationLine) {
    y += drawColumnLine(layout, column.designationLine, x, y, colWidth, layout.font, BODY_SIZE, draw)
  }

  const dateRowHeight = Math.max(LINE_HEIGHT, column.date.heightPt)
  if (draw) {
    const page = currentPage(layout)
    const label = sanitizeText(column.date.label)
    page.drawText(label, {
      x,
      y: PAGE_HEIGHT - y - BODY_SIZE,
      size: BODY_SIZE,
      font: layout.font,
    })
    const boxX = x + layout.font.widthOfTextAtSize(label, BODY_SIZE) + DATE_LABEL_GAP
    const boxTop = y + (dateRowHeight - column.date.heightPt)
    recordAnchor(layout, column.date.name, boxX, boxTop, column.date.widthPt, column.date.heightPt)
    drawBlankRule(page, boxX, boxTop + column.date.heightPt, column.date.widthPt)
  }
  y += dateRowHeight

  return y - topY
}

/** The two-column closing block. Never split across pages. */
function renderSignatureBlock(layout: Layout, block: SignatureBlockSpec): void {
  const colWidth = (CONTENT_WIDTH - COLUMN_GAP) / 2
  const leftX = MARGIN
  const rightX = MARGIN + colWidth + COLUMN_GAP

  const height = Math.max(
    renderColumn(layout, block.left, leftX, colWidth, 0, false),
    renderColumn(layout, block.right, rightX, colWidth, 0, false)
  )

  if (layout.yTop + BLOCK_SPACING + height > PAGE_HEIGHT - MARGIN) {
    addPage(layout)
  } else {
    layout.yTop += BLOCK_SPACING
  }

  const top = layout.yTop
  renderColumn(layout, block.left, leftX, colWidth, top, true)
  renderColumn(layout, block.right, rightX, colWidth, top, true)
  layout.yTop = top + height
}

function drawPageNumbers(layout: Layout): void {
  const total = layout.pages.length
  layout.pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${total}`
    const width = layout.font.widthOfTextAtSize(label, PAGE_NUMBER_SIZE)
    page.drawText(label, {
      x: (PAGE_WIDTH - width) / 2,
      y: PAGE_NUMBER_BASELINE,
      size: PAGE_NUMBER_SIZE,
      font: layout.font,
      color: PAGE_NUMBER_COLOR,
    })
  })
}

/**
 * Renders the contract and returns the bytes together with the page dims and
 * the exact anchor of every field it laid out, ready for OpenSign placement.
 */
export async function renderContractPdf(input: RenderContractInput): Promise<RenderContractResult> {
  const doc = await PDFDocument.create()
  doc.setTitle(input.title)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const layout: Layout = { doc, font, bold, pages: [], yTop: MARGIN, anchors: {} }
  addPage(layout)

  writeWrapped(layout, input.title, {
    font: bold,
    size: TITLE_SIZE,
    x: MARGIN,
    maxWidth: CONTENT_WIDTH,
    lineHeight: TITLE_LINE_HEIGHT,
    centered: true,
  })
  layout.yTop += TITLE_BOTTOM_SPACING

  renderBody(layout, input.bodyText)
  renderSignatureBlock(layout, input.signatureBlock)
  drawPageNumbers(layout)

  const bytes = Buffer.from(await doc.save())
  const pages: OpenSignPageDims[] = layout.pages.map((_, index) => ({
    pageNumber: index + 1,
    widthPt: PAGE_WIDTH,
    heightPt: PAGE_HEIGHT,
  }))
  return { bytes, pages, anchors: layout.anchors }
}
