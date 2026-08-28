/**
 * Block Kit renderers for the Slack control surface.
 *
 * Render-only: no Prisma and no network. The single env touch is the app
 * origin via getAppBaseUrl(), used to build dashboard deep links. Data shapes
 * come from src/lib/slack-legal-queries.ts as type-only imports, and the
 * truncation caps mirror the limits Slack enforces (and the constants already
 * used in src/lib/legal-tracker.ts).
 */
import { getAppBaseUrl } from "@/lib/app-url"
import type { AgreementHit, LegalStatusSummary, SignatureInFlight } from "@/lib/slack-legal-queries"

const HEADER_CHARS = 150
const SECTION_CHARS = 2900

export type SlackBlock = Record<string, unknown>

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

function headerBlock(text: string): SlackBlock {
  return { type: "header", text: { type: "plain_text", text: truncate(text, HEADER_CHARS) } }
}

function sectionBlock(markdown: string): SlackBlock {
  return { type: "section", text: { type: "mrkdwn", text: truncate(markdown, SECTION_CHARS) } }
}

function dashboardContextBlock(path: string, label: string): SlackBlock {
  return {
    type: "context",
    elements: [{ type: "mrkdwn", text: `<${getAppBaseUrl()}${path}|${label}>` }],
  }
}

function documentLink(linkPath: string, title: string): string {
  return `<${getAppBaseUrl()}${linkPath}|${title}>`
}

function statusLine(rows: { status: string; count: number }[], emptyText: string): string {
  if (rows.length === 0) return emptyText
  return rows.map((row) => `${row.status.replaceAll("_", " ")}: *${row.count}*`).join(" · ")
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function buildLegalStatusBlocks(summary: LegalStatusSummary): SlackBlock[] {
  const recent =
    summary.recentSends.length === 0
      ? "No agreements sent yet."
      : summary.recentSends
          .map(
            (send) =>
              `${documentLink(send.linkPath, send.title)}` +
              `${send.counterparty ? ` · ${send.counterparty}` : ""} · sent ${formatDate(send.sentAt)}`
          )
          .join("\n")

  return [
    headerBlock("Legal status"),
    sectionBlock(`*Agreements*\n${statusLine(summary.documentsByStatus, "No documents on file.")}`),
    sectionBlock(`*Open signatures*\n${statusLine(summary.openSignaturesByStatus, "Nothing awaiting signature.")}`),
    sectionBlock(`*Open redlines*\n${statusLine(summary.openRedlinesByStatus, "No open redlines.")}`),
    sectionBlock(
      `*Compliance due in 30 days:* ${summary.complianceDueSoon}` +
        ` · *Tracker blocked:* ${summary.trackerBlocked}` +
        ` · *Tracker in progress:* ${summary.trackerInProgress}`
    ),
    sectionBlock(`*Last agreements sent*\n${recent}`),
    dashboardContextBlock("/legal", "Open the LSC Legal dashboard"),
  ]
}

export function buildAgreementLookupBlocks(query: string, hits: AgreementHit[]): SlackBlock[] {
  if (hits.length === 0) {
    return [
      sectionBlock(`No agreements match *${query}*.`),
      dashboardContextBlock("/legal/documents", "Browse all documents"),
    ]
  }

  const blocks: SlackBlock[] = [headerBlock(`Agreements matching "${query}"`)]
  for (const hit of hits) {
    const signers =
      hit.signers.length === 0
        ? "no signers recorded"
        : hit.signers.map((signer) => `${signer.name} (${signer.status})`).join(", ")
    blocks.push(
      sectionBlock(
        `${documentLink(hit.linkPath, hit.title)}` +
          `${hit.counterparty ? ` · ${hit.counterparty}` : ""}\n` +
          `Status: *${hit.status.replaceAll("_", " ")}* · Signers: ${signers}`
      )
    )
  }
  blocks.push(dashboardContextBlock("/legal/documents", "Open documents in LSC Legal"))
  return blocks
}

export function buildSignaturesBlocks(inFlight: SignatureInFlight[]): SlackBlock[] {
  if (inFlight.length === 0) {
    return [
      sectionBlock("Nothing is awaiting signature."),
      dashboardContextBlock("/legal/signatures", "Open signatures in LSC Legal"),
    ]
  }

  const blocks: SlackBlock[] = [headerBlock("Signatures in flight")]
  for (const doc of inFlight) {
    const signers =
      doc.signers.length === 0
        ? "no signers recorded"
        : doc.signers
            .map((signer) => {
              const state = signer.signed ? "signed" : signer.viewed ? "viewed" : "not viewed"
              return `${signer.name}: ${state}`
            })
            .join(" · ")
    const pending = doc.daysPending === null ? "not yet sent" : `${doc.daysPending}d pending`
    blocks.push(
      sectionBlock(
        `${documentLink(doc.linkPath, doc.title)}` +
          `${doc.counterparty ? ` · ${doc.counterparty}` : ""} · ${pending}\n${signers}`
      )
    )
  }
  blocks.push(dashboardContextBlock("/legal/signatures", "Open signatures in LSC Legal"))
  return blocks
}

export function buildLegalHelpBlocks(): SlackBlock[] {
  return [
    sectionBlock(
      "*`/legal` commands*\n" +
        "`/legal status` · counts across agreements, signatures, redlines, compliance, tracker\n" +
        "`/legal signatures` · documents awaiting signature with per-signer state\n" +
        "`/legal find <query>` · look up agreements by title or counterparty\n" +
        "`/mnda` · send an MNDA for signature (authorised admins only)"
    ),
    dashboardContextBlock("/legal", "Open the LSC Legal dashboard"),
  ]
}

/** Inputs the modal builder needs; today is computed by the caller in Asia/Dubai. */
export interface MndaModalInput {
  todayDubai: string
  privateMetadata: string
}

function plainText(text: string): Record<string, unknown> {
  return { type: "plain_text", text }
}

function textInputBlock(
  blockId: string,
  label: string,
  options: { optional?: boolean; hint?: string; multiline?: boolean; email?: boolean } = {}
): SlackBlock {
  return {
    type: "input",
    block_id: blockId,
    optional: options.optional ?? false,
    label: plainText(label),
    ...(options.hint ? { hint: plainText(options.hint) } : {}),
    element: {
      type: options.email ? "email_text_input" : "plain_text_input",
      action_id: blockId,
      ...(options.multiline ? { multiline: true } : {}),
    },
  }
}

export function buildMndaModalView(input: MndaModalInput): Record<string, unknown> {
  return {
    type: "modal",
    callback_id: "mnda_send",
    private_metadata: input.privateMetadata,
    title: plainText("Send an MNDA"),
    submit: plainText("Send MNDA"),
    close: plainText("Cancel"),
    blocks: [
      {
        type: "input",
        block_id: "template",
        label: plainText("Template"),
        element: {
          type: "static_select",
          action_id: "template",
          options: [
            { text: plainText("Individual"), value: "individual" },
            { text: plainText("Business"), value: "business" },
          ],
        },
      },
      textInputBlock("company", "Counterparty company", { optional: true, hint: "Business template only." }),
      textInputBlock("address", "Counterparty address", {
        optional: true,
        multiline: true,
        hint: "Business template only.",
      }),
      textInputBlock("signer_name", "Signer name", {}),
      textInputBlock("signer_email", "Signer email", { email: true }),
      textInputBlock("passport", "Passport number", {
        optional: true,
        hint: "Individual only; leave blank to let the signer fill it in.",
      }),
      textInputBlock("cc", "CC emails", {
        optional: true,
        hint: "Comma, semicolon, or space separated. They receive the completed document.",
      }),
      {
        type: "input",
        block_id: "term",
        label: plainText("Term"),
        element: {
          type: "static_select",
          action_id: "term",
          initial_option: { text: plainText("2 years"), value: "2" },
          options: [
            { text: plainText("1 year"), value: "1" },
            { text: plainText("2 years"), value: "2" },
            { text: plainText("3 years"), value: "3" },
            { text: plainText("5 years"), value: "5" },
          ],
        },
      },
      {
        type: "input",
        block_id: "effective_date",
        label: plainText("Agreement date"),
        element: {
          type: "datepicker",
          action_id: "effective_date",
          initial_date: input.todayDubai,
        },
      },
    ],
  }
}

export interface MndaOutcomeInput {
  templateKind: "individual" | "business"
  counterpartyName: string
  counterpartyEmail: string
  counterpartyCompany?: string
  termYears: number
  effectiveDate: string
  ccEmails: string[]
  sentBy: string
}

export function buildMndaSuccessBlocks(input: MndaOutcomeInput, documentId: string): SlackBlock[] {
  const counterparty = input.counterpartyCompany
    ? `${input.counterpartyName}, ${input.counterpartyCompany}`
    : input.counterpartyName
  const cc = input.ccEmails.length > 0 ? input.ccEmails.join(", ") : "none"

  return [
    headerBlock("MNDA sent for signature"),
    sectionBlock(
      `*Counterparty:* ${counterparty}\n` +
        `*Template:* ${input.templateKind}\n` +
        `*Term:* ${input.termYears} year${input.termYears === 1 ? "" : "s"}\n` +
        `*Effective date:* ${input.effectiveDate}\n` +
        `*CC:* ${cc}\n` +
        `*Sent by:* ${input.sentBy}`
    ),
    sectionBlock(`Signature invitation emailed to *${input.counterpartyEmail}*.`),
    dashboardContextBlock(`/legal/documents/${documentId}`, "Open the document in LSC Legal"),
  ]
}

export function buildMndaFailureBlocks(input: MndaOutcomeInput, error: string): SlackBlock[] {
  return [
    headerBlock("MNDA send failed"),
    sectionBlock(
      `Sending the ${input.templateKind} MNDA to *${input.counterpartyEmail}* failed:\n${error}`
    ),
    sectionBlock("Nothing was sent to the counterparty. Fix the issue and run `/mnda` again."),
    dashboardContextBlock("/legal/documents", "Open documents in LSC Legal"),
  ]
}
