import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireGlobalDocumentAccess } from "@/lib/document-access"
import { approveNamingCode } from "@/actions/repositories"
import { ARENA_CODES } from "@/lib/file-names"

/** The shared lexicon is approved data. Old AI suggestions are history, never applied filenames. */
export default async function FileNamingPage() {
  await requireGlobalDocumentAccess()
  const [codes, history] = await Promise.all([
    prisma.namingCode.findMany({ where: { kind: "category" }, orderBy: { code: "asc" } }),
    prisma.fileNamingLog.findMany({ orderBy: { created_at: "desc" }, take: 20 }),
  ])
  const input = "rounded border border-input bg-background px-3 py-2 text-sm"
  return <div className="space-y-6"><div className="flex flex-wrap justify-between gap-4"><h1 className="text-2xl font-semibold">Organization file naming</h1><Link className="text-primary" href="/legal/repositories">Name and publish artifacts</Link></div><p className="font-mono break-all">Arena_CAT_FullCounterparty_DDMMMYYYY_Initials.ext</p><p className="text-sm text-muted-foreground">Only final files are published to shared Drive. Full counterparties and confirmed owner initials replace version suffixes; internal history remains available. Date basis is recorded for each proposal. Existing shared files are never renamed automatically.</p><div className="border-y border-border py-4"><h2 className="font-medium">Approved arena codes</h2><p className="mt-2 font-mono">{ARENA_CODES.join(" · ")}</p><p className="mt-2 text-sm text-muted-foreground">Legal entity mappings remain separate and must be supplied by the team.</p></div><h2 className="text-lg font-medium">Category lexicon</h2><table className="w-full text-left text-sm"><thead><tr><th>Code</th><th>Full category</th></tr></thead><tbody>{codes.map((code) => <tr className="border-b border-border" key={code.id}><td className="py-3 font-mono">{code.code}</td><td>{code.label}</td></tr>)}</tbody></table>{!codes.length && <p className="text-muted-foreground text-sm">No category mappings approved yet. Names cannot be generated until their category code is approved.</p>}<form action={approveNamingCode} className="flex flex-wrap gap-3"><input className={input} name="code" placeholder="Three-letter code" pattern="[A-Z]{3}" maxLength={3} required/><input className={input} name="label" placeholder="Full category name" required/><button className={input}>Approve category code</button></form>{history.length > 0 && <details><summary className="cursor-pointer text-sm text-muted-foreground">Legacy naming suggestions</summary><p className="my-3 text-sm text-muted-foreground">Historical suggestions used an older convention. Approval of a historical log did not rename or publish a file.</p>{history.map((entry) => <p className="py-2 font-mono text-xs break-all border-b border-border" key={entry.id}>{entry.renamed_to} ({entry.approved ? "historically approved" : "not approved"})</p>)}</details>}</div>
}
