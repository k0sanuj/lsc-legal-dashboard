import { NextRequest } from "next/server"
import { after } from "next/server"
import {
  openSlackModal,
  resolveSlackActor,
  verifySlackSignature,
  slackSession,
  type SlackActor,
} from "@/lib/slack"
import {
  buildAgreementLookupBlocks,
  buildLegalStatusBlocks,
  buildMndaModalView,
  buildSignaturesBlocks,
  type SlackBlock,
} from "@/lib/slack-blocks"
import { agreementLookup, legalStatusSummary, signaturesInFlight } from "@/lib/slack-legal-queries"

import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import { executeSlackOperation } from "@/lib/slack-operations"
import { requireGlobalDocumentAccess } from "@/lib/document-access"

export const runtime = "nodejs"

/**
 * Slack commands share dashboard services and current document entitlements.
 *
 * There is no user session here. Every request is authenticated with the Slack
 * signing secret over the RAW body, then authorised against the
 * current Slack profile email and active AppUser via resolveSlackActor.
 *
 * ACK-FIRST, measured, not theoretical: Slack's slash-command deadline is 3
 * seconds, and a cold start of this function was measured at 4.7s end to end
 * (US-East function, Singapore database), which surfaced to the caller as
 * operation_timeout. So the response path now does ONLY signature
 * verification, which needs no I/O, and acknowledges immediately. Everything
 * that touches the database or the Slack Web API, the identity lookup
 * included, runs inside after() and delivers its result through the
 * response_url, which stays valid for 30 minutes.
 */

interface SlashContext {
  command: string
  text: string
  slackUserId: string
  channelId: string
  triggerId: string
  responseUrl: string
  requestKey: string
}

/** Immediate ephemeral ack; only the caller sees it. */
function ack(text: string): Response {
  return Response.json({ response_type: "ephemeral", text })
}

/**
 * Delivers the real answer through the response_url, replacing the ack.
 * Failures only console.error; there is nobody else to tell.
 */
async function respondVia(
  responseUrl: string,
  text: string,
  blocks?: SlackBlock[]
): Promise<boolean> {
  const target = new URL(responseUrl)
  if (target.protocol !== "https:" || !["hooks.slack.com", "hooks.slack-gov.com"].includes(target.hostname)) throw new Error("Invalid Slack response URL")
  if (!responseUrl) {
    console.error("[slack] no response_url to deliver")
    return false
  }
  try {
    const res = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "ephemeral",
        replace_original: true,
        text,
        ...(blocks ? { blocks } : {}),
      }),
      signal: AbortSignal.timeout(8000), redirect: "error",
    })
    if (!res.ok) {
      console.error(`[slack] response_url delivery failed: HTTP ${res.status}`)
    }
    return res.ok
  } catch {
    console.error("[slack] response_url delivery failed")
    return false
  }
}

/** Today in Asia/Dubai as YYYY-MM-DD; en-CA formats ISO dates. A 02:00 send in Dubai must not default to yesterday's UTC date. */
function todayInDubai(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date())
}

/** The deferred work behind /legal. Runs in after(). */
async function deliverLegalAnswer(ctx: SlashContext, actor: SlackActor): Promise<boolean> {
  const session = slackSession(actor)
  const [subcommand = "", ...rest] = ctx.text.trim().split(/\s+/)

  switch (subcommand.toLowerCase()) {
    case "":
    case "status": {
      const summary = await legalStatusSummary(session)
      return respondVia(ctx.responseUrl, "Legal status", buildLegalStatusBlocks(summary))
    }
    case "signatures": {
      const inFlight = await signaturesInFlight(session)
      return respondVia(ctx.responseUrl, "Signatures in flight", buildSignaturesBlocks(inFlight))
    }
    case "find": {
      const query = rest.join(" ").trim()
      if (!query) {
        return respondVia(ctx.responseUrl, "Usage: /legal find <title or counterparty>")
      }
      const hits = await agreementLookup(session, query)
      return respondVia(
        ctx.responseUrl,
        `Agreements matching "${query}"`,
        buildAgreementLookupBlocks(query, hits)
      )
    }
    default:
      return respondVia(ctx.responseUrl, await executeSlackOperation(session, subcommand.toLowerCase(), ctx.text.trim().slice(subcommand.length).trim(), ctx.requestKey))
  }
}

/** The deferred work behind /mnda: authorise, then open the modal. */
async function deliverMndaModal(
  ctx: SlashContext,
  actor: SlackActor
): Promise<void> {
  const session = await requireGlobalDocumentAccess(slackSession(actor))
  if (!["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"].includes(session.role)) throw new Error("MNDA editing access is required")
  const view = buildMndaModalView({
    todayDubai: todayInDubai(),
    privateMetadata: JSON.stringify({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorDisplay: actor.display,
      channelId: ctx.channelId,
    }),
  })

  const opened = await openSlackModal(ctx.triggerId, view)
  if (!opened.ok) {
    // Most common cause: a cold start consumed the trigger_id's 3 second
    // lifetime before views.open ran. The second attempt hits a warm instance.
    console.error("[slack] views.open failed:", opened.error)
    await respondVia(ctx.responseUrl, "Could not open the MNDA form in time. Run /mnda once more.")
  }
}

export async function POST(request: NextRequest) {
  // Raw body FIRST: the signature covers the exact bytes Slack sent, so any
  // parse-then-reserialize ordering would fail verification.
  const rawBody = await request.text()
  const verification = verifySlackSignature({
    timestamp: request.headers.get("x-slack-request-timestamp") ?? "",
    signature: request.headers.get("x-slack-signature") ?? "",
    rawBody,
  })
  if (!verification.valid) {
    console.error("[slack] command signature rejected:", verification.reason)
    return new Response(null, { status: 401 })
  }

  const params = new URLSearchParams(rawBody)
  const ctx: SlashContext = {
    command: params.get("command") ?? "",
    text: params.get("text") ?? "",
    slackUserId: params.get("user_id") ?? "",
    channelId: params.get("channel_id") ?? "",
    triggerId: params.get("trigger_id") ?? "",
    responseUrl: params.get("response_url") ?? "",
    requestKey: createHash("sha256").update(rawBody).digest("hex"),
  }

  if (ctx.command !== "/legal" && ctx.command !== "/mnda") {
    return ack(`Unknown command ${ctx.command}.`)
  }

  // Everything below the ack, allowlist lookup included, is deferred: the
  // response carries no data and therefore cannot miss the deadline.
  after(async () => {
    try {
      const actor = await resolveSlackActor(ctx.slackUserId)
      if (!actor) {
        await respondVia(ctx.responseUrl, "You are not authorised to use the legal commands.")
        return
      }
      if (ctx.command === "/legal") {
        const receipt = await prisma.webhookEventLog.create({ data: { provider: 'slack', event_hash: `slack-command-${ctx.requestKey}`, event_type: ctx.text.trim().split(/\s+/)[0] || 'status', processing_status: 'processing', raw_payload: { actorId: actor.userId, slackUserId: ctx.slackUserId } } }).catch(error => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null
          throw error
        })
        if (!receipt) { await respondVia(ctx.responseUrl, 'This request was already received. Check its result before retrying.'); return }
        try {
          const delivered = await deliverLegalAnswer(ctx, actor)
          await prisma.webhookEventLog.update({ where: { id: receipt.id }, data: { processing_status: 'processed', processed_at: new Date(), raw_payload: { actorId: actor.userId, slackUserId: ctx.slackUserId, responseDelivered: delivered } } })
        } catch (error) {
          await prisma.webhookEventLog.update({ where: { id: receipt.id }, data: { processing_status: 'failed', error: 'Command failed or access denied', processed_at: new Date() } })
          throw error
        }
      } else {
        await deliverMndaModal(ctx, actor)
      }
    } catch (error) {
      console.error("[slack] deferred command handling failed:", error instanceof Error ? error.name : "UnknownError")
      await respondVia(
        ctx.responseUrl,
        "The command could not complete. Check your access, command syntax, and integration readiness in the dashboard. No success receipt was recorded."
      )
    }
  })

  return ack(ctx.command === "/mnda" ? "Opening the MNDA form..." : "On it...")
}
