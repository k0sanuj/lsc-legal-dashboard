/** Preserve real provider CertificateUrl PDFs; absence is a durable backup gap, never a fabricated certificate. */
import { prisma } from "@/lib/prisma"
import { fetchOpenSignDocument, type OpenSignDocumentStatus } from "@/lib/opensign"
import { artifactResponse, boundedArtifactBytes, recordArtifact } from "@/lib/document-artifacts"
import { getS3Key, getS3KeyFromUrl, uploadBufferToS3 } from "@/lib/s3"

async function certificateBytes(fileUrl: string): Promise<Buffer> {
  let response: Response
  if (getS3KeyFromUrl(fileUrl)) response = await artifactResponse(fileUrl)
  else {
    const target = new URL(fileUrl)
    const provider = new URL(process.env.OPENSIGN_BASE_URL ?? "")
    if (target.protocol !== "https:" || target.origin !== provider.origin || target.username || target.password) throw new Error("Certificate URL is outside trusted OpenSign or managed GCS storage")
    response = await fetch(target, { signal: AbortSignal.timeout(20000), redirect: "error" })
    if (!response.ok) throw new Error(`OpenSign certificate unavailable (${response.status})`)
  }
  const bytes = await boundedArtifactBytes(response)
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Provider certificate response is not a PDF")
  return bytes
}

export async function preserveOpenSignCertificate(documentId: string, supplied?: OpenSignDocumentStatus) {
  const doc = await prisma.legalDocument.findUnique({ where: { id: documentId } })
  if (!doc || doc.signature_provider !== "opensign" || !doc.signature_provider_request_id || doc.signature_status !== "SIGNED" || !doc.signature_completed_at) return { status: "skipped" }
  if (doc.signature_certificate_status === "checking" && doc.signature_certificate_checked_at && doc.signature_certificate_checked_at.getTime() > Date.now() - 10 * 60000) return { status: "checking" }
  const binding = { id: doc.id, signature_provider: "opensign", signature_provider_request_id: doc.signature_provider_request_id, signature_status: "SIGNED" }
  const existing = await prisma.documentArtifact.findFirst({ where: { document_id: doc.id, stage: "certificate", naming_metadata: { path: ["provenance", "providerRequestId"], equals: doc.signature_provider_request_id } }, select: { id: true } })
  if (existing) return { status: "stored", artifactId: existing.id }
  const checkedAt = new Date()
  const claimed = await prisma.legalDocument.updateMany({ where: { ...binding, signature_certificate_checked_at: doc.signature_certificate_checked_at }, data: { signature_certificate_checked_at: checkedAt, signature_certificate_status: "checking", signature_certificate_error: null } })
  if (!claimed.count) return { status: "skipped" }
  const attempt = { ...binding, signature_certificate_checked_at: checkedAt }
  try {
    const current = supplied ?? await fetchOpenSignDocument(doc.signature_provider_request_id)
    if (current.objectId !== doc.signature_provider_request_id || !current.isCompleted || current.isDeclined) throw new Error("Provider does not confirm completion of the bound request")
    if (!current.certificateUrl) {
      await prisma.legalDocument.updateMany({ where: attempt, data: { signature_certificate_status: "unavailable", signature_certificate_error: "OpenSign has not supplied CertificateUrl; no completion certificate is preserved" } })
      return { status: "unavailable" }
    }
    const bytes = await certificateBytes(current.certificateUrl)
    const fileUrl = await uploadBufferToS3(bytes, getS3Key(doc.entity, "certificates", `${doc.title}-certificate.pdf`), "application/pdf")
    const source = await prisma.documentArtifact.findFirst({ where: { document_id: doc.id, stage: "signed", naming_metadata: { path: ["provenance", "providerRequestId"], equals: current.objectId } }, select: { id: true } })
    const artifact = await prisma.$transaction(async tx => {
      const matched = await tx.legalDocument.updateMany({ where: attempt, data: { signature_certificate_status: "stored", signature_certificate_error: null } })
      if (!matched.count) throw new Error("Signing request changed while preserving its certificate")
      return recordArtifact({ documentId: doc.id, sourceArtifactId: source?.id, stage: "certificate", fileUrl, originalName: `${doc.title}-certificate.pdf`, mimeType: "application/pdf", bytes, actorId: "opensign", finalized: true, provenance: { provider: "opensign", providerRequestId: current.objectId, sourceField: "CertificateUrl", sourceUrl: current.certificateUrl, signedSourceKnown: Boolean(source) } }, tx)
    })
    return { status: "stored", artifactId: artifact.id }
  } catch (error) {
    await prisma.legalDocument.updateMany({ where: attempt, data: { signature_certificate_status: "failed", signature_certificate_error: error instanceof Error ? error.message : "Certificate preservation failed" } })
    return { status: "failed" }
  }
}

/** Check oldest missing certificates at most daily, including after the signing poll has completed. */
export async function runPendingOpenSignCertificates(limit = 10) {
  const documents = await prisma.legalDocument.findMany({ where: {
    signature_provider: "opensign", signature_provider_request_id: { not: null }, signature_status: "SIGNED", signature_completed_at: { not: null },
    artifacts: { none: { stage: "certificate" } },
    OR: [{ signature_certificate_checked_at: null }, { signature_certificate_checked_at: { lt: new Date(Date.now() - 86400000) } }],
  }, orderBy: [{ signature_certificate_checked_at: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: limit, select: { id: true } })
  for (const document of documents) await preserveOpenSignCertificate(document.id)
  return documents.length
}
