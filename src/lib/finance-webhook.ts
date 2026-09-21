/**
 * Legal → Finance webhook sender.
 *
 * Pattern: persist to CrossModuleEvent first (durable queue), then attempt
 * an inline POST. If Finance is unreachable, the row stays processed=false
 * and the /api/cron/finance-resync route will retry it.
 *
 * Idempotency: the CrossModuleEvent.id is sent as `eventId`; Finance dedupes.
 *
 * HMAC scheme: `${ts}.${raw_body}` signed with FINANCE_WEBHOOK_SECRET, base64.
 */
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "./prisma"

const FINANCE_WEBHOOK_URL = process.env.FINANCE_WEBHOOK_URL ?? ""
const FINANCE_WEBHOOK_KEY = process.env.FINANCE_WEBHOOK_KEY ?? ""
const FINANCE_WEBHOOK_SECRET = process.env.FINANCE_WEBHOOK_SECRET ?? ""

export type FinanceEventType =
  | "contract.created"
  | "contract.updated"
  | "tranche.created"
  | "tranche.updated"
  | "share_grant.created"
  | "share_grant.updated"
  | "invoice_detected"
  | "dispute.exposure.updated"

export type FinanceEnvelope = {
  eventId: string
  eventType: FinanceEventType
  occurredAt: string
  payload: Record<string, unknown>
}

export async function postToFinance(
  envelope: FinanceEnvelope
): Promise<{ ok: boolean; status: number; error?: string }> {
  if (envelope.eventType === "dispute.exposure.updated" && process.env.FINANCE_DISPUTE_CONTRACT_VERSION !== "1") {
    return { ok: false, status: 0, error: "Finance dispute receiver contract v1 has not been confirmed" }
  }
  if (!FINANCE_WEBHOOK_URL || !FINANCE_WEBHOOK_KEY || !FINANCE_WEBHOOK_SECRET) {
    return { ok: false, status: 0, error: "Finance webhook env vars not set" }
  }

  // Sign the EXACT body string we send. JSON.stringify once, sign that, send that.
  const body = JSON.stringify(envelope)
  const ts = Math.floor(Date.now() / 1000).toString()

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(FINANCE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`))
  const sig = Buffer.from(new Uint8Array(sigBytes)).toString("base64")

  try {
    const res = await fetch(FINANCE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `LEGAL-HMAC key=${FINANCE_WEBHOOK_KEY}, ts=${ts}, sig=${sig}`,
      },
      body,
      // Vercel serverless cap is 10-60s; keep our wait short so a slow
      // Finance doesn't hold up the user's request.
      signal: AbortSignal.timeout(8000),
    })
    if (envelope.eventType === "dispute.exposure.updated" && res.ok) {
      const receipt: unknown = await res.json().catch(() => null)
      if (!receipt || typeof receipt !== 'object' || !('accepted' in receipt) || receipt.accepted !== true || !('eventId' in receipt) || receipt.eventId !== envelope.eventId) {
        return { ok: false, status: res.status, error: 'Finance did not acknowledge this dispute event ID' }
      }
    }
    return {
      ok: res.ok,
      status: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`,
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Persist to CrossModuleEvent FIRST (durable queue), then attempt the post.
 * On failure we leave processed=false and the cron retries.
 *
 * `entityType` and `entityId` describe the legal-side row this event refers
 * to (e.g. "PaymentCycle" + the tranche row id); they're required by the
 * CrossModuleEvent table and useful for the admin sync UI.
 */
export async function emitFinanceEvent(
  eventType: FinanceEventType,
  payload: Record<string, unknown>,
  ref: { entityType: string; entityId: string }
): Promise<{ ok: boolean; eventId: string; error?: string }> {
  const queueRow = await queueFinanceEvent(eventType, payload, ref)
  return deliverFinanceEvent(queueRow.id, eventType)
}

/** Allows a matter mutation and its outbox row to commit in one transaction. */
export async function queueFinanceEvent(
  eventType: FinanceEventType,
  payload: Record<string, unknown>,
  ref: { entityType: string; entityId: string },
  database: Prisma.TransactionClient = prisma
) {
  return database.crossModuleEvent.create({
    data: {
      source: "legal",
      event_type: eventType,
      entity_type: ref.entityType,
      entity_id: ref.entityId,
      payload: payload as Prisma.InputJsonValue,
      processed: false,
    },
  })
}

/** Deliver an already durable event; the event ID is stable across retries. */
export async function deliverFinanceEvent(eventId: string, eventType: FinanceEventType): Promise<{ ok: boolean; eventId: string; error?: string }> {
  const queueRow = await prisma.crossModuleEvent.findUniqueOrThrow({ where: { id: eventId } })
  if (queueRow.source !== 'legal' || queueRow.event_type !== eventType) throw new Error('Finance event type mismatch')
  if (queueRow.processed) return { ok: true, eventId }
  const storedPayload = (queueRow.payload ?? {}) as Record<string, unknown>
  const previousAttempt = storedPayload._last_attempt as { count?: number } | undefined
  const payload = { ...storedPayload }
  delete payload._last_attempt
  delete payload._abandoned
  delete payload._abandoned_at

  const envelope: FinanceEnvelope = {
    eventId: queueRow.id,
    eventType,
    occurredAt: queueRow.created_at.toISOString(),
    payload,
  }

  const result = await postToFinance(envelope)

  await prisma.crossModuleEvent.update({
    where: { id: queueRow.id },
    data: {
      processed: result.ok,
      payload: {
        ...payload,
        _last_attempt: { count: (previousAttempt?.count ?? 0) + 1, status: result.status, error: result.error ?? null },
      } as Prisma.InputJsonValue,
    },
  })

  return { ok: result.ok, eventId: queueRow.id, error: result.error }
}
