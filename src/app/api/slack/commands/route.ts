import { NextRequest } from "next/server"
import { after } from "next/server"
import {
  openSlackModal,
  resolveSlackActor,
  verifySlackSignature,
} from "@/lib/slack"
import {
  buildAgreementLookupBlocks,
  buildLegalHelpBlocks,
  buildLegalStatusBlocks,
  buildMndaModalView,
  buildSignaturesBlocks,
  type SlackBlock,
} from "@/lib/slack-blocks"
import { agreementLookup, legalStatusSummary, signaturesInFlight } from "@/lib/slack-legal-queries"

export const runtime = "nodejs"

/**
 * Slack slash commands: /legal (read) and /mnda (write).
 *
 * There is no user session here. Every request is authenticated with the Slack
 * signing secret over the RAW body, then authorised against the
 * SLACK_LEGAL_ADMINS allowlist via resolveSlackActor.
 *
 * ACK-FIRST, measured, not theoretical: Slack's slash-command deadline is 3
 * seconds, and a cold start of this function was measured at 4.7s end to end
 * (US-East function, Singapore database), which surfaced to the caller as
 * operation_timeout. So the response path now does ONLY signature
 * verification, which needs no I/O, and acknowledges immediately. Everything
 * that touches the database or the Slack Web API, the allowlist lookup
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
): Promise<void> {
  if (!responseUrl) {
    console.error("[slack] no response_url to deliver:", text)
    return
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
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error(`[slack] response_url delivery failed: HTTP ${res.status}`)
    }
  } catch (error) {
    console.error("[slack] response_url delivery failed:", error)
  }
}

/** Today in Asia/Dubai as YYYY-MM-DD; en-CA formats ISO dates. A 02:00 send in Dubai must not default to yesterday's UTC date. */
function todayInDubai(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date())
}

/** The deferred work behind /legal. Runs in after(). */
async function deliverLegalAnswer(ctx: SlashContext): Promise<void> {
  const [subcommand = "", ...rest] = ctx.text.trim().split(/\s+/)

  switch (subcommand.toLowerCase()) {
    case "":
    case "status": {
      const summary = await legalStatusSummary()
      await respondVia(ctx.responseUrl, "Legal status", buildLegalStatusBlocks(summary))
      return
    }
    case "signatures": {
      const inFlight = await signaturesInFlight()
      await respondVia(ctx.responseUrl, "Signatures in flight", buildSignaturesBlocks(inFlight))
      return
    }
    case "find": {
      const query = rest.join(" ").trim()
      if (!query) {
        await respondVia(ctx.responseUrl, "Usage: /legal find <title or counterparty>")
        return
      }
      const hits = await agreementLookup(query)
      await respondVia(
        ctx.responseUrl,
        `Agreements matching "${query}"`,
        buildAgreementLookupBlocks(query, hits)
      )
      return
    }
    default:
      await respondVia(ctx.responseUrl, "/legal help", buildLegalHelpBlocks())
  }
}

/** The deferred work behind /mnda: authorise, then open the modal. */
async function deliverMndaModal(
  ctx: SlashContext,
  actor: { userId: string; email: string; display: string }
): Promise<void> {
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
        await deliverLegalAnswer(ctx)
      } else {
        await deliverMndaModal(ctx, actor)
      }
    } catch (error) {
      console.error("[slack] deferred command handling failed:", error)
      await respondVia(
        ctx.responseUrl,
        "Something went wrong handling that command. The details are in the dashboard logs."
      )
    }
  })

  return ack(ctx.command === "/mnda" ? "Opening the MNDA form..." : "On it...")
}
