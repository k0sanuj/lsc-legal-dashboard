/** Preserve existing KYC links and filters under the entity workspace. */
import { redirect } from 'next/navigation'
import { requireGlobalDocumentAccess } from '@/lib/document-access'

export default async function KycRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGlobalDocumentAccess()
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value)
    else if (Array.isArray(value)) for (const item of value) query.append(key, item)
  }
  redirect(`/legal/compliance/entities/kyc${query.size ? `?${query}` : ''}`)
}
