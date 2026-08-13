import { Scale } from "lucide-react"
import { MagicLinkForm } from "./magic-link-form"

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>
}

// A Map rather than an object literal: `?error=constructor` on a plain object
// resolves an inherited property, and a non-string error crashes the render.
const ERROR_MESSAGES = new Map<string, string>([
  ["unauthorized", "You are not authorized to access that page."],
  [
    "magic_link_invalid",
    "That sign-in link is no longer valid. Request a new one below.",
  ],
])

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const errorCode = typeof params.error === "string" ? params.error : undefined
  const initialError = errorCode
    ? (ERROR_MESSAGES.get(errorCode) ?? "Sign in could not be completed.")
    : undefined

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-4">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
            <Scale className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Legal OS</h1>
          <p className="text-sm text-muted-foreground">
            League Sports Co - Legal & Compliance
          </p>
        </div>

        <MagicLinkForm initialError={initialError} />

        <p className="text-center text-xs text-muted-foreground/60">
          LSC Operations Platform v3.1
        </p>
      </div>
    </div>
  )
}
