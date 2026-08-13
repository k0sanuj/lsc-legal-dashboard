"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FileDiff, Loader2 } from "lucide-react"
import { createRedlineFromDocument } from "@/actions/redlines"
import { formatDate } from "@/lib/format"
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
import { Input } from "@/components/ui/input"

interface CreateRedlineDialogProps {
  documentId: string
  documentTitle: string
  counterparty?: string | null
  versions: Array<{ id: string; version_number: number; created_at: Date }>
  hasFile: boolean
  compact?: boolean
}

export function CreateRedlineDialog({
  documentId,
  documentTitle,
  counterparty,
  versions,
  hasFile,
  compact,
}: CreateRedlineDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [counterpartyName, setCounterpartyName] = useState(counterparty ?? "")
  const [versionId, setVersionId] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    const formData = new FormData()
    formData.set("documentId", documentId)
    if (title.trim()) formData.set("title", title.trim())
    if (counterpartyName.trim()) formData.set("counterparty", counterpartyName.trim())
    if (versionId) formData.set("versionId", versionId)

    startTransition(async () => {
      const result = await createRedlineFromDocument(formData)
      if (!result.success) {
        toast.error("Could not start the redline", { description: result.error })
        return
      }
      setOpen(false)
      setTitle("")
      setVersionId("")
      toast.success("Redline created")
      router.push(`/legal/redlines/${result.redlineId}`)
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              disabled={!hasFile}
              variant={compact ? "outline" : "default"}
              size={compact ? "xs" : "sm"}
            />
          }
        >
          <FileDiff className={compact ? "size-3.5" : "size-4"} />
          {compact ? "Redline" : "Start redline"}
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Start a redline</DialogTitle>
            <DialogDescription>
              Extracts the source text for {documentTitle} and opens a new negotiation round.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="redline-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="redline-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={`Redline of ${documentTitle}`}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="redline-counterparty" className="text-sm font-medium">
                Counterparty
              </label>
              <Input
                id="redline-counterparty"
                value={counterpartyName}
                onChange={(event) => setCounterpartyName(event.target.value)}
                placeholder="Who we are negotiating with"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="redline-version" className="text-sm font-medium">
                Source
              </label>
              <select
                id="redline-version"
                value={versionId}
                onChange={(event) => setVersionId(event.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Current file</option>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    v{version.version_number} · {formatDate(version.created_at)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDiff className="size-4" />
              )}
              {isPending ? "Extracting..." : "Create redline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!hasFile ? (
        <p className="text-xs text-muted-foreground">
          Attach a file to this document first. A redline needs a source file to extract text
          from.
        </p>
      ) : null}
    </div>
  )
}
