/**
 * Local smoke test for the Finance webhook integration (v2 — 6 event types).
 * Run with: `npx tsx scripts/test-finance-webhook.ts`
 *
 * Tests the contract.created → tranche.created flow end-to-end against the
 * live Finance dashboard using whatever creds are in .env.local.
 */
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env" })
loadEnv({ path: ".env.local", override: true })

async function main() {
  const { prisma } = await import("@/lib/prisma")
  const { emitFinanceEvent } = await import("@/lib/finance-webhook")
  const { buildContractPayload, buildTranchePayload } = await import(
    "@/lib/finance-payloads"
  )

  console.log("\n=== Finance webhook v2 smoke test ===\n")
  console.log("Env:")
  console.log("  FINANCE_WEBHOOK_URL set:", !!process.env.FINANCE_WEBHOOK_URL)
  console.log("  FINANCE_WEBHOOK_KEY set:", !!process.env.FINANCE_WEBHOOK_KEY)
  console.log("  FINANCE_WEBHOOK_SECRET set:", !!process.env.FINANCE_WEBHOOK_SECRET)

  // [1] Pull a SIGNED-ish doc from the seed data to use as the contract.
  console.log("\n[1/4] Locating a seeded LegalDocument to use as the contract...")
  const doc = await prisma.legalDocument.findFirst({
    where: { lifecycle_status: { in: ["SIGNED", "ACTIVE"] } },
    orderBy: { updated_at: "desc" },
  })
  if (!doc) {
    console.error("  No SIGNED/ACTIVE document found. Run seeds first.")
    process.exit(1)
  }
  console.log("  ✓ Using document:", doc.id, "—", doc.title)

  // [2] Fire contract.created
  console.log("\n[2/4] Emitting contract.created...")
  const contractResult = await emitFinanceEvent(
    "contract.created",
    buildContractPayload(doc),
    { entityType: "LegalDocument", entityId: doc.id }
  )
  console.log("  ok:", contractResult.ok, "error:", contractResult.error ?? "(none)")

  // [3] Find or create a synthetic tranche
  console.log("\n[3/4] Emitting tranche.created referencing this contract...")
  const synthCycle = {
    id: "synthetic-test-tranche-" + Date.now(),
    document_id: doc.id,
    document: { entity: doc.entity, sport: doc.sport },
    terms: "MILESTONE" as const,
    tranche_number: 1,
    tranche_label: "Smoke test tranche",
    tranche_percentage: 25,
    tranche_amount_usd: 50000,
    trigger_type: "on_signing",
    trigger_date: null,
    trigger_offset_days: 0,
    notes: null,
  }
  const trancheResult = await emitFinanceEvent(
    "tranche.created",
    buildTranchePayload(synthCycle as any),
    { entityType: "PaymentCycle", entityId: synthCycle.id }
  )
  console.log("  ok:", trancheResult.ok, "error:", trancheResult.error ?? "(none)")

  // [4] Validation
  console.log("\n[4/4] Validation:")
  if (contractResult.ok) {
    console.log("  ✅ contract.created accepted by Finance")
  } else if (contractResult.error?.includes("HTTP 200") === false) {
    console.log("  ⚠ contract.created failed:", contractResult.error)
  }
  if (trancheResult.ok) {
    console.log("  ✅ tranche.created accepted by Finance")
  } else {
    console.log("  ⚠ tranche.created failed:", trancheResult.error)
    if (
      typeof trancheResult.error === "string" &&
      trancheResult.error.includes("Could not resolve contract")
    ) {
      console.log(
        "    (this means contract.created hadn't propagated yet — retry the same script)"
      )
    }
  }

  console.log("\n=== Test complete ===\n")
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
