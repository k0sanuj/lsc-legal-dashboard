import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { postToFinance, type FinanceEventType } from "@/lib/finance-webhook"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

const FINANCE_EVENT_TYPES: FinanceEventType[] = [
  "contract.created",
  "contract.updated",
  "tranche.created",
  "tranche.updated",
  "share_grant.created",
  "share_grant.updated",
]

const MAX_ATTEMPTS = 6 // ~1.5h total at 15-min intervals

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const candidates = await prisma.crossModuleEvent.findMany({
    where: {
      source: "legal",
      processed: false,
      event_type: { in: FINANCE_EVENT_TYPES },
      created_at: { gte: sevenDaysAgo },
    },
    orderBy: { created_at: "asc" },
    take: 50,
  })

  let succeeded = 0
  let failed = 0
  let abandoned = 0

  for (const evt of candidates) {
    const payload = (evt.payload as Record<string, unknown>) ?? {}
    const lastAttempt = payload._last_attempt as { count?: number } | undefined
    const attempts = (lastAttempt?.count ?? 0) + 1

    if (attempts > MAX_ATTEMPTS) {
      await prisma.crossModuleEvent.update({
        where: { id: evt.id },
        data: {
          payload: {
            ...payload,
            _abandoned: true,
            _abandoned_at: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      })
      abandoned++
      continue
    }

    // Strip our internal _last_attempt before posting (Finance shouldn't see it)
    const cleanPayload = { ...payload }
    delete cleanPayload._last_attempt
    delete cleanPayload._abandoned

    const result = await postToFinance({
      eventId: evt.id,
      eventType: evt.event_type as FinanceEventType,
      occurredAt: evt.created_at.toISOString(),
      payload: cleanPayload,
    })

    await prisma.crossModuleEvent.update({
      where: { id: evt.id },
      data: {
        processed: result.ok,
        payload: {
          ...payload,
          _last_attempt: {
            count: attempts,
            status: result.status,
            error: result.error ?? null,
            attempted_at: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    })

    // Mirror final status onto the originating row when we can identify it
    if (evt.entity_type === "PaymentCycle") {
      await prisma.paymentCycle
        .update({
          where: { id: evt.entity_id },
          data: {
            last_finance_post_at: new Date(),
            finance_post_status: result.ok ? "synced" : "failed",
            last_finance_post_error: result.ok ? null : (result.error ?? "Unknown"),
          },
        })
        .catch(() => {
          /* row may have been deleted */
        })
    } else if (evt.entity_type === "ESOPGrant") {
      await prisma.eSOPGrant
        .update({
          where: { id: evt.entity_id },
          data: {
            last_finance_post_at: new Date(),
            finance_post_status: result.ok ? "synced" : "failed",
            last_finance_post_error: result.ok ? null : (result.error ?? "Unknown"),
          },
        })
        .catch(() => {})
    } else if (evt.entity_type === "LegalDocument") {
      await prisma.legalDocument
        .update({
          where: { id: evt.entity_id },
          data: {
            last_finance_post_at: new Date(),
            finance_post_status: result.ok ? "synced" : "failed",
            last_finance_post_error: result.ok ? null : (result.error ?? "Unknown"),
          },
        })
        .catch(() => {})
    }

    if (result.ok) succeeded++
    else failed++
  }

  return NextResponse.json({
    ok: true,
    examined: candidates.length,
    succeeded,
    failed,
    abandoned,
  })
}
