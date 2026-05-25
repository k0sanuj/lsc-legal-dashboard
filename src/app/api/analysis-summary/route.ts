import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getLatestUploadAnalysisSummary } from "@/lib/document-analysis-summary"

export async function GET(request: NextRequest) {
  try {
    await requireSession()

    const searchParams = request.nextUrl.searchParams
    const target = searchParams.get("target") ?? "document"
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    if (target === "document") {
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

      return NextResponse.json({
        document: {
          id: document.id,
          title: document.title,
          category: document.category,
          entity: document.entity,
          hasFile: Boolean(document.file_url),
        },
        analysis: await getLatestUploadAnalysisSummary({ documentId: id }),
      })
    }

    if (target === "kyc") {
      const document = await prisma.kycDocument.findUnique({
        where: { id },
        select: {
          id: true,
          document_name: true,
          document_type: true,
          entity: true,
          file_url: true,
        },
      })
      if (!document) {
        return NextResponse.json({ error: "KYC document not found" }, { status: 404 })
      }

      return NextResponse.json({
        document: {
          id: document.id,
          title: document.document_name,
          category: document.document_type,
          entity: document.entity,
          hasFile: Boolean(document.file_url),
        },
        analysis: await getLatestUploadAnalysisSummary({ kycDocumentId: id }),
      })
    }

    if (target === "litigation") {
      const document = await prisma.litigationDocument.findUnique({
        where: { id },
        include: {
          case_record: { select: { entity: true } },
        },
      })
      if (!document) {
        return NextResponse.json({ error: "Litigation document not found" }, { status: 404 })
      }

      return NextResponse.json({
        document: {
          id: document.id,
          title: document.title,
          category: document.doc_type,
          entity: document.case_record.entity,
          hasFile: Boolean(document.file_url),
        },
        analysis: await getLatestUploadAnalysisSummary({ litigationDocumentId: id }),
      })
    }

    return NextResponse.json({ error: "Invalid analysis target" }, { status: 400 })
  } catch (error) {
    console.error("Failed to load upload analysis summary:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
