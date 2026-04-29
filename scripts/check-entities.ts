import "dotenv/config"
import { prisma } from "@/lib/prisma"

const TABLES = [
  "legalDocument",
  "contractTemplate",
  "complianceRecord",
  "complianceOfficer",
  "registeredOfficeAgreement",
  "companyEmail",
  "dataProtectionRecord",
  "eSOPGrant",
  "kycDocument",
  "adminAccount",
  "litigationCase",
  "detectedInvoice",
  "clickwrapAcceptance",
  "subsidy",
  "auditReport",
  "fileNamingLog",
  "calendarEvent",
] as const

async function main() {
  const summary: Record<string, Record<string, number>> = {}
  for (const t of TABLES) {
    try {
      const total = await (prisma as any)[t].count()
      if (total === 0) continue
      const rows = await (prisma as any)[t].findMany({ select: { entity: true } })
      const buckets: Record<string, number> = {}
      for (const r of rows) {
        const e = (r.entity ?? "NULL") as string
        buckets[e] = (buckets[e] ?? 0) + 1
      }
      summary[t] = buckets
    } catch (e) {
      summary[t] = { ERROR: 1 }
    }
  }
  console.log(JSON.stringify(summary, null, 2))

  // Aggregate counts of values that need to migrate
  const toMigrate: Record<string, number> = {}
  for (const tBuckets of Object.values(summary)) {
    for (const [e, n] of Object.entries(tBuckets)) {
      if (["BOWLING", "SQUASH", "BASKETBALL", "BEER_PONG", "FOUNDATION"].includes(e)) {
        toMigrate[e] = (toMigrate[e] ?? 0) + n
      }
    }
  }
  console.log("\nROWS NEEDING MIGRATION:", toMigrate)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
