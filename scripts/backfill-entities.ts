/**
 * Backfill: rows whose `entity` column holds a soon-to-be-removed enum value
 * are migrated to entity=FSP with the original sport name preserved in the
 * new `sport` column.
 *
 * BEER_PONG is renamed to WORLD_PONG (Finance's name) at the same time.
 *
 * Run before pushing the Entity enum collapse.
 */
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

const SPORT_MAP: Record<string, string> = {
  BOWLING: "BOWLING",
  SQUASH: "SQUASH",
  BASKETBALL: "BASKETBALL",
  BEER_PONG: "WORLD_PONG", // renamed to match Finance
  FOUNDATION: "FOUNDATION",
}

async function main() {
  let totalUpdated = 0
  for (const t of TABLES) {
    for (const [oldEntity, sport] of Object.entries(SPORT_MAP)) {
      try {
        const result = await (prisma as any)[t].updateMany({
          where: { entity: oldEntity },
          data: { entity: "FSP", sport },
        })
        if (result.count > 0) {
          console.log(`  ${t}: ${oldEntity} → FSP+sport=${sport} (${result.count} rows)`)
          totalUpdated += result.count
        }
      } catch (e) {
        // table may not have entity column or be otherwise un-updatable
      }
    }
  }
  console.log(`\nTotal rows migrated: ${totalUpdated}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
