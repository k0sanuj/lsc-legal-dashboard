/** Actor-explicit repository operations shared by the dashboard and verified Slack requests. */
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requireDocumentAccess, requireGlobalDocumentAccess } from "@/lib/document-access"
import { publishedFilename } from "@/lib/file-names"
import { publicationFolder } from "@/lib/drive-documents"
import { currencyCode, decimalAmount } from "@/lib/money"
import type { SessionPayload } from "@/lib/session"

function text(form: FormData, key: string) { return String(form.get(key) ?? "").trim() }

export async function proposeArtifactNameForActor(session: SessionPayload, form: FormData) {
  await requireGlobalDocumentAccess(session)
  const artifact = await prisma.documentArtifact.findUniqueOrThrow({ where: { id: text(form, "artifactId") } })
  if (artifact.published_at || ["queued", "publishing"].includes(artifact.publish_status)) throw new Error("Published or queued names are immutable; finish or resolve publication first")
  const categories = await prisma.namingCode.findMany({ where: { kind: "category" } })
  const extension = artifact.original_name.split(".").pop()?.toLowerCase() ?? ""
  const facts = { arena: text(form, "arena"), category: text(form, "category"), counterparty: text(form, "counterparty"), date: text(form, "date"), initials: text(form, "initials"), extension }
  if (!text(form, "dateBasis")) throw new Error("Record what the naming date represents")
  const proposed = publishedFilename(facts, categories.map((entry) => entry.code))
  const changed = await prisma.documentArtifact.updateMany({ where: { id: artifact.id, published_at: null, publish_status: { notIn: ["queued", "publishing"] } }, data: { proposed_name: proposed, naming_metadata: { ...(artifact.naming_metadata && typeof artifact.naming_metadata === "object" && !Array.isArray(artifact.naming_metadata) ? artifact.naming_metadata : {}), ...facts, dateBasis: text(form, "dateBasis") }, approved_name: null, approved_by: null } })
  if (!changed.count) throw new Error("Publication began while editing; refresh the artifact")
}

export async function approveArtifactNameForActor(session: SessionPayload, form: FormData) {
  await requireGlobalDocumentAccess(session)
  const artifact = await prisma.documentArtifact.findUniqueOrThrow({ where: { id: text(form, "artifactId") } })
  if (text(form, "proposedName") !== artifact.proposed_name) throw new Error("Proposal changed; review and submit the exact current filename")
  if (!artifact.proposed_name || artifact.published_at) throw new Error("An unpublished proposal is required")
  const changed = await prisma.documentArtifact.updateMany({ where: { id: artifact.id, proposed_name: artifact.proposed_name, published_at: null, publish_status: { notIn: ["queued", "publishing"] } }, data: { approved_name: artifact.proposed_name, approved_by: session.userId } })
  if (!changed.count) throw new Error("Filename changed or publication began; review the current proposal")
}

export async function finalizeArtifactForActor(session: SessionPayload, form: FormData) {
  await requireGlobalDocumentAccess(session)
  const artifact = await prisma.documentArtifact.findUniqueOrThrow({ where: { id: text(form, "artifactId") } })
  if ((artifact.stage === "signed" || artifact.stage === "certificate") && artifact.document_id) {
    const doc = await prisma.legalDocument.findUniqueOrThrow({ where: { id: artifact.document_id } })
    if (!doc.signature_completed_at || doc.signature_status !== "SIGNED") throw new Error("Signature completion evidence is missing")
  }
  if (artifact.finalized_at) return
  const changed = await prisma.documentArtifact.updateMany({ where: {
    id: artifact.id, finalized_at: null, source_artifact_id: artifact.source_artifact_id,
    signer_scope: { equals: artifact.signer_scope ?? Prisma.DbNull }, deliverable_scope: artifact.deliverable_scope,
  }, data: { finalized_at: new Date(), finalized_by: session.userId } })
  if (!changed.count) throw new Error("Artifact scope changed; review it before finalizing")
}

export async function publishArtifactForActor(session: SessionPayload, form: FormData) {
  await requireGlobalDocumentAccess(session)
  const artifact = await prisma.documentArtifact.findUniqueOrThrow({ where: { id: text(form, "artifactId") } })
  if (!publicationFolder(artifact.stage)) throw new Error(`${artifact.stage === "template" ? "Template" : "Final agreement"} Drive destination is not configured`)
  if (!artifact.finalized_at || !artifact.approved_name || !artifact.approved_by) throw new Error("Final artifact and approved filename are required")
  if (artifact.published_at || artifact.publish_status === "publishing") return
  const changed = await prisma.documentArtifact.updateMany({ where: { id: artifact.id, finalized_at: artifact.finalized_at, approved_name: artifact.approved_name, approved_by: artifact.approved_by, published_at: null, publish_status: { notIn: ["queued", "publishing"] } }, data: { publish_status: "queued", publish_requested_by: session.userId, publish_error: null } })
  if (!changed.count) throw new Error("Artifact changed or publication already began; refresh before retrying")
}

export async function updateArtifactLineageForActor(session: SessionPayload, form: FormData) {
  await requireGlobalDocumentAccess(session)
  const artifact = await prisma.documentArtifact.findUniqueOrThrow({ where: { id: text(form, "artifactId") } })
  if (artifact.published_at || artifact.finalized_at) throw new Error("Final artifact lineage is immutable")
  const sourceId = text(form, "sourceArtifactId")
  if (sourceId) {
    const source = await prisma.documentArtifact.findUniqueOrThrow({ where: { id: sourceId } })
    if (artifact.stage !== "populated" || source.stage !== "template" || !source.finalized_at) throw new Error("A populated artifact must link to an approved source template")
  }
  const signers = text(form, "signers").split("\n").map((value) => value.trim()).filter(Boolean)
  const changed = await prisma.documentArtifact.updateMany({ where: { id: artifact.id, finalized_at: null, published_at: null, publish_status: { notIn: ["queued", "publishing"] } }, data: { source_artifact_id: sourceId || null, signer_scope: signers, deliverable_scope: text(form, "deliverables") || null } })
  if (!changed.count) throw new Error("Artifact was finalized or publication began; lineage can no longer change")
}

export async function updateNativeAmountForActor(session: SessionPayload, form: FormData) {
  await requireGlobalDocumentAccess(session)
  const id = text(form, "documentId")
  await requireDocumentAccess(session, id)
  const currency = currencyCode(text(form, "currency"))
  if (!currency) throw new Error("Use an ISO currency code")
  const amount = text(form, "value")
  await prisma.legalDocument.update({ where: { id }, data: { value: amount ? decimalAmount(amount) : null, currency } })
}
