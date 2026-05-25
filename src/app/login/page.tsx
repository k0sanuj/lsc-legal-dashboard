import { Scale } from "lucide-react"
import { MagicLinkLoginForm } from "./magic-link-login-form"

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const initialError =
    params.error === "invalid-link"
      ? "That sign-in link is invalid, expired, or already used."
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

        <MagicLinkLoginForm initialError={initialError} />

        <p className="text-center text-xs text-muted-foreground/60">
          LSC Operations Platform v3.1
        </p>
      </div>
    </div>
  )
}
