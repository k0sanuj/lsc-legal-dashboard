"use client"

import { useState, useTransition, useOptimistic, useRef, useEffect } from "react"
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Circle,
  CheckCircle2,
  Loader2,
  X,
  ArrowUpDown,
  GitBranch,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  createChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
} from "@/actions/checklist"
import type { Priority } from "@/generated/prisma/client"

interface ChecklistItem {
  id: string
  title: string
  done: boolean
  priority: Priority
  category: string
  dependency_ids: string[]
  notes: string | null
  sort_order: number
}

const PRIORITY_ORDER: Record<Priority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

const PRIORITY_COLORS: Record<Priority, string> = {
  CRITICAL: "text-red-400",
  HIGH: "text-orange-400",
  MEDIUM: "text-blue-400",
  LOW: "text-slate-400",
}

const PRIORITY_DOT: Record<Priority, string> = {
  CRITICAL: "bg-red-400",
  HIGH: "bg-orange-400",
  MEDIUM: "bg-blue-400",
  LOW: "bg-slate-500",
}

const PRIORITY_LABELS: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

interface SidebarChecklistProps {
  items: ChecklistItem[]
  collapsed: boolean
}

export function SidebarChecklist({ items, collapsed }: SidebarChecklistProps) {
  const [expanded, setExpanded] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [optimisticItems, setOptimisticItems] = useOptimistic(
    items,
    (state: ChecklistItem[], update: { type: string; id?: string; item?: ChecklistItem }) => {
      if (update.type === "toggle" && update.id) {
        return state.map((i) =>
          i.id === update.id ? { ...i, done: !i.done } : i
        )
      }
      if (update.type === "delete" && update.id) {
        return state.filter((i) => i.id !== update.id)
      }
      if (update.type === "add" && update.item) {
        return [...state, update.item]
      }
      return state
    }
  )

  // Sort by done (unchecked first), then priority
  const sorted = [...optimisticItems].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  })

  // Group by category
  const categories = [...new Set(sorted.map((i) => i.category))]

  const doneCount = optimisticItems.filter((i) => i.done).length
  const totalCount = optimisticItems.length
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  useEffect(() => {
    if (showAddForm && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showAddForm])

  function handleToggle(id: string) {
    startTransition(async () => {
      setOptimisticItems({ type: "toggle", id })
      await toggleChecklistItem(id)
    })
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      setOptimisticItems({ type: "delete", id })
      await deleteChecklistItem(id)
      setDeletingId(null)
    })
  }

  async function handleAdd(formData: FormData) {
    const title = formData.get("title") as string
    if (!title?.trim()) return

    const priority = formData.get("priority") as Priority
    const category = formData.get("category") as string

    startTransition(async () => {
      setOptimisticItems({
        type: "add",
        item: {
          id: `temp-${Date.now()}`,
          title: title.trim(),
          done: false,
          priority: priority || "MEDIUM",
          category: category || "General",
          dependency_ids: [],
          notes: null,
          sort_order: totalCount + 1,
        },
      })
      await createChecklistItem(formData)
      formRef.current?.reset()
      setShowAddForm(false)
    })
  }

  if (collapsed) {
    return (
      <div className="px-2 py-3 border-t border-sidebar-border">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex h-8 w-full items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-colors"
          title={`Checklist: ${doneCount}/${totalCount} (${pct}%)`}
        >
          <div className="relative">
            <CheckCircle2 className="h-4 w-4" />
            {totalCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[7px] font-bold text-primary-foreground">
                {totalCount - doneCount}
              </span>
            )}
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="border-t border-sidebar-border">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-sidebar-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold truncate">Project Checklist</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {doneCount}/{totalCount}
          </span>
          {expanded ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Progress bar */}
      <div className="px-4 pb-1">
        <div className="h-1 w-full rounded-full bg-sidebar-accent/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[9px] text-muted-foreground mt-0.5 text-right tabular-nums font-mono">
          {pct}% complete
        </p>
      </div>

      {expanded && (
        <div className="px-2 pb-2 max-h-[45vh] overflow-y-auto scrollbar-thin">
          {categories.map((cat) => {
            const catItems = sorted.filter((i) => i.category === cat)
            const catDone = catItems.filter((i) => i.done).length
            return (
              <div key={cat} className="mb-2">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
                    {cat}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60 tabular-nums font-mono">
                    {catDone}/{catItems.length}
                  </span>
                </div>
                <div className="space-y-px">
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "group flex items-start gap-1.5 rounded-md px-2 py-1 transition-colors",
                        "hover:bg-sidebar-accent/40",
                        item.done && "opacity-50"
                      )}
                    >
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(item.id)}
                        disabled={isPending}
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      >
                        {item.done ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Circle className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-[11px] leading-tight",
                            item.done && "line-through text-muted-foreground"
                          )}
                        >
                          {item.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={cn(
                              "inline-block h-1.5 w-1.5 rounded-full",
                              PRIORITY_DOT[item.priority]
                            )}
                          />
                          <span
                            className={cn(
                              "text-[8px] uppercase font-medium tracking-wider",
                              PRIORITY_COLORS[item.priority]
                            )}
                          >
                            {item.priority}
                          </span>
                          {item.dependency_ids.length > 0 && (
                            <>
                              <GitBranch className="h-2.5 w-2.5 text-muted-foreground/50" />
                              <span className="text-[8px] text-muted-foreground/50">
                                {item.dependency_ids.length} dep{item.dependency_ids.length > 1 ? "s" : ""}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isPending && deletingId === item.id}
                        className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-red-400 transition-all"
                      >
                        {isPending && deletingId === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Add form */}
          {showAddForm ? (
            <form
              ref={formRef}
              action={handleAdd}
              className="mt-1 mx-1 rounded-lg border border-sidebar-border bg-sidebar-accent/20 p-2 space-y-1.5"
            >
              <input
                ref={inputRef}
                name="title"
                placeholder="Item title..."
                className="w-full bg-transparent text-[11px] px-1.5 py-1 rounded border border-sidebar-border/50 focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/40"
                required
              />
              <div className="flex gap-1.5">
                <select
                  name="priority"
                  defaultValue="MEDIUM"
                  className="flex-1 bg-transparent text-[10px] px-1 py-0.5 rounded border border-sidebar-border/50 focus:outline-none focus:border-primary/50 text-muted-foreground"
                >
                  {PRIORITY_LABELS.map((p) => (
                    <option key={p} value={p} className="bg-slate-900">
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  name="category"
                  defaultValue="General"
                  className="flex-1 bg-transparent text-[10px] px-1 py-0.5 rounded border border-sidebar-border/50 focus:outline-none focus:border-primary/50 text-muted-foreground"
                >
                  {[...categories, "General"].filter((v, i, a) => a.indexOf(v) === i).map((c) => (
                    <option key={c} value={c} className="bg-slate-900">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-[10px] px-2 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 mt-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-accent/30 transition-colors"
            >
              <Plus className="h-3 w-3" />
              <span>Add item</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
