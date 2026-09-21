import Link from "next/link"
import { requireSession } from "@/lib/auth"
import { listDocumentExports, monthlyExportReceipt } from "@/lib/document-exports"
import { startDocumentExport, verifyDocumentExport } from "@/actions/repositories"

export default async function BackupsPage() {
  const session = await requireSession()
  const [jobs, verified] = await Promise.all([listDocumentExports(session), monthlyExportReceipt(session)])
  const currentMonth = new Date().toISOString().slice(0, 7)
  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Document backups</h1><form action={startDocumentExport}><button className="rounded border border-border px-4 py-2">Download all</button></form></div>
    <p className="text-sm text-muted-foreground">Templates, populated and signed files, plus internal history. Global legal exports also include uploaded KYC, matter, policy and audit files. Only your authorized documents are included. Archives include an inventory and SHA-256 hashes. This document export does not cover database or OpenSign recovery.</p>
    <p>Manual check for {currentMonth}: {verified ? `verified ${verified.verified_at?.toISOString().slice(0, 10)}` : "not recorded"}</p>
    <Link href="/legal/backups" className="text-primary underline">Refresh status</Link>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="py-3">Requested</th><th>Status</th><th>Result</th><th>Manual check</th></tr></thead><tbody>{jobs.map((job) => <tr className="border-b border-border" key={job.id}><td className="py-3">{job.created_at.toISOString().slice(0, 16).replace("T", " ")} UTC</td><td>{job.status}</td><td>{job.archive_url && job.expires_at && job.expires_at > new Date() ? <a className="text-primary underline" href={`/api/document-exports/${job.id}/download`}>Download {job.status === "partial" ? "incomplete " : ""}archive</a> : job.expires_at ? "Download expired" : "Waiting for export worker"}{job.error && <p className="text-destructive">{job.error}</p>}</td><td>{job.verified_at ? job.verified_at.toISOString().slice(0, 10) : job.status === "complete" && job.downloaded_at ? <form action={verifyDocumentExport}><input type="hidden" name="exportId" value={job.id}/><button className="text-primary underline">I downloaded and verified this archive</button></form> : "Not verified"}</td></tr>)}</tbody></table>{!jobs.length && <p className="py-8 text-muted-foreground">No exports requested.</p>}</div>
  </div>
}
