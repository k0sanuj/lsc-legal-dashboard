/** Streams only managed storage attachments. Unknown external URLs are not fetched. */
import { getPresignedUrl, getS3KeyFromUrl } from '@/lib/s3'
import { PRIVATE_FILE_HEADERS } from '@/lib/file-response'

export async function streamEntityFile(fileUrl: string | null, name: string): Promise<Response> {
  if (!fileUrl) return Response.json({ error: 'File unavailable.' }, { status: 404 })
  const key = getS3KeyFromUrl(fileUrl)
  if (!key) return Response.json({ error: 'This legacy or external file requires an operator to restore it into managed storage.' }, { status: 409 })
  const upstream = await fetch(await getPresignedUrl(key), { signal: AbortSignal.timeout(30_000), redirect: 'error' })
  if (!upstream.ok || !upstream.body) return Response.json({ error: 'Storage file unavailable.' }, { status: 502 })
  return new Response(upstream.body, { headers: {
    ...PRIVATE_FILE_HEADERS,
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name).replaceAll("'", '%27')}`,
  } })
}
