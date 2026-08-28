"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createOpenSignSignatureRequest } from "@/actions/opensign"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FieldEditorDialog } from "@/components/legal/field-editor/field-editor-dialog"
import { Loader2, PenTool } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface OpenSignPrepButtonProps {
  documentId: string
  disabled?: boolean
  pendingCount: number
  openSignConfigured?: boolean
  compact?: boolean
  stopPropagation?: boolean
}

export function OpenSignPrepButton({
  documentId,
  disabled = false,
  pendingCount,
  openSignConfigured = true,
  compact = false,
  stopPropagation = false,
}: OpenSignPrepButtonProps) {
  const [open, setOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleQuickSend() {
    const formData = new FormData()
    formData.set("documentId", documentId)

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

  function handleOpenEditor() {
    setOpen(false)
    setEditorOpen(true)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              disabled={disabled || isPending || pendingCount === 0 || !openSignConfigured}
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
              Review the document and place each signer&apos;s fields, or send it
              straight away with the default signature and date placement.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
            <p className="font-medium">{pendingCount} pending signer{pendingCount === 1 ? "" : "s"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Review &amp; place fields opens the document so you can position each
              signer&apos;s fields before sending.
            </p>
            {!openSignConfigured ? (
              <p className="mt-2 text-xs text-amber-300">
                OpenSign env vars are not configured yet.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleQuickSend}
              disabled={isPending || !openSignConfigured}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send with default placement
            </Button>
            <Button
              type="button"
              onClick={handleOpenEditor}
              disabled={isPending || !openSignConfigured}
            >
              Review &amp; place fields
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FieldEditorDialog
        documentId={documentId}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
    </>
  )
}

export const SendForSignatureButton = OpenSignPrepButton
export const DropboxSignPrepButton = OpenSignPrepButton
