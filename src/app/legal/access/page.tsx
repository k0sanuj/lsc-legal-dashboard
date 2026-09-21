/** Scoped access requests. Nonmembers see only their own supplied references. */
import { requireSession } from '@/lib/auth'
import { isGlobalDocumentUser } from '@/lib/document-access'
import { prisma } from '@/lib/prisma'
import { requestAccess, decideAccess, revokeAccess } from '@/actions/document-access'

export default async function AccessPage() {
  const actor = await requireSession()
  const global = await isGlobalDocumentUser(actor)
  const [requests, documents, grants] = await Promise.all([
    prisma.documentAccessRequest.findMany({ where: global ? {} : { requester_id: actor.userId }, include: { requester: { select: { email: true } } }, orderBy: { created_at: 'desc' }, take: 100 }),
    global ? prisma.legalDocument.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }) : [],
    global ? prisma.documentAccessGrant.findMany({ where: { revoked_at: null, expires_at: { gt: new Date() } }, include: { user: { select: { email: true } }, document: { select: { title: true } } } }) : [],
  ])
  const input = 'rounded border border-input bg-background p-2 text-sm'
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Document access</h1>
    <p>Legal manages document access. Grants apply to a specific document until their expiry.</p>
    <form action={requestAccess} className="grid gap-3 max-w-2xl"><label>Document reference<input name="reference" required maxLength={500} className={`${input} block w-full`} placeholder="Reference or description supplied by Legal" /></label><label>Reason<textarea name="reason" required maxLength={2000} className={`${input} block w-full`} /></label><button className="justify-self-start bg-primary text-primary-foreground px-4 py-2 rounded">Request access</button></form>
    <h2 className="text-lg font-semibold">{global ? 'Requests' : 'Your requests'}</h2>
    {requests.length === 0 && <p className="text-muted-foreground">No requests.</p>}
    {requests.map(request => <div key={request.id} className="border-t border-border py-4 space-y-2"><div className="flex flex-wrap gap-4"><span>{request.reference}</span><span>{request.status}</span><span>{request.requester.email}</span></div><p>{request.reason}</p>{global && request.status === 'PENDING' && <form action={decideAccess} className="flex flex-wrap gap-2"><input type="hidden" name="request_id" value={request.id} /><label>Document<select name="document_id" className={input}><option value="">Select document</option>{documents.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></label><label>Access expires<input name="expires_at" type="date" className={input} /></label><button name="decision" value="approve" className="px-3 border border-input rounded">Approve</button><button name="decision" value="deny" className="px-3 border border-input rounded">Deny</button></form>}</div>)}
    {global && <><h2 className="text-lg font-semibold">Active grants</h2>{grants.map(grant => <form action={revokeAccess} key={grant.id} className="flex flex-wrap gap-4 border-t border-border py-3"><input type="hidden" name="grant_id" value={grant.id} /><span>{grant.user.email}</span><span>{grant.document.title}</span><span>Until {grant.expires_at.toISOString().slice(0,10)}</span><button className="text-destructive">Revoke</button></form>)}</>}
  </div>
}
