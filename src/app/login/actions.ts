"use server"

import { authenticateWithPassword } from "@/lib/auth"
import { redirect } from "next/navigation"

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData
) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Email and password are required" }
  }

  const result = await authenticateWithPassword(email, password)
  if (!result.success) {
    return { error: result.error ?? "Authentication failed" }
  }

  redirect("/legal")
}
