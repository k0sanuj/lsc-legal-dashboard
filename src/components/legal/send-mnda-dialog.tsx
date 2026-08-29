"use client"

/**
 * Dashboard door to the MNDA pipeline: same engine the Slack /mnda modal uses
 * (src/lib/mnda.ts), so the two paths cannot drift. Collects the counterparty,
 * cc list, term, and effective date, and reports the send outcome inline with
 * the counterparty signing link.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FileSignature, Loader2 } from "lucide-react"
import { sendMndaAction } from "@/actions/mnda"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const SELECT_CLASSES =
  "h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

/** Today as YYYY-MM-DD in Dubai time, matching the Slack modal's default. */
function todayInDubai(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date())
}

export function SendMndaDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<"individual" | "business">("individual")
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set("templateKind", kind)

    startTransition(async () => {
      const result = await sendMndaAction(formData)
      if (result.success) {
        toast.success("MNDA sent for signature", {
          description: "The signing invitation has been emailed to the counterparty.",
        })
        setOpen(false)
        router.refresh()
        router.push(`/legal/documents/${result.documentId}`)
      } else {
        toast.error("MNDA not sent", { description: result.error })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <FileSignature className="size-4" />
        Send MNDA
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send an MNDA for signature</DialogTitle>
          <DialogDescription>
            Generates the agreement from the FSP template, files it as a document, and emails the
            signing invitation. Countersigned by the configured FSP signatory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="mnda-kind" className="text-sm font-medium text-muted-foreground">
              Template
            </label>
            <select
              id="mnda-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as "individual" | "business")}
              className={SELECT_CLASSES}
            >
              <option value="individual">Individual (passport number)</option>
              <option value="business">Business (company and address)</option>
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="mnda-name" className="text-sm font-medium text-muted-foreground">
                {kind === "business" ? "Representative name" : "Signer name"}
              </label>
              <Input id="mnda-name" name="counterpartyName" required placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <label htmlFor="mnda-email" className="text-sm font-medium text-muted-foreground">
                Signer email
              </label>
              <Input
                id="mnda-email"
                name="counterpartyEmail"
                type="email"
                required
                placeholder="name@company.com"
              />
            </div>
          </div>

          {kind === "business" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="mnda-company" className="text-sm font-medium text-muted-foreground">
                  Company
                </label>
                <Input id="mnda-company" name="counterpartyCompany" required placeholder="Company legal name" />
              </div>
              <div className="space-y-2">
                <label htmlFor="mnda-address" className="text-sm font-medium text-muted-foreground">
                  Registered address
                </label>
                <Input id="mnda-address" name="counterpartyAddress" required placeholder="Street, city, country" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="mnda-passport" className="text-sm font-medium text-muted-foreground">
                Passport number (optional)
              </label>
              <Input
                id="mnda-passport"
                name="passportNumber"
                placeholder="Leave blank and the signer fills it in while signing"
              />
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="mnda-cc" className="text-sm font-medium text-muted-foreground">
              CC emails (optional)
            </label>
            <Input id="mnda-cc" name="ccEmails" placeholder="Comma separated; they receive the signed copy" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="mnda-term" className="text-sm font-medium text-muted-foreground">
                Term
              </label>
              <select id="mnda-term" name="termYears" defaultValue="2" className={SELECT_CLASSES}>
                <option value="1">1 year</option>
                <option value="2">2 years</option>
                <option value="3">3 years</option>
                <option value="5">5 years</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="mnda-date" className="text-sm font-medium text-muted-foreground">
                Effective date
              </label>
              <Input id="mnda-date" name="effectiveDate" type="date" defaultValue={todayInDubai()} required />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <FileSignature className="size-4" />}
              {isPending ? "Generating & sending..." : "Send for signature"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
