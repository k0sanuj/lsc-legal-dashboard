import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireGlobalDocumentAccess } from "@/lib/document-access"
import { isReconstructedTemplate } from "@/lib/artifact-provenance"
import { publicationFolder } from "@/lib/drive-documents"
import { ARENA_CODES } from "@/lib/file-names"
import { approveArtifactName, finalizeArtifact, proposeArtifactName, publishArtifact, updateArtifactLineage } from "@/actions/repositories"

const input = "rounded border border-input bg-background px-3 py-2 text-sm"
export default async function RepositoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGlobalDocumentAccess()
  const query = await searchParams
  const stage = typeof query.stage === "string" && ["template", "populated", "signed", "certificate"].includes(query.stage) ? query.stage : "template"
  const [artifacts, templates, categories, counts, legacyTemplates] = await Promise.all([
    prisma.documentArtifact.findMany({ where: { stage }, orderBy: { created_at: "desc" }, take: 100, include: { document: { select: { title: true } }, template: { select: { name: true } }, source: { select: { original_name: true } } } }),
    prisma.documentArtifact.findMany({ where: { stage: "template", finalized_at: { not: null } }, select: { id: true, original_name: true } }),
    prisma.namingCode.findMany({ where: { kind: "category" }, orderBy: { code: "asc" } }),
    prisma.documentArtifact.groupBy({ by: ["stage"], _count: true }),
    stage === "template" ? prisma.contractTemplate.findMany({ where: { artifacts: { none: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ])
  const driveConfigured = Boolean(publicationFolder(stage))
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Document repositories</h1><div className="flex gap-4 text-sm text-primary"><Link href="/legal/backups">Download all</Link><Link href="/legal/templates">Add template</Link><Link href="/legal/documents">Agreements</Link><Link href="/legal/file-naming">Naming lexicon</Link></div></div>
    <nav className="flex flex-wrap gap-6 border-b border-border pb-3">{[["template", "Templates"], ["populated", "Populated templates"], ["signed", "Signed versions"], ["certificate", "Certificates"]].map(([value, label]) => <Link className={value === stage ? "text-primary" : "text-muted-foreground"} key={value} href={`/legal/repositories?stage=${value}`}>{label} ({counts.find((row) => row.stage === value)?._count ?? 0})</Link>)}</nav>
    <p className="text-sm text-muted-foreground">Original bytes and internal history are retained. Only finalized artifacts with approved names can publish to the shared Drive. Historical files remain under Agreements until their lineage is verified.</p>
    {!driveConfigured && <p className="text-sm text-muted-foreground">{stage === "template" ? "Template" : "Final agreement"} Drive destination is not configured. Publication remains unavailable.</p>}
    {!categories.length && <p className="text-sm text-muted-foreground">Approve the three-letter category lexicon before proposing filenames.</p>}
    {artifacts.map((artifact) => <article key={artifact.id} className="border-b border-border py-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-medium">{artifact.document?.title ?? artifact.template?.name}</h2><p className="text-sm font-mono break-all">{artifact.approved_name ?? artifact.proposed_name ?? artifact.original_name}</p></div><div className="text-sm">{artifact.published_at ? "Published" : ["queued", "publishing", "failed"].includes(artifact.publish_status) ? `Drive: ${artifact.publish_status}` : artifact.finalized_at ? "Finalized" : "Working artifact"}</div></div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground"><span>Source: {artifact.source?.original_name ?? (artifact.stage === "template" ? isReconstructedTemplate(artifact.naming_metadata) ? "Reconstructed legacy text; original binary missing" : "Uploaded template" : "Not linked")}</span><span>Signer scope: {Array.isArray(artifact.signer_scope) ? artifact.signer_scope.join(", ") || "Not supplied" : "Not supplied"}</span><span>Deliverables: {artifact.deliverable_scope ?? "Not supplied"}</span></div>
      <p className="text-xs font-mono text-muted-foreground break-all">SHA-256 {artifact.sha256}</p>
      <a className="text-sm text-primary underline" href={`/api/artifacts/${artifact.id}/file`}>{isReconstructedTemplate(artifact.naming_metadata) ? "Download reconstructed text" : "Download original"}</a>
      {artifact.publish_error && <p className="text-sm text-destructive">{artifact.publish_error}</p>}
      {!artifact.published_at && <details className="text-sm"><summary className="cursor-pointer text-primary">Lineage, naming and final publication</summary><div className="space-y-4 pt-4">
        {artifact.stage === "populated" && !artifact.finalized_at && <form action={updateArtifactLineage} className="flex flex-wrap gap-2"><input type="hidden" name="artifactId" value={artifact.id}/><select name="sourceArtifactId" defaultValue={artifact.source_artifact_id ?? ""} className={input} aria-label="Approved source template"><option value="">Source template not yet linked</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.original_name}</option>)}</select><textarea name="signers" className={input} placeholder="Signer names or identifiers, one per line" defaultValue={Array.isArray(artifact.signer_scope) ? artifact.signer_scope.join("\n") : ""}/><input name="deliverables" className={input} placeholder="Deliverables" defaultValue={artifact.deliverable_scope ?? ""}/><button className={input}>Save scope</button></form>}
        <form action={proposeArtifactName} className="flex flex-wrap gap-2"><input type="hidden" name="artifactId" value={artifact.id}/><select name="arena" className={input} aria-label="Arena" required><option value="">Arena</option>{ARENA_CODES.map((code) => <option key={code}>{code}</option>)}</select><select name="category" className={input} aria-label="Approved category" required><option value="">Category</option>{categories.map((category) => <option key={category.id} value={category.code}>{category.code}: {category.label}</option>)}</select><input name="counterparty" placeholder="Full counterparty" className={input} required/><input name="date" type="date" aria-label="Naming date" className={input} required/><input name="dateBasis" placeholder="Date basis, e.g. execution date" className={input} required/><input name="initials" placeholder="Owner initials" className={input} pattern="[A-Z]{2,8}" required/><button className={input} disabled={!categories.length}>Propose name</button></form>
        <div className="flex flex-wrap gap-3">{artifact.proposed_name && !artifact.approved_name && <form action={approveArtifactName}><input type="hidden" name="artifactId" value={artifact.id}/><input type="hidden" name="proposedName" value={artifact.proposed_name}/><button className={input}>Approve proposed name</button></form>}{!artifact.finalized_at && <form action={finalizeArtifact}><input type="hidden" name="artifactId" value={artifact.id}/><button className={input}>Approve final artifact</button></form>}<form action={publishArtifact}><input type="hidden" name="artifactId" value={artifact.id}/><button className={input} disabled={!driveConfigured || !artifact.finalized_at || !artifact.approved_name || ["queued", "publishing"].includes(artifact.publish_status)}>{artifact.publish_status === "failed" ? "Retry Drive publication" : "Publish final to Drive"}</button></form></div>
      </div></details>}
    </article>)}
    {legacyTemplates.length > 0 && <section className="border-t border-border pt-4"><h2 className="font-medium">Existing text-only templates ({legacyTemplates.length})</h2><p className="my-2 text-sm text-muted-foreground">These saved templates have no original file artifact. Their text remains available in Templates; source-file recovery remains a backup gap.</p><ul className="divide-y divide-border">{legacyTemplates.map((template) => <li className="py-2 text-sm" key={template.id}>{template.name}</li>)}</ul></section>}
    {!artifacts.length && <p className="py-8 text-muted-foreground">No verified artifacts in this repository yet.</p>}
  </div>
}
