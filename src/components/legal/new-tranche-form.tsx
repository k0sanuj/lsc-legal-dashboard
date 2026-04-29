"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Plus, Loader2 } from "lucide-react"
import { createPaymentCycleAction } from "@/actions/payment-cycles"

type DocOption = { id: string; title: string }

const TRIGGER_TYPES = [
  { value: "on_signing", label: "On signing" },
  { value: "pre_event", label: "Pre-event" },
  { value: "post_event", label: "Post-event" },
  { value: "on_milestone", label: "On milestone" },
  { value: "on_date", label: "On a specific date" },
]

const TERMS_OPTIONS = [
  { value: "NET_30", label: "Net 30" },
  { value: "NET_60", label: "Net 60" },
  { value: "MILESTONE", label: "Milestone" },
  { value: "CUSTOM", label: "Custom" },
]

export function NewTrancheForm({ documents }: { documents: DocOption[] }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      // Server action redirects on completion — close optimistically.
      await createPaymentCycleAction(formData)
      setOpen(false)
    })
  }

  // Hard-block: if no documents have been synced to Finance, disable the
  // trigger entirely. Operators can't create tranches whose parent contract
  // Finance has never seen — Finance would reject them.
  const noEligibleDocs = documents.length === 0

  if (noEligibleDocs) {
    return (
      <button
        type="button"
        disabled
        title="No documents have been synced to Finance yet. Sign a document to create its contract first."
        className="inline-flex items-center justify-center gap-2 rounded-md bg-muted px-4 py-2 text-sm font-medium text-muted-foreground cursor-not-allowed"
      >
        <Plus className="size-4" />
        New Tranche
      </button>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors">
        <Plus className="size-4" />
        New Tranche
      </SheetTrigger>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Payment Tranche</SheetTitle>
        </SheetHeader>

        <p className="mt-2 text-xs text-muted-foreground">
          Tranches are linked to a parent contract by Document id. Finance will
          attach this tranche to the matching contract automatically.
        </p>

        <form action={handleSubmit} className="mt-6 space-y-5">
          {/* Document */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Linked Document *</label>
            <select
              name="documentId"
              required
              aria-label="Document"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select document...</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tranche #</label>
              <Input name="trancheNumber" type="number" min={1} defaultValue={1} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tranche Label</label>
              <Input name="trancheLabel" placeholder="Q1 milestone" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">% of total</label>
              <Input
                name="tranchePercentage"
                type="number"
                step="0.01"
                min={0}
                max={100}
                placeholder="25.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (USD)</label>
              <Input
                name="trancheAmountUsd"
                type="number"
                step="0.01"
                placeholder="50000.00"
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Terms</label>
              <select
                name="terms"
                defaultValue="CUSTOM"
                aria-label="Terms"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {TERMS_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Currency</label>
              <Input name="currency" defaultValue="USD" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (table view)</label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Defaults to the USD tranche amount above.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Trigger Type</label>
            <select
              name="triggerType"
              defaultValue="on_date"
              aria-label="Trigger type"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {TRIGGER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Trigger Date</label>
              <Input name="triggerDate" type="date" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Offset (days)</label>
              <Input name="triggerOffsetDays" type="number" defaultValue={0} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes</label>
            <Textarea name="notes" rows={3} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving + syncing...
                </>
              ) : (
                "Create Tranche"
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
