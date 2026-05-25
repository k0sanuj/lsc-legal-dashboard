"use client"

import { useState, useTransition } from "react"
import { uploadLitigationDocument } from "@/actions/litigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { DocumentAnalysisSummaryDrawer } from "@/components/legal/document-analysis-summary"
import { Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

export function LitigationDocumentUploadForm({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [analysisTargetId, setAnalysisTargetId] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("caseId", caseId)

    startTransition(async () => {
      const result = await uploadLitigationDocument(formData)
      if (result.success) {
        toast.success("Litigation document uploaded")
        form.reset()
        setOpen(false)
        if (result.documentId) setAnalysisTargetId(result.documentId)
      } else {
        toast.error(result.error ?? "Upload failed")
      }
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          <Upload className="h-3.5 w-3.5" />
          Upload Document
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Litigation Document</DialogTitle>
            <DialogDescription>
              Attach filings, evidence, correspondence, or counsel documents to this case.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Title *</label>
              <Input name="title" placeholder="e.g. Statement of Claim" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Document Type</label>
              <Input name="docType" placeholder="e.g. filing, evidence, correspondence" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">File *</label>
              <Input name="file" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.md" required />
              <p className="text-xs text-muted-foreground">
                Uploaded files are analyzed for dates, risks, gaps, and next steps.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Upload
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {analysisTargetId ? (
        <DocumentAnalysisSummaryDrawer
          documentId={analysisTargetId}
          targetType="litigation"
          autoOpen
          showTrigger={false}
        />
      ) : null}
    </>
  )
}
