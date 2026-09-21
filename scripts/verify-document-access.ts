/** Integration test against an explicitly named disposable database, never production. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { documentScope, requireDocumentAccess, isGlobalDocumentUser, requestDocumentAccess, DocumentAccessDenied, GLOBAL_DOCUMENT_EMAILS } from '../src/lib/document-access'
import type { SessionPayload } from '../src/lib/session'

async function main() {
  if (!new URL(process.env.DATABASE_URL ?? '').pathname.startsWith('/legal_os_v2_verify_')) throw new Error('This check requires a disposable legal_os_v2_verify_ database.')
  const run = randomUUID()
  const actors: SessionPayload[] = []
  const docIds: string[] = []
  for (const email of [...GLOBAL_DOCUMENT_EMAILS, 'fifth@example.test']) {
    const user = await prisma.appUser.upsert({ where: { email }, create: { email, full_name: 'Verification account', password_hash: '!no-password-verification-only', role: 'PLATFORM_ADMIN', is_active: true }, update: {} })
    actors.push({ userId: user.id, email, role: user.role, fullName: user.full_name, exp: Date.now() + 60_000 })
  }
  const [owner,,,,fifth] = actors
  try {
    for (const suffix of ['private', 'granted']) {
      const document = await prisma.legalDocument.create({ data: { title: `V2Test ${run} ${suffix}`, entity: 'FSP', category: 'OTHER', owner_id: owner.userId } }); docIds.push(document.id)
    }
    for (const actor of actors.slice(0,4)) assert.equal(await isGlobalDocumentUser(actor), true)
    assert.equal(await isGlobalDocumentUser(fifth), false, 'fifth admin is not globally entitled')
    assert.equal(await isGlobalDocumentUser({ ...owner, email: fifth.email }), false, 'cookie email cannot impersonate identity')
    assert.equal(await prisma.legalDocument.count({ where: { AND: [{ id: { in: docIds } }, await documentScope(fifth)] } }), 0)
    await assert.rejects(requireDocumentAccess(fifth, docIds[0]), DocumentAccessDenied)
    await assert.rejects(requireDocumentAccess(fifth, 'missing-reference'), DocumentAccessDenied)
    const request = await requestDocumentAccess(fifth, `unknown-reference-${run}`, 'Need access for review')
    const duplicate = await requestDocumentAccess(fifth, `unknown-reference-${run}`, 'Need access for review')
    assert.equal(request.id, duplicate.id)
    assert.equal(request.document_id, null, 'requests must not resolve or reveal unknown document metadata')
    const grant = await prisma.documentAccessGrant.create({ data: { user_id: fifth.userId, document_id: docIds[1], granted_by: owner.userId, expires_at: new Date(Date.now() + 60_000) } })
    await requireDocumentAccess(fifth, docIds[1])
    assert.deepEqual((await prisma.legalDocument.findMany({ where: { AND: [{ id: { in: docIds } }, await documentScope(fifth)] }, select: { id: true } })).map(doc => doc.id), [docIds[1]])
    await prisma.documentAccessGrant.update({ where: { id: grant.id }, data: { expires_at: new Date(Date.now() - 1000) } })
    await assert.rejects(requireDocumentAccess(fifth, docIds[1]), DocumentAccessDenied)
    await prisma.documentAccessGrant.update({ where: { id: grant.id }, data: { expires_at: new Date(Date.now() + 60_000), revoked_at: new Date() } })
    await assert.rejects(requireDocumentAccess(fifth, docIds[1]), DocumentAccessDenied)
    await prisma.appUser.update({ where: { id: fifth.userId }, data: { is_active: false } })
    await assert.rejects(requestDocumentAccess(fifth, 'reference', 'reason'), DocumentAccessDenied)
    console.log('Document access integration passed: four identities, fifth admin denial, identity mismatch, no metadata resolution, scoped grant, expiry, revocation, inactive account.')
  } finally {
    await prisma.appUser.update({ where: { id: fifth.userId }, data: { is_active: true } })
    await prisma.documentAccessRequest.deleteMany({ where: { reference: `unknown-reference-${run}` } })
    await prisma.legalDocument.deleteMany({ where: { id: { in: docIds } } })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
