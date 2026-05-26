"use client"

import { useActionState } from "react"
import { LockKeyhole } from "lucide-react"
import { loginWithPasswordAction } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type PasswordLoginState = {
  error?: string
} | null

export function PasswordLoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction, isPending] = useActionState<PasswordLoginState, FormData>(
    loginWithPasswordAction,
    null
  )
  const error = state?.error ?? initialError

  return (
    <form action={formAction} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-muted-foreground">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@leaguesportsco.com"
          required
          autoComplete="email"
          className="bg-card border-border"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-muted-foreground">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="bg-card border-border"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        <LockKeyhole className="h-4 w-4" />
        {isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  )
}
