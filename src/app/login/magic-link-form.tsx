"use client"

import { useActionState } from "react"
import { MailCheck, Send } from "lucide-react"
import { requestMagicLinkAction } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type MagicLinkState = {
  success?: boolean
  error?: string
  message?: string
} | null

export function MagicLinkForm({ initialError }: { initialError?: string }) {
  const [state, formAction, isPending] = useActionState<MagicLinkState, FormData>(
    requestMagicLinkAction,
    null
  )
  const error = state?.error ?? initialError

  if (state?.success) {
    return (
      <div className="space-y-2 rounded-xl border border-border/50 bg-card p-4 text-center">
        <MailCheck className="mx-auto h-5 w-5 text-primary" />
        <p className="text-sm font-medium">Check your inbox</p>
        <p className="text-xs text-muted-foreground">{state.message}</p>
      </div>
    )
  }

  return (
    <form
      action={formAction}
      className="space-y-4"
      name="magic-link"
      aria-label="Email me a sign-in link"
    >
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="magic-email"
          className="text-sm font-medium text-muted-foreground"
        >
          Work email
        </label>
        <Input
          id="magic-email"
          name="email"
          type="email"
          placeholder="anuj@futureofsports.io"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          enterKeyHint="send"
          className="bg-card border-border"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        <Send className="h-4 w-4" />
        {isPending ? "Sending link..." : "Email me a sign-in link"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        The link expires in 15 minutes and can be used once.
      </p>
    </form>
  )
}
