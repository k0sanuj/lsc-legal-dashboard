import { NextRequest } from "next/server"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendMnda, type MndaSendParams } from "@/lib/mnda"
import { postSlackEphemeral, resolveSlackActor, verifySlackSignature, slackSession, type SlackActor } from "@/lib/slack"
import { buildMndaFailureBlocks, buildMndaSuccessBlocks, type MndaOutcomeInput } from "@/lib/slack-blocks"

import { requireGlobalDocumentAccess } from "@/lib/document-access"
import { Prisma } from "@/generated/prisma/client"

export const runtime = "nodejs"

/**
 * Slack interactivity: view_submission for the /mnda modal (callback_id
 * "mnda_send").
 *
 * A view_submission carries NO response_url and NO channel, so the outcome is
 * reported privately with chat.postEphemeral to the channel id stashed in the modal's
 * private_metadata at open time, falling back to SLACK_LEGAL_CHANNEL_ID.
 *
 * Slack expects a response within 3 seconds: field problems come back as
 * response_action "errors", a valid submit gets an empty 200 immediately
 * (which closes the modal) and the actual send runs inside after().
 *
 * The submission is RE-authorised here independently of the slash command;
 * private_metadata is display context only, never an authority.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
interface SlackStateValue {
  value?: string | null
  selected_option?: { value?: string } | null
  selected_date?: string | null
}

interface SlackViewSubmissionPayload {
  type?: string
  user?: { id?: string }
  view?: {
    id?: string
    callback_id?: string
    private_metadata?: string
    state?: { values?: Record<string, Record<string, SlackStateValue>> }
  }
}

interface ModalMetadata {
  channelId?: string
}

/** Every input block uses its block_id as its action_id, so one lookup fits all element types. */
function readField(values: Record<string, Record<string, SlackStateValue>>, blockId: string): string {
  const entry = values[blockId]?.[blockId]
  const raw = entry?.value ?? entry?.selected_option?.value ?? entry?.selected_date ?? ""
  return raw.trim()
}

function parseCcEmails(raw: string): { emails: string[]; invalid: string[] } {
  const parts = raw.split(/[,;\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean)
  const emails = Array.from(new Set(parts))
  return { emails, invalid: emails.filter((email) => !EMAIL_PATTERN.test(email)) }
}

interface ParsedSubmission {
  params: MndaSendParams
  errors: Record<string, string>
}

function parseSubmission(values: Record<string, Record<string, SlackStateValue>>): ParsedSubmission {
  const errors: Record<string, string> = {}

  const templateRaw = readField(values, "template")
  const templateKind: MndaSendParams["templateKind"] = templateRaw === "business" ? "business" : "individual"
  if (templateRaw !== "individual" && templateRaw !== "business") {
    errors.template = "Pick the individual or business template."
  }

  const counterpartyName = readField(values, "signer_name")
  if (!counterpartyName) errors.signer_name = "Signer name is required."

  const counterpartyEmail = readField(values, "signer_email").toLowerCase()
  if (!EMAIL_PATTERN.test(counterpartyEmail)) errors.signer_email = "Enter a valid email address."

  // The business template needs the company block; the individual template
  // ignores company and address entirely rather than erroring on them.
  const company = readField(values, "company")
  const address = readField(values, "address")
  if (templateKind === "business") {
    if (!company) errors.company = "The business template needs the counterparty company."
    if (!address) errors.address = "The business template needs the counterparty address."
  }

  const passport = readField(values, "passport")

  const cc = parseCcEmails(readField(values, "cc"))
  if (cc.invalid.length > 0) {
    errors.cc = `Not valid email addresses: ${cc.invalid.join(", ")}`
  }

  const termNumber = Number(readField(values, "term"))
  const termYears: MndaSendParams["termYears"] =
    termNumber === 1 || termNumber === 3 || termNumber === 5 ? termNumber : 2
  if (![1, 2, 3, 5].includes(termNumber)) errors.term = "Pick a term."

  const effectiveDate = readField(values, "effective_date")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) errors.effective_date = "Pick the agreement date."

  return {
    errors,
    params: {
      templateKind,
      counterpartyName,
      counterpartyEmail,
      ...(templateKind === "business" ? { counterpartyCompany: company, counterpartyAddress: address } : {}),
      ...(templateKind === "individual" && passport ? { passportNumber: passport } : {}),
      ccEmails: cc.emails,
      termYears,
      effectiveDate,
    },
  }
}

function parseMetadata(raw: string): ModalMetadata {
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === "object" ? (parsed as ModalMetadata) : {}
  } catch {
    return {}
  }
}

/** Runs inside after(): performs the send and reports the outcome to Slack. Only ever console.errors. */
async function sendAndReport(
  params: MndaSendParams,
  actor: SlackActor,
  channelId: string,
  slackUserId: string
) {
  try {
    const outcome: MndaOutcomeInput = {
      templateKind: params.templateKind,
      counterpartyName: params.counterpartyName,
      counterpartyEmail: params.counterpartyEmail,
      counterpartyCompany: params.counterpartyCompany,
      termYears: params.termYears,
      effectiveDate: params.effectiveDate,
      ccEmails: params.ccEmails,
      sentBy: actor.display,
    }

    const current = await requireGlobalDocumentAccess(slackSession(actor))
    if (!["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"].includes(current.role)) throw new Error("MNDA editing access is required")
    const result = await sendMnda(params, actor)
    if (!result.success && !result.safe) {
      console.error("[slack] MNDA send failed with internal error:", result.error)
    }
    const channelError = result.success
      ? ""
      : result.safe
        ? result.error
        : "MNDA sending could not be confirmed. Check the document and signing provider before retrying."
    const blocks = result.success
      ? buildMndaSuccessBlocks(outcome, result.documentId)
      : buildMndaFailureBlocks(outcome, channelError)
    const text = result.success
      ? `MNDA sent to ${params.counterpartyEmail}`
      : `MNDA send to ${params.counterpartyEmail} failed`

    const channel = channelId || process.env.SLACK_LEGAL_CHANNEL_ID?.trim() || ""
    if (!channel) {
      console.error("[slack] no channel to report the MNDA outcome to; result:", text)
      return { sent: result.success, delivered: false }
    }

    const posted = await postSlackEphemeral(channel, slackUserId, blocks, text)
    if (!posted.ok) console.error("[slack] private outcome delivery failed")
    return { sent: result.success, delivered: posted.ok }
  } catch (error) {
    console.error("[slack] MNDA send from Slack failed:", error instanceof Error ? error.name : "UnknownError")
    return { sent: null, delivered: false }
  }
}

export async function POST(request: NextRequest) {
  // Raw body FIRST; the signature covers the exact bytes Slack sent.
  const rawBody = await request.text()
  const verification = verifySlackSignature({
    timestamp: request.headers.get("x-slack-request-timestamp") ?? "",
    signature: request.headers.get("x-slack-signature") ?? "",
    rawBody,
  })
  if (!verification.valid) {
    console.error("[slack] interactivity signature rejected:", verification.reason)
    return new Response(null, { status: 401 })
  }

  let payload: SlackViewSubmissionPayload
  try {
    payload = JSON.parse(new URLSearchParams(rawBody).get("payload") ?? "") as SlackViewSubmissionPayload
  } catch {
    return new Response(null, { status: 400 })
  }

  // Only the MNDA modal submit is handled; everything else is acknowledged so
  // Slack does not show the caller a red error for stray interactions.
  if (payload.type !== "view_submission" || payload.view?.callback_id !== "mnda_send") {
    return new Response(null, { status: 200 })
  }

  const viewId = payload.view?.id ?? ""
  if (!viewId) return new Response(null, { status: 400 })
  try {
    // Re-authorise independently: this is a fresh inbound request and the
    // modal's private_metadata proves nothing about who pressed submit.
    const actor = await resolveSlackActor(payload.user?.id ?? "")
    if (!actor) {
      return Response.json({
        response_action: "errors",
        errors: { template: "You are not authorised to send MNDAs." },
      })
    }

    const { params, errors } = parseSubmission(payload.view?.state?.values ?? {})
    if (Object.keys(errors).length > 0) {
      return Response.json({ response_action: "errors", errors })
    }

    const current = await requireGlobalDocumentAccess(slackSession(actor))
    if (!["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"].includes(current.role)) throw new Error("MNDA editing access is required")
    const claim = await prisma.webhookEventLog.create({ data: { provider: 'slack', event_hash: `slack-view-${viewId}`, event_type: 'mnda_send_submission', processing_status: 'processing', raw_payload: { actorId: actor.userId } } }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null
      throw error
    })
    if (!claim) return new Response(null, { status: 200 })
    const metadata = parseMetadata(payload.view?.private_metadata ?? "")

    // Empty 200 closes the modal; the send itself must not eat into Slack's
    // 3 second budget.
    after(async () => {
      const outcome = await sendAndReport(params, actor, metadata.channelId ?? "", payload.user?.id ?? "")
      await prisma.webhookEventLog.update({ where: { id: claim.id }, data: { processing_status: outcome.sent === null ? "uncertain" : outcome.sent ? "processed" : "failed", processed_at: new Date(), raw_payload: { actorId: actor.userId, sent: outcome.sent, delivered: outcome.delivered } } })
    })

    return new Response(null, { status: 200 })
  } catch (error) {
    console.error("[slack] interactivity handling failed:", error)
    return Response.json({
      response_action: "errors",
      errors: { template: "Something went wrong. Try again." },
    })
  }
}
