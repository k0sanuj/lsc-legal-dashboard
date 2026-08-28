import { NextResponse } from "next/server"
import { getOptionalSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getPresignedUrl, getS3KeyFromUrl } from "@/lib/s3"

export const runtime = "nodejs"

// Streams the document PDF through the app origin so the in-browser pdfjs
// renderer never has to fight S3 CORS, and so the bytes stay behind the
// session cookie instead of a shareable presigned link.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getOptionalSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const document = await prisma.legalDocument.findUnique({
      where: { id },
      select: { file_url: true },
    })
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }
    if (!document.file_url) {
      return NextResponse.json({ error: "Document has no file" }, { status: 404 })
    }

    const s3Key = getS3KeyFromUrl(document.file_url)
    const downloadUrl = s3Key ? await getPresignedUrl(s3Key) : document.file_url
    const upstream = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) })
    if (!upstream.ok || !upstream.body) {
      console.error(`Document file fetch failed for ${id}: HTTP ${upstream.status}`)
      return NextResponse.json(
        { error: "Could not read the document file" },
        { status: 502 }
      )
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    console.error("Failed to stream document file:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
