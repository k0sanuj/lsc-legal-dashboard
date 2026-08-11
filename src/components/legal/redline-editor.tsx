"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, RotateCcw, Save } from "lucide-react"
import { updateRedlineDraft } from "@/actions/redlines"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type RedlineDraft = {
  proposedText: string
  summary: string
  ourPosition: string
}

export function RedlineEditor({
  redlineId,
  proposedText,
  summary,
  ourPosition,
}: {
  redlineId: string
  proposedText: string
  summary: string | null
  ourPosition: string | null
}) {
  const router = useRouter()
  const [saved, setSaved] = useState<RedlineDraft>({
    proposedText,
    summary: summary ?? "",
    ourPosition: ourPosition ?? "",
  })
  const [draft, setDraft] = useState<RedlineDraft>(saved)
  const [isSaving, startSaveTransition] = useTransition()

  const isDirty =
    draft.proposedText !== saved.proposedText ||
    draft.summary !== saved.summary ||
    draft.ourPosition !== saved.ourPosition

  function updateDraft(patch: Partial<RedlineDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function handleSave() {
    const formData = new FormData()
    formData.set("redlineId", redlineId)
    formData.set("proposedText", draft.proposedText)
    formData.set("summary", draft.summary)
    formData.set("ourPosition", draft.ourPosition)

    startSaveTransition(async () => {
      const result = await updateRedlineDraft(formData)
      if (!result.success) {
        toast.error("Could not save the redline", { description: result.error })
        return
      }
      setSaved(draft)
      toast.success("Redline saved")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Proposed text</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Edit our markup of the counterparty language. The diff below updates after each
            save.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            isDirty
              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          }
        >
          {isDirty ? "Unsaved changes" : "Saved"}
        </Badge>
      </div>

      <textarea
        value={draft.proposedText}
        onChange={(event) => updateDraft({ proposedText: event.target.value })}
        spellCheck={false}
        aria-label="Proposed text"
        className="min-h-[420px] w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="redline-summary" className="text-xs text-muted-foreground">
            Summary
          </label>
          <Input
            id="redline-summary"
            value={draft.summary}
            onChange={(event) => updateDraft({ summary: event.target.value })}
            placeholder="What changed in this round"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="redline-our-position" className="text-xs text-muted-foreground">
            Our position
          </label>
          <Input
            id="redline-our-position"
            value={draft.ourPosition}
            onChange={(event) => updateDraft({ ourPosition: event.target.value })}
            placeholder="Where we can and cannot move"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{draft.proposedText.length}</span>{" "}
          characters
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDraft(saved)}
            disabled={!isDirty || isSaving}
          >
            <RotateCcw className="size-4" />
            Revert
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
