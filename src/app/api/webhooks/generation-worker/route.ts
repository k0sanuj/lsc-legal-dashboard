/** Authenticated pull-worker protocol. ChatGPT login credentials never enter this route. */
import { authenticateGenerationWorker, handleGenerationWorker } from "@/lib/contract-generation-queue"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const identity = authenticateGenerationWorker(request.headers)
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (Number(request.headers.get("content-length")) > 1_000_000) return Response.json({ error: "Payload too large" }, { status: 413 })
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw) > 1_000_000) return Response.json({ error: "Payload too large" }, { status: 413 })
    return Response.json(await handleGenerationWorker(identity, JSON.parse(raw)), { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Worker request rejected" }, { status: 400 })
  }
}
