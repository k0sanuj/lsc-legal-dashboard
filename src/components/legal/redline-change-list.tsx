"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Loader2, Plus, Trash2, Undo2, X } from "lucide-react"
import {
  addRedlineChange,
  deleteRedlineChange,
  setRedlineChangeStatus,
} from "@/actions/redlines"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type {
  RedlineChangeStatus,
  RedlineChangeType,
  RedlineParty,
} from "@/generated/prisma/client"

export interface RedlineChangeRow {
  id: string
  position: number
  clause_ref: string | null
  change_type: RedlineChangeType
  original_text: string | null
  proposed_text: string | null
  rationale: string | null
  risk_level: string | null
  status: RedlineChangeStatus
  raised_by: RedlineParty
  resolved_by: string | null
  resolved_at: Date | null
}

const CHANGE_TYPES: RedlineChangeType[] = [
  "INSERTION",
  "DELETION",
  "REPLACEMENT",
  "COMMENT",
]

const CHANGE_TYPE_COLORS: Record<RedlineChangeType, string> = {
  INSERTION: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  DELETION: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  REPLACEMENT: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  COMMENT: "bg-slate-400/10 text-slate-400 border-slate-400/20",
}

const CHANGE_STATUS_COLORS: Record<RedlineChangeStatus, string> = {
  OPEN: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  ACCEPTED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  REJECTED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  COUNTERED: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  WITHDRAWN: "bg-slate-500/10 text-slate-500 border-slate-500/20",
}

const PARTY_LABELS: Record<RedlineParty, string> = {
  US: "Raised by us",
  COUNTERPARTY: "Raised by counterparty",
}

const PARTY_COLORS: Record<RedlineParty, string> = {
  US: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  COUNTERPARTY: "bg-amber-500/10 text-amber-400 border-amber-500/20",
}

const RISK_LEVELS = ["low", "medium", "high"]

const RISK_COLORS: Record<string, string> = {
  low: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  high: "bg-rose-500/10 text-rose-400 border-rose-500/20",
}

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

export function RedlineChangeList({
  redlineId,
  changes,
}: {
  redlineId: string
  changes: RedlineChangeRow[]
}) {
  const router = useRouter()
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [isResolving, startResolveTransition] = useTransition()
  const [isAdding, startAddTransition] = useTransition()

  const openCount = changes.filter((change) => change.status === "OPEN").length

  function handleStatus(changeId: string, status: RedlineChangeStatus) {
    setResolvingId(changeId)
    startResolveTransition(async () => {
      const result = await setRedlineChangeStatus(changeId, status)
      setResolvingId(null)
      if (!result.success) {
        toast.error("Could not update the change", { description: result.error })
        return
      }
      toast.success("Change updated")
      router.refresh()
    })
  }

  function handleDelete(changeId: string) {
    setResolvingId(changeId)
    startResolveTransition(async () => {
      const result = await deleteRedlineChange(changeId)
      setResolvingId(null)
      if (!result.success) {
        toast.error("Could not delete the change", { description: result.error })
        return
      }
      toast.success("Change deleted")
      router.refresh()
    })
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("redlineId", redlineId)

    startAddTransition(async () => {
      const result = await addRedlineChange(formData)
      if (!result.success) {
        toast.error("Could not add the change", { description: result.error })
        return
      }
      form.reset()
      toast.success("Change added")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Change items</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Clause-level positions tracked separately from the document text.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            openCount > 0
              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          }
        >
          <span className="font-mono tabular-nums">{openCount}</span> open
        </Badge>
      </div>

      <div className="space-y-3">
        {changes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            No change items recorded yet.
          </div>
        ) : (
          changes.map((change) => {
            const isRowBusy = isResolving && resolvingId === change.id

            return (
              <div
                key={change.id}
                className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    #{change.position}
                  </span>
                  {change.clause_ref ? (
                    <span className="text-sm font-medium">{change.clause_ref}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unreferenced clause</span>
                  )}
                  <Badge variant="outline" className={CHANGE_TYPE_COLORS[change.change_type]}>
                    {change.change_type}
                  </Badge>
                  <Badge variant="outline" className={PARTY_COLORS[change.raised_by]}>
                    {PARTY_LABELS[change.raised_by]}
                  </Badge>
                  <Badge variant="outline" className={CHANGE_STATUS_COLORS[change.status]}>
                    {change.status}
                  </Badge>
                  {change.risk_level ? (
                    <Badge
                      variant="outline"
                      className={
                        RISK_COLORS[change.risk_level.toLowerCase()] ??
                        "bg-slate-400/10 text-slate-400 border-slate-400/20"
                      }
                    >
                      {change.risk_level} risk
                    </Badge>
                  ) : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/50 bg-background/40 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                      Original
                    </p>
                    <p className="mt-1 font-mono text-xs whitespace-pre-wrap text-rose-300/90">
                      {change.original_text ?? "--"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-background/40 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                      Proposed
                    </p>
                    <p className="mt-1 font-mono text-xs whitespace-pre-wrap text-emerald-300/90">
                      {change.proposed_text ?? "--"}
                    </p>
                  </div>
                </div>

                {change.rationale ? (
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                    {change.rationale}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => handleStatus(change.id, "ACCEPTED")}
                      disabled={isRowBusy}
                    >
                      {isRowBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      Accept
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => handleStatus(change.id, "REJECTED")}
                      disabled={isRowBusy}
                    >
                      <X className="size-3.5" />
                      Reject
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => handleStatus(change.id, "WITHDRAWN")}
                      disabled={isRowBusy}
                    >
                      <Undo2 className="size-3.5" />
                      Withdraw
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDelete(change.id)}
                    disabled={isRowBusy}
                    title="Delete change"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <form
        onSubmit={handleAdd}
        className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3"
      >
        <p className="text-sm font-medium">Add change</p>

        <div className="grid gap-2 sm:grid-cols-2">
          <Input name="clauseRef" placeholder="Clause 7.2" autoComplete="off" />
          <select name="changeType" defaultValue="REPLACEMENT" className={SELECT_CLASS}>
            {CHANGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <Textarea
          name="originalText"
          rows={2}
          placeholder="Original language"
          className="font-mono text-xs"
        />
        <Textarea
          name="proposedText"
          rows={2}
          placeholder="Proposed language"
          className="font-mono text-xs"
        />
        <Textarea name="rationale" rows={2} placeholder="Why we are asking for this" />

        <div className="grid gap-2 sm:grid-cols-2">
          <select name="riskLevel" defaultValue="medium" className={SELECT_CLASS}>
            {RISK_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level} risk
              </option>
            ))}
          </select>
          <select name="raisedBy" defaultValue="US" className={SELECT_CLASS}>
            <option value="US">Raised by us</option>
            <option value="COUNTERPARTY">Raised by counterparty</option>
          </select>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={isAdding}>
            {isAdding ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add change
          </Button>
        </div>
      </form>
    </div>
  )
}
