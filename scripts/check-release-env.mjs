import { existsSync } from "node:fs"
import { config } from "dotenv"

config({ path: ".env" })
config({ path: ".env.local", override: true })

const strict = process.argv.includes("--strict") || process.env.RELEASE_GATE_STRICT_ENV === "1"

const requiredEnv = [
  "AUTH_SESSION_SECRET",
  "AUTH_ALLOWED_EMAILS",
  "AUTH_APP_URL",
  "AUTH_EMAIL_FROM",
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
  "RESEND_API_KEY",
]

if (process.env.OPENSIGN_SIGNING_ENABLED === "1") {
  requiredEnv.push(
    "OPENSIGN_BASE_URL",
    "OPENSIGN_API_TOKEN",
    "OPENSIGN_WEBHOOK_SECRET",
    "OPENSIGN_WEBHOOK_URL"
  )
}

const requiredRoutes = [
  "src/app/api/webhooks/gmail/route.ts",
  "src/app/api/webhooks/opensign/route.ts",
  "src/app/api/auth/magic/route.ts",
  "src/app/api/auth/logout/route.ts",
  "src/app/api/cron/finance-resync/route.ts",
  "src/app/api/cron/compliance-scan/route.ts",
]

const missingEnv = requiredEnv.filter((name) => !process.env[name])
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
