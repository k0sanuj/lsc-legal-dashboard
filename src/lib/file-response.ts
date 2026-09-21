/** Uploaded bytes are untrusted content, even when their parent record is authorized. */
export const PRIVATE_FILE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Disposition': 'attachment',
  'Content-Type': 'application/octet-stream',
  'Content-Security-Policy': "sandbox; default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, no-store',
}
