import { NextRequest } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { verifyMailgunWebhookSignature } from "@/lib/mailer"

export const runtime = "nodejs"

/**
 * Mailgun delivery events.
 *
 * This is the audit trail for outbound contract mail. When a counterparty says
 * they never received an agreement, the answer is a row in WebhookEventLog with
 * provider "mailgun": delivered, failed with a reason, or complained. Events are
 * linked back to the SignatureRequest whose signatory address they were sent to,
 * so a bounce is visible against the signer rather than only in Mailgun.
 *
 * Nothing here mutates agreement or signature state. A bounced invitation is an
 * operator's decision, not an automatic status change.
 */

/** Events worth persisting. Opens and clicks are noise for this purpose. */
const TRACKED_EVENTS = new Set([
  "delivered",
  "failed",
  "rejected",
  "complained",
  "unsubscribed",
])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

/**
 * A failure can be permanent (bad address) or temporary (full mailbox). Only the
 * permanent ones deserve an operator's attention.
 */
function describeFailure(eventData: Record<string, unknown>): string | null {
  const severity = asString(eventData.severity)
  const reason = asString(eventData.reason)
  const deliveryStatus = asRecord(eventData["delivery-status"])
  const message = asString(deliveryStatus.message) ?? asString(deliveryStatus.description)

  const parts = [severity, reason, message].filter(Boolean)
  return parts.length > 0 ? parts.join(": ").slice(0, 500) : null
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return new Response("Invalid Mailgun payload", { status: 400 })
  }

  const signature = asRecord(payload.signature)
  const verification = verifyMailgunWebhookSignature({
    timestamp: asString(signature.timestamp) ?? "",
    token: asString(signature.token) ?? "",
    signature: asString(signature.signature) ?? "",
  })

  if (!verification.valid) {
    console.error(`Mailgun webhook rejected: ${verification.reason}`)
    // 406 tells Mailgun to stop retrying; a bad signature will never improve.
    return new Response("Invalid Mailgun signature", { status: 406 })
  }

  const eventData = asRecord(payload["event-data"])
  const eventType = (asString(eventData.event) ?? "unknown").toLowerCase()
  const recipient = asString(eventData.recipient)

  if (!TRACKED_EVENTS.has(eventType)) {
    return new Response("Ignored", { status: 200 })
  }

  // Mailgun's token is unique per event, so it is the natural idempotency key.
  const eventHash = asString(signature.token) ?? ""
  const existing = await prisma.webhookEventLog.findUnique({
    where: { event_hash: eventHash },
    select: { id: true },
  })
  if (existing) {
    return new Response("Duplicate", { status: 200 })
  }

  // Correlate to a signer by address. Several agreements can share a signatory,
  // so take the most recently sent request for that address.
  let signatureRequestId: string | null = null
  let documentId: string | null = null
  if (recipient) {
    const signer = await prisma.signatureRequest.findFirst({
      where: { signatory_email: { equals: recipient, mode: "insensitive" } },
      orderBy: [{ sent_at: "desc" }, { created_at: "desc" }],
      select: { id: true, document_id: true },
    })
    if (signer) {
      signatureRequestId = signer.id
      documentId = signer.document_id
    }
  }

  const failure = eventType === "delivered" ? null : describeFailure(eventData)

  try {
    await prisma.webhookEventLog.create({
      data: {
        provider: "mailgun",
        event_hash: eventHash,
        event_type: eventType,
        signature_request_id: signatureRequestId,
        document_id: documentId,
        processing_status: eventType === "delivered" ? "processed" : "failed",
        raw_payload: payload as Prisma.InputJsonValue,
        error: failure,
        processed_at: new Date(),
      },
    })
  } catch (error) {
    console.error("Mailgun webhook logging failed:", error)
    // 500 so Mailgun retries; the event is worth more than this request.
    return new Response("Could not record Mailgun event", { status: 500 })
  }

  if (failure) {
    console.error(
      `Mailgun ${eventType} for ${recipient ?? "unknown recipient"}: ${failure}`
    )
  }

  return new Response("Mailgun Event Received", { status: 200 })
}
