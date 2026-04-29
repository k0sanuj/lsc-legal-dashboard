/**
 * Local smoke test for the Finance webhook integration.
 * Run with: `npx tsx scripts/test-finance-webhook.ts`
 */
import { config as loadEnv } from "dotenv"
// Load env BEFORE importing prisma — Prisma reads DATABASE_URL at module init
loadEnv({ path: ".env" })
loadEnv({ path: ".env.local", override: true })

async function main() {
  // Dynamic imports run after env is loaded
  const { prisma } = await import("@/lib/prisma")
  const { emitFinanceEvent } = await import("@/lib/finance-webhook")

  console.log("\n=== Finance webhook integration smoke test ===\n")
  console.log("Env:")
  console.log("  FINANCE_WEBHOOK_URL set:", !!process.env.FINANCE_WEBHOOK_URL)
  console.log("  FINANCE_WEBHOOK_KEY set:", !!process.env.FINANCE_WEBHOOK_KEY)
  console.log("  FINANCE_WEBHOOK_SECRET set:", !!process.env.FINANCE_WEBHOOK_SECRET)

  console.log("\n[1/3] Emitting tranche.created event...")
  const result = await emitFinanceEvent(
    "tranche.created",
    {
      legalExternalId: "test-tranche-" + Date.now(),
      companyCode: "FSP",
      contractName: "TEST Sponsorship 2026",
      trancheNumber: 1,
      trancheLabel: "Smoke test",
      tranchePercentage: 25,
      trancheAmount: 50000,
      triggerType: "on_signing",
      triggerDate: null,
      triggerOffsetDays: 0,
      sport: null,
      notes: "Created by scripts/test-finance-webhook.ts",
    },
    { entityType: "PaymentCycle", entityId: "synthetic-test-id" }
  )
  console.log("  result.ok:", result.ok)
  console.log("  result.eventId:", result.eventId)
  console.log("  result.error:", result.error ?? "(none)")

  console.log("\n[2/3] Reading back CrossModuleEvent row...")
  const row = await prisma.crossModuleEvent.findUnique({ where: { id: result.eventId } })
  if (!row) { console.error("  ❌ Row not found!"); process.exit(1) }
  console.log("  ✓ id:", row.id)
  console.log("  ✓ source:", row.source)
  console.log("  ✓ event_type:", row.event_type)
  console.log("  ✓ entity_type:", row.entity_type)
  console.log("  ✓ processed:", row.processed)
  const lastAttempt = (row.payload as Record<string, unknown>)?._last_attempt as
    | { count?: number; status?: number; error?: string | null } | undefined
  console.log("  ✓ last_attempt:", lastAttempt)

  console.log("\n[3/3] Validation:")
  if (!process.env.FINANCE_WEBHOOK_URL) {
    console.log(row.processed ? "  ❌ unexpected processed=true" : "  ✓ processed=false (no creds)")
  } else if (row.processed) {
    console.log("  ✅ Webhook configured AND post succeeded — Finance accepted the event")
  } else {
    console.log("  ⚠ Webhook configured but post failed:", lastAttempt?.error)
  }

  console.log("\n=== Test complete ===\n")
  await prisma.$disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })
