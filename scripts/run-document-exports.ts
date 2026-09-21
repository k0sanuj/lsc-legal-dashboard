/** Run as a scheduled worker job with the application's DB/GCS identity, independently of HTTP requests. */
import { runPendingDocumentExports } from "../src/lib/document-exports"
import { runPendingOpenSignCertificates } from "../src/lib/opensign-certificates"
import { prisma } from "../src/lib/prisma"
import { runPendingDrivePublications } from "../src/lib/drive-documents"
import { refreshReferenceRates } from "../src/lib/fx-rates"

async function maintain() {
  const refreshes = await refreshReferenceRates(new Date(Date.now() - 86400000))
  for (const refresh of refreshes) if (refresh.status === "failed") console.error(`FX refresh unavailable for ${refresh.source}; no rate invented: ${refresh.error}`)
  const certificates = await runPendingOpenSignCertificates(10)
  console.log(`Checked ${certificates} missing OpenSign certificate(s)`)
  return runPendingDocumentExports(10)
}
maintain()
  .then(async (count) => { const publications = await runPendingDrivePublications(10); console.log(`Processed queues: ${count} export candidate(s), ${publications} publication candidate(s)`) })
  .catch((error: unknown) => { console.error(error); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
