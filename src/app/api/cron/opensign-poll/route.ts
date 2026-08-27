import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"
import { getOpenSignSetupStatus } from "@/lib/opensign"
import { applyOpenSignStatus } from "@/lib/opensign-sync"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Polls OpenSign for signing progress.
 *
 * The self-hosted OpenSign build has no webhooks, so this replaces them. It is
 * the only mechanism by which a signed contract becomes a SIGNED document, a
 * filed PDF, and a Finance event, which is why it runs frequently and reports
 * failures per document rather than aborting the batch.
 */

/** Bounded so one stuck document cannot starve the rest of the batch. */
const MAX_DOCUMENTS_PER_RUN = 40

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const setup = getOpenSignSetupStatus()
  if (!setup.configured) {
    return Response.json({
      ok: false,
      reason: "OpenSign is not configured",
      missing: setup.missing,
    })
  }

  const documents = await prisma.legalDocument.findMany({
    where: {
      signature_provider: "opensign",
      signature_provider_request_id: { not: null },
      lifecycle_status: "AWAITING_SIGNATURE",
    },
    orderBy: { signature_sent_at: "asc" },
    take: MAX_DOCUMENTS_PER_RUN,
    select: { id: true, title: true },
  })

  const results = []
  for (const doc of documents) {
    try {
      results.push(await applyOpenSignStatus(doc.id))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`OpenSign poll failed for ${doc.id} (${doc.title}):`, message)
      results.push({
        documentId: doc.id,
        changed: false,
        status: "skipped" as const,
        detail: message.slice(0, 300),
      })
    }
  }

  const summary = {
    ok: true,
    polled: documents.length,
    truncated: documents.length === MAX_DOCUMENTS_PER_RUN,
    completed: results.filter((r) => r.status === "completed" && r.changed).length,
    declined: results.filter((r) => r.status === "declined" && r.changed).length,
    updated: results.filter((r) => r.changed).length,
    failed: results.filter((r) => r.status === "skipped" && r.detail).length,
  }

  return Response.json({ ...summary, results })
}
