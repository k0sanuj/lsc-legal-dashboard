"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, Loader2 } from "lucide-react"
import { replayFinanceEventAction } from "@/actions/finance-sync"

export function ReplayButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition()

  function onClick() {
    const fd = new FormData()
    fd.set("id", eventId)
    startTransition(async () => {
      await replayFinanceEventAction(fd)
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onClick}
      disabled={isPending}
      className="h-7 px-2 text-xs"
    >
      {isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <RefreshCw className="size-3" />
      )}
      Replay
    </Button>
  )
}
