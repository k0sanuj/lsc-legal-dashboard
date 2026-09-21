import { NextRequest } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  hashOpenSignWebhookEvent,
  verifyOpenSignWebhookSignature,
} from "@/lib/opensign"
import { applyOpenSignStatus } from "@/lib/opensign-sync"
import { fetchOpenSignDocument } from "@/lib/opensign"

export const runtime = "nodejs"

/**
 * NOTE: the self-hosted OpenSign build sends no webhooks. Nothing in its server
 * source references them, and the Webhook settings page is not in the client
 * bundle. This route is therefore dead for the current deployment and is kept
 * only for a future hosted instance. The live mechanism is the polling cron at
 * /api/cron/opensign-poll, which shares the completion path in
 * src/lib/opensign-sync.ts.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function pickString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(payload[key])
    if (value) return value
  }
  const nested = asRecord(payload.data)
  if (Object.keys(nested).length > 0) {
    return pickString(nested, keys)
  }
  return null
}

function eventTypeFromPayload(payload: Record<string, unknown>): string {
  return (
    pickString(payload, ["event", "eventType", "type", "event_name"]) ??
    "unknown"
  )
}

function providerIdFromPayload(payload: Record<string, unknown>): string | null {
  return pickString(payload, ["objectId", "documentId", "document_id", "id", "_id"])
}

/** Webhooks are hints only. Verify the exact active binding, then read provider truth. */
async function processOpenSignEvent(payload: Record<string, unknown>) {
  const providerId = providerIdFromPayload(payload)
  if (!providerId) return { status: "ignored", error: "Provider request ID missing" }
  const metadata = asRecord(payload.metadata ?? asRecord(payload.data).metadata)
  const documentId = asString(metadata.documentId)
  const doc = await prisma.legalDocument.findFirst({ where: { signature_provider: "opensign", signature_provider_request_id: providerId, ...(documentId ? { id: documentId } : {}) }, select: { id: true } })
  if (!doc) return { status: "ignored", error: "Event does not match a current provider request" }
  const providerStatus = await fetchOpenSignDocument(providerId)
  const result = await applyOpenSignStatus(doc.id, providerStatus)
  return { status: result.status === "skipped" ? "ignored" : "processed", documentId: doc.id }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature =
    request.headers.get("x-webhook-signature") ??
    request.headers.get("x-opensign-signature") ??
    request.headers.get("x-signature")

  if (!verifyOpenSignWebhookSignature(rawBody, signature)) {
    return new Response("Invalid OpenSign webhook signature", { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return new Response("Invalid OpenSign webhook payload", { status: 400 })
  }

  const eventHash = hashOpenSignWebhookEvent(rawBody)
  const existing = await prisma.webhookEventLog.findUnique({
    where: { event_hash: eventHash },
    select: { id: true, processing_status: true },
  })
  if (existing && ["processed", "ignored"].includes(existing.processing_status)) {
    return new Response("OpenSign Event Received", { status: 200 })
  }

  const log = existing ?? await prisma.webhookEventLog.upsert({
    where: { event_hash: eventHash },
    update: {},
    create: {
      provider: "opensign",
      event_hash: eventHash,
      event_type: eventTypeFromPayload(payload),
      raw_payload: payload as Prisma.InputJsonValue,
    },
  })

  try {
    const result = await processOpenSignEvent(payload)
    await prisma.webhookEventLog.update({
      where: { id: log.id },
      data: {
        processing_status: result.status,
        document_id: "documentId" in result ? result.documentId : null,
        error: "error" in result ? result.error : null,
        processed_at: new Date(),
      },
    })
    return new Response("OpenSign Event Received", { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("OpenSign webhook processing failed:", error)
    await prisma.webhookEventLog.update({
      where: { id: log.id },
      data: {
        processing_status: "failed",
        error: message,
      },
    })
    return new Response("OpenSign webhook processing failed", { status: 500 })
  }
}
