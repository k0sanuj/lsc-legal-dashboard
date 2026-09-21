import { requireDocumentAccess, DocumentAccessDenied } from "@/lib/document-access"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getLatestDocumentAnalysisSummary } from "@/lib/document-analysis-summary"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession()
    const { id } = await params
    await requireDocumentAccess(session, id)

    const document = await prisma.legalDocument.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        category: true,
        entity: true,
        file_url: true,
      },
    })

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    const analysis = await getLatestDocumentAnalysisSummary(id)

    return NextResponse.json({
      document: {
        id: document.id,
        title: document.title,
        category: document.category,
        entity: document.entity,
        hasFile: Boolean(document.file_url),
      },
      analysis,
    })
  } catch (error) {
    if (error instanceof DocumentAccessDenied) return NextResponse.json({ error: "Document not found" }, { status: 404 })
    console.error("Failed to load document analysis summary:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
