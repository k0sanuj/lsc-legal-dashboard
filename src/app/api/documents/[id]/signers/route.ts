import { NextResponse } from "next/server"
import { getOptionalSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

// Pending signers for the field placement editor. Session-gated like the
// sibling file route; returns name/email pairs only.
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
      select: {
        signature_requests: {
          where: { status: "PENDING" },
          select: { signatory_name: true, signatory_email: true },
          orderBy: { created_at: "asc" },
        },
      },
    })
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    return NextResponse.json({
      signers: document.signature_requests.map((request) => ({
        name: request.signatory_name,
        email: request.signatory_email,
      })),
    })
  } catch (error) {
    console.error("Failed to load pending signers:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
