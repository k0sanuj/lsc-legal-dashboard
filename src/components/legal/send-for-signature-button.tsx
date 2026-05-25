"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createOpenSignSignatureRequest } from "@/actions/opensign"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Loader2, PenTool } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface OpenSignPrepButtonProps {
  documentId: string
  disabled?: boolean
  pendingCount: number
  compact?: boolean
  stopPropagation?: boolean
}

export function OpenSignPrepButton({
  documentId,
  disabled = false,
  pendingCount,
  compact = false,
  stopPropagation = false,
}: OpenSignPrepButtonProps) {
  const [open, setOpen] = useState(false)
  const [widgetsJson, setWidgetsJson] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit() {
    const formData = new FormData()
    formData.set("documentId", documentId)
    if (widgetsJson.trim()) formData.set("widgetsJson", widgetsJson)

    startTransition(async () => {
      const result = await createOpenSignSignatureRequest(formData)
      if (result.success) {
        toast.success("Signature request sent", {
          description: `${pendingCount} signer${pendingCount === 1 ? "" : "s"} sent via OpenSign`,
        })
        setOpen(false)
        router.refresh()
        return
      }

      toast.error("Failed to send signature request", {
        description: result.error ?? "An unexpected error occurred",
      })
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            disabled={disabled || isPending || pendingCount === 0}
            className={cn(
              !compact && "bg-violet-600 text-white hover:bg-violet-700 border-violet-500/20"
            )}
            variant={compact ? "outline" : "default"}
            size={compact ? "xs" : "sm"}
            onClick={(event) => {
              if (stopPropagation) event.stopPropagation()
            }}
            onPointerDown={(event) => {
              if (stopPropagation) event.stopPropagation()
            }}
          />
        }
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <PenTool className="h-3.5 w-3.5" />
        )}
        {compact ? "Prepare" : `Prepare in OpenSign (${pendingCount} pending)`}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prepare in OpenSign</DialogTitle>
          <DialogDescription>
            Send this document through OpenSign. Optional widget JSON can override the default first-page signature and date fields.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">OpenSign Widgets JSON</label>
          <Textarea
            value={widgetsJson}
            onChange={(event) => setWidgetsJson(event.target.value)}
            placeholder='Optional: {"signer@example.com":[{"type":"signature","page":1,"x":340,"y":680,"w":170,"h":36}]}'
            rows={7}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to place required signature and date widgets for each pending signer.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send via OpenSign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const SendForSignatureButton = OpenSignPrepButton
export const DropboxSignPrepButton = OpenSignPrepButton
