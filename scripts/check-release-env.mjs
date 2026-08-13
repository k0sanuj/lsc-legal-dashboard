import { existsSync } from "node:fs"
import { config } from "dotenv"

config({ path: ".env" })
config({ path: ".env.local", override: true })

const strict = process.argv.includes("--strict") || process.env.RELEASE_GATE_STRICT_ENV === "1"

const requiredEnv = [
  "AUTH_SESSION_SECRET",
  "AUTH_ALLOWED_EMAILS",
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "CRON_SECRET",
  "AI_PROVIDER",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "S3_BUCKET_NAME",
  "GMAIL_WEBHOOK_SECRET",
  "GMAIL_WATCH_MAILBOXES",
  "FINANCE_WEBHOOK_URL",
  "FINANCE_WEBHOOK_KEY",
  "FINANCE_WEBHOOK_SECRET",
]

if (process.env.OPENSIGN_SIGNING_ENABLED === "1") {
  requiredEnv.push(
    "OPENSIGN_BASE_URL",
    "OPENSIGN_API_TOKEN",
    "OPENSIGN_WEBHOOK_SECRET",
    "OPENSIGN_WEBHOOK_URL"
  )
}

if (process.env.LEGAL_TRACKER_NOTIFY_ENABLED === "1") {
  const trackerProvider = (process.env.LEGAL_TRACKER_CHANNEL_PROVIDER ?? "").toLowerCase()
  requiredEnv.push("LEGAL_TRACKER_CHANNEL_PROVIDER")
  if (trackerProvider === "slack") {
    requiredEnv.push("LEGAL_TRACKER_MENTION")
    if (process.env.LEGAL_TRACKER_WEBHOOK_URL) {
      requiredEnv.push("LEGAL_TRACKER_WEBHOOK_URL")
    } else {
      requiredEnv.push("LEGAL_TRACKER_SLACK_BOT_TOKEN", "LEGAL_TRACKER_SLACK_CHANNEL")
    }
  } else if (trackerProvider === "google_chat") {
    requiredEnv.push("LEGAL_TRACKER_WEBHOOK_URL", "LEGAL_TRACKER_MENTION")
  } else if (trackerProvider === "mailgun") {
    requiredEnv.push("MAILGUN_DOMAIN", "MAILGUN_API_KEY", "MAILGUN_SENDER", "LEGAL_TRACKER_EMAIL_TO")
  }
}

if (process.env.MAGIC_LINK_LOGIN_ENABLED === "1") {
  requiredEnv.push(
    "MAILGUN_DOMAIN",
    "MAILGUN_API_KEY",
    "MAILGUN_SENDER",
    "AUTH_ALLOWED_EMAILS",
    // Server-side, so it can be changed without a rebuild. A NEXT_PUBLIC_ value
    // would be frozen into the bundle at build time.
    "AUTH_APP_URL"
  )
}

const requiredRoutes = [
  "src/app/api/webhooks/gmail/route.ts",
  "src/app/api/webhooks/opensign/route.ts",
  "src/app/api/auth/logout/route.ts",
  "src/app/api/auth/magic/route.ts",
  "src/app/api/cron/finance-resync/route.ts",
  "src/app/api/cron/compliance-scan/route.ts",
]

const missingEnv = Array.from(new Set(requiredEnv)).filter((name) => !process.env[name])
const missingRoutes = requiredRoutes.filter((path) => !existsSync(path))

if (missingEnv.length > 0) {
  console.warn(`Missing env vars: ${missingEnv.join(", ")}`)
}

if (missingRoutes.length > 0) {
  console.error(`Missing required routes: ${missingRoutes.join(", ")}`)
}

if (missingRoutes.length > 0 || (strict && missingEnv.length > 0)) {
  process.exit(1)
}

console.log("Release env/route check completed")
