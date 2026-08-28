"use client"

// Full-screen dialog around the field editor. Loads the document's pending
// signers, hosts the editor, and on "Save & send" serializes the placement
// into the createOpenSignSignatureRequest FormData contract:
//   documentId   string
//   widgetsJson  JSON Record<lowercased signer email, OpenSignFieldPlacement[]>
//   pagesJson    JSON OpenSignPageDims[] ({ pageNumber, widthPt, heightPt })

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Send } from "lucide-react"
import { createOpenSignSignatureRequest } from "@/actions/opensign"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldEditor, type FieldEditorHandle } from "./field-editor"
import type { EditorField, EditorPageDims, EditorSigner } from "./types"
import { buildWidgetsPayload, signerColor } from "./types"

interface FieldEditorDialogProps {
  documentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FieldEditorDialog({
  documentId,
  open,
  onOpenChange,
}: FieldEditorDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [signers, setSigners] = useState<EditorSigner[] | null>(null)
  const [signersError, setSignersError] = useState<string | null>(null)
  const [fieldCounts, setFieldCounts] = useState<Record<string, number>>({})
  const [totalFields, setTotalFields] = useState(0)

  // Escape or a backdrop click would silently destroy every placed field;
  // placements are not persisted anywhere until Save & send. Closing with work
  // in progress therefore asks first. Deliberate closes (Cancel button, the
  // post-send close) call onOpenChange directly.
  const handleOpenChange = (next: boolean) => {
    if (!next && totalFields > 0) {
      const discard = window.confirm(
        `Discard ${totalFields} placed field${totalFields === 1 ? "" : "s"}? They are not saved.`
      )
      if (!discard) return
    }
    onOpenChange(next)
  }
  const editorRef = useRef<FieldEditorHandle | null>(null)

  // Pending signers are loaded when the dialog opens, so the button that
  // mounts this dialog needs nothing beyond the document id.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSigners(null)
    setSignersError(null)
    setFieldCounts({})
    setTotalFields(0)
    void (async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/signers`)
        const payload = (await response.json()) as {
          signers?: EditorSigner[]
          error?: string
        }
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
        if (!cancelled) setSigners(payload.signers ?? [])
      } catch (error) {
        console.error("Failed to load pending signers:", error)
        if (!cancelled) {
          setSignersError("Could not load the pending signers for this document.")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, documentId])

  const handleFieldsChange = useCallback((fields: EditorField[]) => {
    const counts: Record<string, number> = {}
    for (const field of fields) {
      const email = field.signerEmail.toLowerCase()
      counts[email] = (counts[email] ?? 0) + 1
    }
    setFieldCounts(counts)
    setTotalFields(fields.length)
  }, [])

  const handleSave = useCallback(
    (fields: EditorField[], pages: EditorPageDims[]) => {
      if (fields.length === 0) {
        toast.error("Place at least one field before sending.")
        return
      }
      const formData = new FormData()
      formData.set("documentId", documentId)
      formData.set("widgetsJson", JSON.stringify(buildWidgetsPayload(fields)))
      formData.set("pagesJson", JSON.stringify(pages))

      startTransition(async () => {
        const result = await createOpenSignSignatureRequest(formData)
        if (result.success) {
          toast.success("Signature request sent", {
            description: "Fields placed and sent via OpenSign.",
          })
          onOpenChange(false)
          router.refresh()
          return
        }
        toast.error("Failed to send signature request", {
          description: result.error ?? "An unexpected error occurred",
        })
      })
    },
    [documentId, onOpenChange, router]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[94vh] w-[96vw] max-w-none flex-col gap-3 p-4 sm:max-w-none"
      >
        <DialogHeader>
          <DialogTitle>Place signature fields</DialogTitle>
          <DialogDescription>
            Drop fields onto the document for each pending signer, then send it
            through OpenSign.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          {signersError ? (
            <p className="text-sm text-red-400">{signersError}</p>
          ) : !signers ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : signers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This document has no pending signers.
            </p>
          ) : (
            <FieldEditor
              documentId={documentId}
              signers={signers}
              initialFields={[]}
              onSave={handleSave}
              onFieldsChange={handleFieldsChange}
              handleRef={editorRef}
            />
          )}
        </div>

        <DialogFooter className="items-center">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {(signers ?? []).map((signer, index) => (
              <span
                key={signer.email}
                className="flex items-center gap-1.5 rounded-lg border border-border/50 px-2 py-1 text-xs text-muted-foreground"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: signerColor(index) }}
                />
                {signer.name}
                <span className="font-mono tabular-nums text-foreground">
                  {fieldCounts[signer.email.toLowerCase()] ?? 0}
                </span>
              </span>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => editorRef.current?.save()}
            disabled={isPending || !signers || signers.length === 0 || totalFields === 0}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Save &amp; send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
