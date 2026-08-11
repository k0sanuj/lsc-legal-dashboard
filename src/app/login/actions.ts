"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { authenticateWithPassword } from "@/lib/auth"
import {
  MAGIC_LINK_TTL_MINUTES,
  firstForwardedIp,
  requestMagicLink,
  resolveAppBaseUrl,
} from "@/lib/magic-link"

// Same answer for every address, whether it is allowlisted, unknown, inactive or
// rate limited. Anything more specific would enumerate users.
const MAGIC_LINK_NEUTRAL_MESSAGE =
  `If that address has dashboard access, a sign-in link is on its way. The link expires in ${MAGIC_LINK_TTL_MINUTES} minutes and can be used once.`

export async function requestMagicLinkAction(
  _prevState: { success?: boolean; error?: string; message?: string } | null,
  formData: FormData
): Promise<{ success: boolean; error?: string; message?: string }> {
  const email = formData.get("email") as string | null

  if (!email?.trim()) {
    return { success: false, error: "Email is required" }
  }

  const headerList = await headers()

  try {
    // The outcome is deliberately discarded. requestMagicLink logs the real
    // reason to the server and to AuthAccessEvent.
    await requestMagicLink({
      email,
      ip: firstForwardedIp(headerList.get("x-forwarded-for")),
      userAgent: headerList.get("user-agent"),
      baseUrl: resolveAppBaseUrl(),
    })
  } catch (error) {
    console.error("[login] magic link request failed:", error)
  }

  return { success: true, message: MAGIC_LINK_NEUTRAL_MESSAGE }
}

/**
 * DELIBERATE FALLBACK. Magic link is the primary path; this action stays only
 * until magic-link delivery is verified in production. To retire it, delete
 * src/app/login/password-login-form.tsx and this action.
 */
export async function loginWithPasswordAction(
  _prevState: { error?: string } | null,
  formData: FormData
) {
  const email = formData.get("email") as string | null
  const password = formData.get("password") as string | null

  if (!email || !password) {
    return { error: "Email and password are required" }
  }

  const result = await authenticateWithPassword(email, password)
  if (!result.success) {
    return { error: result.error ?? "Invalid email or password" }
  }

  redirect("/legal")
}
