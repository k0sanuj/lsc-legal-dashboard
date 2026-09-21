/** Run as a scheduled worker job with the application's DB/GCS identity, independently of HTTP requests. */
import { runPendingDocumentExports } from "../src/lib/document-exports"
import { prisma } from "../src/lib/prisma"
import { runPendingDrivePublications } from "../src/lib/drive-documents"
import { refreshEcbRates, ECB_SOURCE } from "../src/lib/fx-rates"

async function maintain() {
  const fresh = await prisma.fxRate.findFirst({ where: { source_url: ECB_SOURCE, fetched_at: { gte: new Date(Date.now() - 86400000) } } })
  if (!fresh) await refreshEcbRates().catch((error: unknown) => console.error("FX refresh unavailable; no rate invented:", error instanceof Error ? error.message : "Unknown failure"))
  return runPendingDocumentExports(10)
}
maintain()
  .then(async (count) => { const publications = await runPendingDrivePublications(10); console.log(`Processed queues: ${count} export candidate(s), ${publications} publication candidate(s)`) })
  .catch((error: unknown) => { console.error(error); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
