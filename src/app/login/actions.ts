"use server"

import { redirect } from "next/navigation"
import { authenticateWithPassword } from "@/lib/auth"

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
