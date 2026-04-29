/**
 * Optional backfill: populate v2 contract fields on existing LegalDocument
 * rows so the first contract.* webhook for each has reasonable values.
 *
 * - contract_name = title (when null)
 * - sponsor_name = counterparty (when null)
 * - contract_value_usd = value (when currency='USD' and field null)
 * - contract_status = derived from lifecycle_status (when null)
 *
 * Run before deploy: `npx tsx scripts/backfill-contract-fields.ts`
 */
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env" })
loadEnv({ path: ".env.local", override: true })

async function main() {
  const { prisma } = await import("@/lib/prisma")

  function statusFor(s: string): string {
    if (s === "EXPIRED") return "completed"
    if (s === "TERMINATED") return "cancelled"
    if (s === "SIGNED" || s === "ACTIVE" || s === "EXPIRING") return "active"
    return "draft"
  }

  const docs = await prisma.legalDocument.findMany({
    select: {
      id: true,
      title: true,
      counterparty: true,
      value: true,
      currency: true,
      lifecycle_status: true,
      contract_name: true,
      sponsor_name: true,
      contract_value_usd: true,
      contract_status: true,
    },
  })

  let updated = 0
  for (const d of docs) {
    const patch: Record<string, unknown> = {}
    if (!d.contract_name) patch.contract_name = d.title
    if (!d.sponsor_name && d.counterparty) patch.sponsor_name = d.counterparty
    if (!d.contract_value_usd && d.value && d.currency === "USD") {
      patch.contract_value_usd = d.value
    }
    if (!d.contract_status) patch.contract_status = statusFor(d.lifecycle_status)

    if (Object.keys(patch).length > 0) {
      await prisma.legalDocument.update({ where: { id: d.id }, data: patch })
      updated++
    }
  }
  console.log(`Backfilled ${updated} of ${docs.length} LegalDocument rows.`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
