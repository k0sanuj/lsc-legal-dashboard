"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { ExternalLink, Trash2, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface FileDisplayProps {
  fileUrl: string | null
  documentId: string
  onDelete?: (documentId: string) => Promise<{ success: boolean; error?: string }>
  label?: string
}

export function FileDisplay({
  fileUrl,
  documentId,
  onDelete,
  label = "Attached File",
}: FileDisplayProps) {
  const [isPending, startTransition] = useTransition()

  if (!fileUrl) {
    return (
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5" />
        No file attached
      </span>
    )
  }

  // Extract display name from URL
  const urlPath = fileUrl.split("/").pop() ?? "document"
  // Remove timestamp prefix (e.g. "1711900000000-filename.pdf" → "filename.pdf")
  const displayName = urlPath.replace(/^\d+-/, "").replace(/_/g, " ")

  function handleDelete() {
    if (!onDelete) return
    if (!window.confirm("Delete this file? This cannot be undone.")) return

    startTransition(async () => {
      const result = await onDelete(documentId)
      if (result.success) {
        toast.success("File deleted")
      } else {
        toast.error(result.error ?? "Delete failed")
      }
    })
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5">
      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-sm truncate max-w-64" title={displayName}>
        {displayName}
      </span>
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/80 transition-colors"
        title="Open file"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleDelete}
          disabled={isPending}
          className="text-muted-foreground hover:text-destructive"
          title="Delete file"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      )}
    </div>
  )
}
