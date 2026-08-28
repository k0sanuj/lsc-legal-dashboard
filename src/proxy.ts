import { NextRequest, NextResponse } from "next/server"
import { verifySessionToken } from "@/lib/session"

const PUBLIC_PATHS = ["/login"]

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Skip static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next()
  }

  // Skip cron + webhook endpoints; they authenticate via bearer token /
  // shared secret, not user sessions. Without this, Vercel cron invocations
  // get redirected to /login and the handler never runs.
  if (
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/webhooks/")
  ) {
    return NextResponse.next()
  }

  // Skip the Slack control surface; those routes verify the Slack request
  // signature and authorise against the SLACK_LEGAL_ADMINS allowlist, not user
  // sessions. Without this, Slack's POSTs get redirected to /login and every
  // slash command times out.
  if (pathname.startsWith("/api/slack/")) {
    return NextResponse.next()
  }

  // Skip the magic-link callback; it authenticates with a single-use token in
  // the query string and is the request that creates the session. Without this,
  // the visitor arrives with no cookie, gets redirected to /login, and no magic
  // link can ever work.
  if (pathname.startsWith("/api/auth/magic")) {
    return NextResponse.next()
  }

  const token = request.cookies.get("lsc_legal_session")?.value
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const session = await verifySessionToken(token)
  if (!session) {
    const response = NextResponse.redirect(new URL("/login", request.url))
    response.cookies.delete("lsc_legal_session")
    return response
  }

  return NextResponse.next()
}
