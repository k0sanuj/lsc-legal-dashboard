"use client"

/**
 * DELIBERATE FALLBACK. Magic link is the primary login path; this secondary
 * password form stays only until magic-link delivery is verified in production,
 * because Mailgun credentials are not set there yet. To retire it, delete this
 * file, drop loginWithPasswordAction from ./actions.ts and authenticateWithPassword
 * from src/lib/auth.ts, then remove PasswordLoginForm from ./page.tsx.
 */

import { useActionState, useState } from "react"
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
  const [isRevealed, setIsRevealed] = useState(false)
  const error = state?.error ?? initialError

  if (!isRevealed) {
    return (
      <div className="text-center">
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setIsRevealed(true)}
        >
          Sign in with a password instead
        </Button>
      </div>
    )
  }

  return (
    <form
      action={formAction}
      className="space-y-4"
      name="login"
      autoComplete="on"
      aria-label="Sign in to Legal OS"
    >
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
          placeholder="anuj@futureofsports.io"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          enterKeyHint="next"
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
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
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
