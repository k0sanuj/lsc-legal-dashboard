/**
 * The app's own public origin, for links inside outbound notifications.
 *
 * Vercel does not expose a single canonical origin, so resolve in order:
 * an explicit NEXT_PUBLIC_APP_URL, then the deployment's production host,
 * then the known production host. Vercel's host values carry no scheme.
 */
const FALLBACK_ORIGIN = "https://lsc-legal-dashboard.vercel.app"

export function getAppBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()

  if (!configured) return FALLBACK_ORIGIN

  const withScheme = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`
  return withScheme.replace(/\/+$/, "")
}

export function buildAppUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${getAppBaseUrl()}${suffix}`
}
