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
  for (const name of ["OPENSIGN_BASE_URL", "OPENSIGN_API_TOKEN", "OPENSIGN_WEBHOOK_SECRET", "OPENSIGN_WEBHOOK_URL"]) {
    if (!process.env[name]) errors.push(`${name} is required when OPENSIGN_SIGNING_ENABLED=1`)
  }
}

if (process.env.DATABASE_URL) {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    const result = await client.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)`,
      [["DocumentAnalysis", "WebhookEventLog", "CrossModuleEvent", "AgentActivityLog"]]
    )
    const found = new Set(result.rows.map((row) => row.table_name))
    for (const table of ["DocumentAnalysis", "WebhookEventLog", "CrossModuleEvent", "AgentActivityLog"]) {
      if (!found.has(table)) errors.push(`Runtime database is missing required table: ${table}`)
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
