import { NextRequest } from "next/server"
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
 * SLACK_LEGAL_ADMINS allowlist via resolveSlackActor. A bad signature gets a
 * bare 401 because the request is not provably from Slack; an unauthorised but
 * genuine caller gets a 200 with an ephemeral refusal so the human learns why.
 *
 * Slack expects an answer within 3 seconds. /legal answers inline with
 * ephemeral blocks; /mnda only opens a modal (the trigger_id dies in 3s, so
 * views.open runs before anything slow) and the actual send happens on
 * view_submission in ../interactivity/route.ts.
 */

/** Inline ephemeral answer to the slash command; only the caller sees it. */
function ephemeral(text: string, blocks?: SlackBlock[]): Response {
  return Response.json({ response_type: "ephemeral", text, ...(blocks ? { blocks } : {}) })
}

function notAuthorised(): Response {
  return ephemeral("You are not authorised to use the LSC Legal commands.")
}

/** Today in Asia/Dubai as YYYY-MM-DD; en-CA formats ISO dates. A 02:00 send in Dubai must not default to yesterday's UTC date. */
function todayInDubai(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date())
}

async function handleLegalCommand(text: string): Promise<Response> {
  const [subcommand = "", ...rest] = text.trim().split(/\s+/)

  switch (subcommand.toLowerCase()) {
    case "":
    case "status": {
      const summary = await legalStatusSummary()
      return ephemeral("Legal status", buildLegalStatusBlocks(summary))
    }
    case "signatures": {
      const inFlight = await signaturesInFlight()
      return ephemeral("Signatures in flight", buildSignaturesBlocks(inFlight))
    }
    case "find": {
      const query = rest.join(" ").trim()
      if (!query) return ephemeral("Usage: /legal find <title or counterparty>")
      const hits = await agreementLookup(query)
      return ephemeral(`Agreements matching "${query}"`, buildAgreementLookupBlocks(query, hits))
    }
    default:
      return ephemeral("/legal help", buildLegalHelpBlocks())
  }
}

async function handleMndaCommand(input: {
  triggerId: string
  channelId: string
  actor: { userId: string; email: string; display: string }
}): Promise<Response> {
  const view = buildMndaModalView({
    todayDubai: todayInDubai(),
    privateMetadata: JSON.stringify({
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      actorDisplay: input.actor.display,
      channelId: input.channelId,
    }),
  })

  const opened = await openSlackModal(input.triggerId, view)
  if (!opened.ok) {
    console.error("[slack] views.open failed:", opened.error)
    return ephemeral("Could not open the MNDA form. Try /mnda again.")
  }

  return new Response(null, { status: 200 })
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
  const command = params.get("command") ?? ""
  const text = params.get("text") ?? ""
  const slackUserId = params.get("user_id") ?? ""
  const channelId = params.get("channel_id") ?? ""
  const triggerId = params.get("trigger_id") ?? ""

  try {
    const actor = await resolveSlackActor(slackUserId)
    if (!actor) return notAuthorised()

    if (command === "/legal") return await handleLegalCommand(text)
    if (command === "/mnda") return await handleMndaCommand({ triggerId, channelId, actor })

    return ephemeral(`Unknown command ${command}.`)
  } catch (error) {
    console.error("[slack] command handling failed:", error)
    return ephemeral("Something went wrong handling that command. Check the dashboard logs.")
  }
}
