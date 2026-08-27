import { readFileSync, existsSync } from "node:fs"
import { Client } from "pg"
import { config } from "dotenv"

config({ path: ".env" })
config({ path: ".env.local", override: true })

const allowedAgents = [
  "agreement-analyzer",
  "pre-signature-checklist",
  "activation",
  "email-inbox.invoice-detection",
  "compliance",
  "compliance-audit",
]

const retiredAgentIds = [
  "orchestrator",
  "compliance.jurisdiction",
  "compliance.data-protection",
  "compliance.renewal-tracker",
  "agreement-analyzer.categorization",
  "agreement-analyzer.clause-extraction",
  "agreement-analyzer.clickwrap-tracker",
  "kyc",
  "kyc.admin-accounts",
  "kyc.vendor-verification",
  "litigation",
  "litigation.case-tracker",
  "litigation.finance-liaison",
  "email-inbox",
  "email-inbox.notice-detection",
  "email-inbox.deadline-extraction",
  "compliance-audit.entity-scanner",
  "compliance-audit.office-tracker",
  "compliance-audit.email-checker",
  "data-compliance-officer",
  "data-compliance-officer.gdpr",
  "data-compliance-officer.jurisdiction-policy",
  "data-compliance-officer.officer-assignment",
]

const errors = []

const typesFile = readFileSync("src/lib/agents/types.ts", "utf8")
for (const agentId of allowedAgents) {
  if (!typesFile.includes(`'${agentId}'`)) {
    errors.push(`Runnable agent missing from AgentId: ${agentId}`)
  }
}

for (const retiredId of retiredAgentIds) {
  if (typesFile.includes(`'${retiredId}'`)) {
    errors.push(`Retired conceptual agent still present in AgentId: ${retiredId}`)
  }
}

const architectureFile = readFileSync("src/app/legal/agent-architecture/agent-architecture-view.tsx", "utf8")
for (const retiredId of retiredAgentIds) {
  if (architectureFile.includes(`id: '${retiredId}'`) || architectureFile.includes(`to: '${retiredId}'`)) {
    errors.push(`Retired conceptual agent still shown as executable in architecture UI: ${retiredId}`)
  }
}

const financeRoute = readFileSync("src/app/api/cron/finance-resync/route.ts", "utf8")
if (!financeRoute.includes('"invoice_detected"')) {
  errors.push("Finance resync does not retry invoice_detected events")
}

const aiProvider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase()
if (aiProvider !== "gemini") {
  errors.push(`AI_PROVIDER should be gemini for this rollout, got ${aiProvider}`)
}
if (!process.env.GEMINI_API_KEY) {
  errors.push("GEMINI_API_KEY is required for Gemini-first agent execution")
}

if (process.env.OPENSIGN_SIGNING_ENABLED === "1") {
  for (const name of ["OPENSIGN_BASE_URL", "OPENSIGN_APP_ID", "OPENSIGN_MASTER_KEY", "OPENSIGN_USER_EMAIL"]) {
    if (!process.env[name]) errors.push(`${name} is required when OPENSIGN_SIGNING_ENABLED=1`)
  }
}

if (process.env.LEGAL_TRACKER_NOTIFY_ENABLED === "1") {
  const trackerProvider = (process.env.LEGAL_TRACKER_CHANNEL_PROVIDER ?? "").toLowerCase()
  const trackerEnv = ["LEGAL_TRACKER_CHANNEL_PROVIDER"]
  if (trackerProvider === "slack") {
    trackerEnv.push("LEGAL_TRACKER_MENTION")
    if (process.env.LEGAL_TRACKER_WEBHOOK_URL) {
      trackerEnv.push("LEGAL_TRACKER_WEBHOOK_URL")
    } else {
      trackerEnv.push("LEGAL_TRACKER_SLACK_BOT_TOKEN", "LEGAL_TRACKER_SLACK_CHANNEL")
    }
  } else if (trackerProvider === "google_chat") {
    trackerEnv.push("LEGAL_TRACKER_WEBHOOK_URL", "LEGAL_TRACKER_MENTION")
  } else if (trackerProvider === "mailgun") {
    trackerEnv.push("MAILGUN_DOMAIN", "MAILGUN_API_KEY", "MAILGUN_SENDER", "LEGAL_TRACKER_EMAIL_TO")
  } else {
    errors.push("LEGAL_TRACKER_CHANNEL_PROVIDER must be slack, google_chat, or mailgun when LEGAL_TRACKER_NOTIFY_ENABLED=1")
  }
  for (const name of trackerEnv) {
    if (!process.env[name]) errors.push(`${name} is required when LEGAL_TRACKER_NOTIFY_ENABLED=1`)
  }
}

if (process.env.MAGIC_LINK_LOGIN_ENABLED === "1") {
  for (const name of ["MAILGUN_DOMAIN", "MAILGUN_API_KEY", "MAILGUN_SENDER", "AUTH_ALLOWED_EMAILS", "AUTH_APP_URL", "MAILGUN_WEBHOOK_SIGNING_KEY"]) {
    if (!process.env[name]) errors.push(`${name} is required when MAGIC_LINK_LOGIN_ENABLED=1`)
  }
}

// Schema reaches production by hand-running the ops/sql patches, so this is the
// only thing standing between a deploy and code that queries columns the live
// database does not have. Every table and column a patch adds belongs here.
// AuthMagicLinkToken is included because login itself now depends on it.
const REQUIRED_TABLES = [
  "DocumentAnalysis",
  "WebhookEventLog",
  "CrossModuleEvent",
  "AgentActivityLog",
  "Redline",
  "RedlineChange",
  "RedlineEvent",
  "AuthMagicLinkToken",
]

const REQUIRED_COLUMNS = [
  ["LegalDocument", "last_tracker_notified_at"],
  ["LegalDocument", "tracker_notify_status"],
  ["LegalDocument", "last_tracker_notify_error"],
]

if (process.env.DATABASE_URL) {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    const result = await client.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)`,
      [REQUIRED_TABLES]
    )
    const found = new Set(result.rows.map((row) => row.table_name))
    for (const table of REQUIRED_TABLES) {
      if (!found.has(table)) errors.push(`Runtime database is missing required table: ${table}`)
    }

    const columnResult = await client.query(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and table_name = any($1)`,
      [[...new Set(REQUIRED_COLUMNS.map(([table]) => table))]]
    )
    const foundColumns = new Set(
      columnResult.rows.map((row) => `${row.table_name}.${row.column_name}`)
    )
    for (const [table, column] of REQUIRED_COLUMNS) {
      if (!foundColumns.has(`${table}.${column}`)) {
        errors.push(`Runtime database is missing required column: ${table}.${column}`)
      }
    }
  } catch (error) {
    errors.push(`Could not verify runtime database agent tables: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await client.end().catch(() => {})
  }
} else if (existsSync(".env.local") || existsSync(".env")) {
  errors.push("DATABASE_URL is required to verify runtime agent tables")
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"))
  process.exit(1)
}

console.log("Agent hygiene check passed")
