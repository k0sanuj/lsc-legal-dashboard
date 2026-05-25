"use server"

import { getRequestContext, requestMagicLink } from "@/lib/magic-link"

export async function requestMagicLinkAction(
  _prevState: { error?: string; message?: string; debugLink?: string } | null,
  formData: FormData
) {
  const email = formData.get("email") as string

  if (!email) {
    return { error: "Email is required" }
  }

  const context = await getRequestContext()
  const result = await requestMagicLink(email, context)

  if (!result.success) {
    return { error: result.message }
  }

  return {
    message: result.message,
    debugLink: result.debugLink,
  }
}
