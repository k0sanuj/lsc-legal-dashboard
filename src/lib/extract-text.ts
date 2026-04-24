/**
 * Extract plain text from an uploaded File (PDF, DOCX, TXT, MD, RTF).
 * Best-effort: returns empty string on unknown types or parse failure.
 * Caller should always fall back to the document's title/notes when the
 * extracted text is empty.
 */

import mammoth from "mammoth"

const MAX_CHARS = 12000 // trimmed further at the LLM boundary

async function bufferFrom(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer())
}

async function extractPdf(file: File): Promise<string> {
  // Dynamic import keeps pdfjs-dist out of the edge/client bundle graph.
  const { PDFParse } = await import("pdf-parse")
  const buf = await bufferFrom(file)
  // pdf-parse v2 accepts a Uint8Array / Buffer via `data`.
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  try {
    const result = await parser.getText()
    return (result.text ?? "").trim()
  } finally {
    await parser.destroy().catch(() => {})
  }
}

async function extractDocx(file: File): Promise<string> {
  const buf = await bufferFrom(file)
  const result = await mammoth.extractRawText({ buffer: buf })
  return (result.value ?? "").trim()
}

async function extractPlainText(file: File): Promise<string> {
  return (await file.text()).trim()
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()

  try {
    let text = ""
    if (type === "application/pdf" || name.endsWith(".pdf")) {
      text = await extractPdf(file)
    } else if (
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx")
    ) {
      text = await extractDocx(file)
    } else if (
      type.startsWith("text/") ||
      name.endsWith(".txt") ||
      name.endsWith(".md") ||
      name.endsWith(".markdown")
    ) {
      text = await extractPlainText(file)
    }
    return text.slice(0, MAX_CHARS)
  } catch (err) {
    console.error("extractTextFromFile failed:", err)
    return ""
  }
}
