"use client"

import { useActionState } from "react"
import { ExternalLink, Mail } from "lucide-react"
import { requestMagicLinkAction } from "./actions"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type MagicLinkLoginFormProps = {
  initialError?: string
}

type MagicLinkState = {
  error?: string
  message?: string
  debugLink?: string
} | null

export function MagicLinkLoginForm({ initialError }: MagicLinkLoginFormProps) {
  const [state, formAction, isPending] = useActionState<MagicLinkState, FormData>(
    requestMagicLinkAction,
    null
  )
  const error = state?.error ?? initialError

  return (
    <form action={formAction} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {state?.message && !state.error && (
        <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          {state.message}
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
          placeholder="you@leaguesports.co"
          required
          autoComplete="email"
          className="bg-card border-border"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        <Mail className="h-4 w-4" />
        {isPending ? "Sending link..." : "Send sign-in link"}
      </Button>

      {state?.debugLink && (
        <a
          href={state.debugLink}
          className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
        >
          <ExternalLink className="h-4 w-4" />
          Open local debug link
        </a>
      )}
    </form>
  )
}
