"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Upload, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

interface FileUploadProps {
  action: (formData: FormData) => Promise<{ success: boolean; error?: string }>
  entityId: string
  /** Hidden field name for the entity ID (e.g. "documentId", "policyId") */
  entityIdField?: string
  /** Extra hidden fields to include in the form data */
  extraFields?: Record<string, string>
  label?: string
  accept?: string
}

export function FileUpload({
  action,
  entityId,
  entityIdField = "documentId",
  extraFields,
  label = "Upload File",
  accept = ".pdf,.doc,.docx,.png,.jpg,.jpeg",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [fileName, setFileName] = useState<string | null>(null)

  function handleClick() {
    inputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)

    const formData = new FormData()
    formData.set("file", file)
    formData.set(entityIdField, entityId)

    if (extraFields) {
      for (const [key, value] of Object.entries(extraFields)) {
        formData.set(key, value)
      }
    }

    startTransition(async () => {
      const result = await action(formData)
      if (result.success) {
        toast.success("File uploaded successfully")
        setFileName(null)
      } else {
        toast.error(result.error ?? "Upload failed")
      }
      // Reset input so the same file can be selected again
      if (inputRef.current) inputRef.current.value = ""
    })
  }

  return (
    <div className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {isPending ? "Uploading..." : label}
      </Button>
      {isPending && fileName && (
        <span className="text-xs text-muted-foreground truncate max-w-48">
          {fileName}
        </span>
      )}
    </div>
  )
}
