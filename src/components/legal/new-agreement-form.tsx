"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Plus, Loader2 } from "lucide-react"
import { createDocument } from "@/actions/documents"
import { useRouter } from "next/navigation"

const ENTITIES = [
  { value: "LSC", label: "League Sports Co" },
  { value: "TBR", label: "Team Blue Rising" },
  { value: "FSP", label: "Future of Sports" },
  { value: "BOWLING", label: "Bowl & Darts" },
  { value: "SQUASH", label: "Squash" },
  { value: "BASKETBALL", label: "Basketball" },
  { value: "BEER_PONG", label: "Ping Pong" },
  { value: "FOUNDATION", label: "Foundation Events" },
]

const CATEGORIES = [
  "SPONSORSHIP", "VENDOR", "EMPLOYMENT", "ESOP", "NDA", "ARENA_HOST",
  "TERMS_OF_SERVICE", "WAIVER", "IP_ASSIGNMENT", "PILOT_PROGRAM",
  "BOARD_RESOLUTION", "POLICY", "MSA", "SLA", "CONTRACTOR",
  "REFERRAL_PARTNER", "VENUE", "PRODUCTION_PARTNER", "CLICKWRAP",
  "REGISTERED_OFFICE", "SAAS_SUBSCRIPTION", "INSURANCE",
  "GOVERNMENT_FILING", "LITIGATION_DOC", "SUBSIDY_GRANT", "OTHER",
]

function categoryLabel(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function NewAgreementForm() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createDocument(formData)
      if (result.success) {
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error ?? "Failed to create agreement")
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
      >
        <Plus className="size-4" />
        New Agreement
      </SheetTrigger>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Agreement</SheetTitle>
        </SheetHeader>

        <form action={handleSubmit} className="mt-6 space-y-5">
          {/* Entity */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Entity *</label>
            <select
              name="entity"
              required
              aria-label="Entity"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select entity...</option>
              {ENTITIES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Category *</label>
            <select
              name="category"
              required
              aria-label="Category"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select category...</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabel(cat)}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Title *</label>
            <Input name="title" required placeholder="Agreement title..." />
          </div>

          {/* Counterparty */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Counterparty</label>
            <Input name="counterparty" placeholder="Counterparty name..." />
          </div>

          {/* Financial Impact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Value (AED)</label>
              <Input
                name="value"
                type="number"
                step="0.01"
                placeholder="0.00"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Expiry Date</label>
              <Input name="expiry_date" type="date" />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              name="notes"
              placeholder="Additional notes..."
              rows={3}
            />
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Upload Document</label>
            <Input name="file" type="file" accept=".pdf,.doc,.docx" />
            <p className="text-xs text-muted-foreground">
              PDF, DOC, or DOCX — max 10MB
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
              {error}
            </div>
          )}

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
                  Creating...
                </>
              ) : (
                "Create Agreement"
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
