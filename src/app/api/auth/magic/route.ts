import { NextRequest, NextResponse } from "next/server"
import { establishSessionForUser } from "@/lib/auth"
import {
  MAGIC_LINK_CONSUMED_EVENT,
  consumeMagicLink,
  firstForwardedIp,
  inspectMagicLink,
} from "@/lib/magic-link"

// node:crypto and Prisma are used down this path.
export const runtime = "nodejs"

/**
 * Magic-link callback, deliberately split into two steps.
 *
 * The link has to be a GET so a mail client can follow it, but corporate mail
 * gateways and chat link-previews fetch URLs before any human clicks. If GET
 * burned the token, the scanner would spend the link and, worse, be handed the
 * admin session cookie. So GET only inspects the token and renders a confirm
 * button; the token is burned and the session created in POST, which automated
 * fetchers do not perform.
 *
 * Failures redirect to /login with one generic code. The token and the real
 * reason are never echoed to the browser; the reason goes to the server log and
 * to AuthAccessEvent.
 */

const INVALID_REDIRECT = "/login?error=magic_link_invalid"

function confirmPage(token: string): Response {
  // No inline script and no external asset, so this renders under any CSP.
  const safeToken = token.replace(/[^A-Za-z0-9_-]/g, "")
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in to Legal OS</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#020617; color:#f8fafc;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif }
  main { width:100%; max-width:24rem; padding:2rem; text-align:center }
  h1 { font-size:1.25rem; margin:0 0 .5rem }
  p { color:#94a3b8; font-size:.875rem; line-height:1.6; margin:0 0 1.5rem }
  button { width:100%; padding:.75rem 1rem; font-size:.875rem; font-weight:500;
           color:#fff; background:#3b82f6; border:0; border-radius:.625rem; cursor:pointer }
  button:hover { background:#2563eb }
</style>
</head>
<body>
<main>
  <h1>Confirm your sign in</h1>
  <p>You opened a sign-in link for Legal OS. Confirm to finish signing in. This link can be used once.</p>
  <form method="POST">
    <input type="hidden" name="token" value="${safeToken}">
    <button type="submit">Sign in</button>
  </form>
</main>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  })
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? ""
  const inspection = await inspectMagicLink(token)

  if (!inspection.valid) {
    console.error(`[magic-link] link rejected at confirm step: ${inspection.reason}`)
    return NextResponse.redirect(new URL(INVALID_REDIRECT, request.url))
  }

  return confirmPage(token)
}

/** A HEAD from a link scanner must not touch the token. */
export async function HEAD() {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null)
  const token = (formData?.get("token") as string | null) ?? ""
  const ip = firstForwardedIp(request.headers.get("x-forwarded-for"))
  const userAgent = request.headers.get("user-agent")

  const result = await consumeMagicLink({ token, ip, userAgent })

  if (!result.ok) {
    return NextResponse.redirect(new URL(INVALID_REDIRECT, request.url), { status: 303 })
  }

  await establishSessionForUser(result.user, {
    eventType: MAGIC_LINK_CONSUMED_EVENT,
    ip,
    userAgent,
  })

  // 303 so the browser follows with GET after the form POST.
  return NextResponse.redirect(new URL("/legal", request.url), { status: 303 })
}
