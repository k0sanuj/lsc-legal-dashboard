"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react"
import { transitionRedline } from "@/actions/redlines"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { RedlineStatus } from "@/generated/prisma/client"

const STATUS_OPTIONS: RedlineStatus[] = [
  "DRAFT",
  "INTERNAL_REVIEW",
  "SENT_TO_COUNTERPARTY",
  "COUNTERPARTY_RESPONDED",
  "ACCEPTED",
  "REJECTED",
  "SUPERSEDED",
]

const STATUS_LABELS: Record<RedlineStatus, string> = {
  DRAFT: "Draft",
  INTERNAL_REVIEW: "Internal review",
  SENT_TO_COUNTERPARTY: "Sent to counterparty",
  COUNTERPARTY_RESPONDED: "Counterparty responded",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
}

export function RedlineStatusControl({
  redlineId,
  status,
}: {
  redlineId: string
  status: RedlineStatus
}) {
  const router = useRouter()
  const [nextStatus, setNextStatus] = useState<RedlineStatus>(status)
  const [notes, setNotes] = useState("")
  const [isPending, startTransition] = useTransition()

  const notifiesTracker = nextStatus === "SENT_TO_COUNTERPARTY" && status !== nextStatus

  function handleApply() {
    startTransition(async () => {
      const result = await transitionRedline(redlineId, nextStatus, notes.trim() || undefined)
      if (!result.success) {
        toast.error("Could not move the redline", { description: result.error })
        return
      }
      setNotes("")
      toast.success(`Redline moved to ${STATUS_LABELS[nextStatus]}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/50 bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">Status</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Currently {STATUS_LABELS[status]}.
        </p>
      </div>

      <select
        value={nextStatus}
        onChange={(event) => setNextStatus(event.target.value as RedlineStatus)}
        aria-label="Redline status"
        className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {STATUS_LABELS[option]}
          </option>
        ))}
      </select>

      <Input
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Transition notes (optional)"
        autoComplete="off"
      />

      {notifiesTracker ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-3.5" />
            This posts to the legal tracker channel
          </div>
          <p className="mt-1 text-amber-200/80">
            Moving to Sent to counterparty notifies the tracker channel so the negotiation
            round is visible outside this dashboard.
          </p>
        </div>
      ) : null}

      <Button
        type="button"
        className="w-full"
        size="sm"
        onClick={handleApply}
        disabled={isPending || nextStatus === status}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ArrowRight className="size-4" />
        )}
        Apply status
      </Button>
    </div>
  )
}
