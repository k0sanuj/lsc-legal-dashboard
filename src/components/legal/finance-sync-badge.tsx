"use client"

import { useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, AlertCircle, Clock, RefreshCw, Loader2 } from "lucide-react"

interface Props {
  status: string | null // "synced" | "pending" | "failed" | null
  lastPostedAt: Date | null
  errorMessage: string | null
  recordId: string
  resyncAction: (formData: FormData) => Promise<void>
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function FinanceSyncBadge({
  status,
  lastPostedAt,
  errorMessage,
  recordId,
  resyncAction,
}: Props) {
  const [isPending, startTransition] = useTransition()

  function onResync() {
    const fd = new FormData()
    fd.set("id", recordId)
    startTransition(async () => {
      await resyncAction(fd)
    })
  }

  if (status === "synced") {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <span className="text-xs text-muted-foreground">
          {lastPostedAt ? formatDate(lastPostedAt) : "Synced"}
        </span>
      </div>
    )
  }

  if (status === "failed") {
    return (
      <div className="flex items-center justify-center gap-2">
        <span title={errorMessage ?? "Sync failed"}>
          <AlertCircle className="h-4 w-4 text-rose-500" />
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={onResync}
          disabled={isPending}
          className="h-6 px-2 text-xs"
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          Retry
        </Button>
      </div>
    )
  }

  if (status === "pending") {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <Clock className="h-4 w-4 text-amber-500" />
        <span className="text-xs text-muted-foreground">Pending</span>
      </div>
    )
  }

  return <span className="text-xs text-muted-foreground">—</span>
}
