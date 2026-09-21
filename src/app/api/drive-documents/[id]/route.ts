/** Stream approved Drive content only after current application entitlement checks. */
import { requireSession } from "@/lib/auth"
import { fetchLegalDriveFile } from "@/lib/drive-retrieval"
import { PRIVATE_FILE_HEADERS } from "@/lib/file-response"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireSession()
  try {
    const file = await fetchLegalDriveFile(actor, (await params).id)
    return new Response(new Uint8Array(file.bytes), { headers: { ...PRIVATE_FILE_HEADERS, "Content-Type": file.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replaceAll("'", "%27")}` } })
  } catch {
    return Response.json({ error: "Document unavailable. Request access from Legal." }, { status: 404 })
  }
}
