/** Sourced corporate registry. Existing enum records remain separate until mapped. */
import Link from 'next/link'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
import { listEntityProfiles } from '@/lib/entity-service'
import { saveEntityProfile } from '@/actions/entity-records'
import { EntityActionForm } from '@/components/legal/entity-action-form'
import { EntityProfileFields } from '@/components/legal/entity-profile-fields'
import { prisma } from '@/lib/prisma'

export default async function EntitiesPage() {
  const session = await requireGlobalDocumentAccess()
  const profiles = await listEntityProfiles(session)
  const [existing, unmappedKyc] = await Promise.all([
    prisma.complianceRecord.findMany({ orderBy: [{ entity: 'asc' }, { jurisdiction: 'asc' }], select: { id: true, entity: true, jurisdiction: true, check_type: true, status: true, registration_number: true, registration_details: true } }),
    prisma.kycDocument.groupBy({ by: ['entity', 'jurisdiction'], where: { entity_profile_id: null }, _count: { _all: true } }),
  ])
  const unmapped = existing.filter((record) => !profiles.some((profile) => profile.legacy_entity === record.entity && profile.jurisdiction === record.jurisdiction))
  return <div className="space-y-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><h1 className="text-2xl font-semibold">Entities</h1><Link className="text-sm text-primary underline" href="/legal/compliance/entities/kyc">KYC register</Link></header>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="py-3">Legal name</th><th>Jurisdiction</th><th>Registration</th><th>Filings</th><th>KYC records</th></tr></thead><tbody>{profiles.map((profile) => <tr key={profile.id} className="border-b border-border"><td className="py-4"><Link className="text-primary underline" href={`/legal/compliance/entities/${profile.id}`}>{profile.legal_name}</Link></td><td>{profile.jurisdiction}</td><td>{profile.registration_number ?? 'Not supplied'}</td><td>{profile._count.filings}</td><td>{profile._count.kyc_documents}</td></tr>)}</tbody></table></div>
    {!profiles.length && <p className="text-sm text-muted-foreground">No legal entity profiles recorded. Add sourced identities below; arena codes are not company registrations.</p>}
    {(unmapped.length > 0 || unmappedKyc.length > 0) && <section className="space-y-3"><h2 className="text-lg font-semibold">Existing records awaiting entity mapping</h2><p className="text-sm text-muted-foreground">Existing registration records and unlinked KYC remain available. Confirm the legal identity before linking them to a profile.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="py-3">Existing code</th><th>Jurisdiction</th><th>Check / registration</th><th>Status</th><th>Source</th></tr></thead><tbody>{unmapped.map((record) => <tr key={record.id} className="border-b border-border"><td className="py-3">{record.entity}</td><td>{record.jurisdiction}</td><td>{record.check_type}{record.registration_number && <div>{record.registration_number}</div>}{record.registration_details && <div className="max-w-lg whitespace-pre-wrap text-muted-foreground">{record.registration_details}</div>}</td><td>{record.status}</td><td><Link className="text-primary underline" href={`/legal/compliance?entity=${record.entity}`}>Compliance source</Link></td></tr>)}{unmappedKyc.map((group) => <tr key={`kyc-${group.entity}-${group.jurisdiction}`} className="border-b border-border"><td className="py-3">{group.entity}</td><td>{group.jurisdiction}</td><td>{group._count._all} unlinked KYC record{group._count._all === 1 ? '' : 's'}</td><td>Needs mapping</td><td><Link className="text-primary underline" href={`/legal/compliance/entities/kyc?entity=${group.entity}&jurisdiction=${group.jurisdiction}`}>KYC source</Link></td></tr>)}</tbody></table></div></section>}
    <details className="border-t border-border pt-5"><summary className="cursor-pointer text-sm font-medium">Add entity</summary><EntityActionForm action={saveEntityProfile} className="mt-5"><EntityProfileFields /></EntityActionForm></details>
  </div>
}
