"use client"

import { useId, useState } from "react"
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { updateSignatureStatus } from "@/actions/signatures"
import { transitionDocument } from "@/actions/documents"
import { FileText, User, Clock, Building, Tag } from "lucide-react"
import { DropboxSignPrepButton } from "@/components/legal/send-for-signature-button"
import type { LifecycleStatus, SignatureStatus } from "@/generated/prisma/client"

interface KanbanItem {
  id: string
  documentTitle: string
  signatoryName: string
  daysInStatus: number
  value: string | null
  documentId: string
  entity?: string
  category?: string
  pendingSignatureCount?: number
  hasFile?: boolean
  canPrepareSignature?: boolean
}

interface KanbanColumn {
  id: string
  title: string
  color: string
  items: KanbanItem[]
}

interface SignatureKanbanProps {
  columns: KanbanColumn[]
}

const BORDER_COLOR_MAP: Record<string, string> = {
  slate: "border-t-slate-500",
  sky: "border-t-sky-500",
  violet: "border-t-violet-500",
  indigo: "border-t-indigo-500",
  amber: "border-t-amber-500",
  blue: "border-t-blue-500",
  emerald: "border-t-emerald-500",
  rose: "border-t-rose-500",
}

const BG_COLOR_MAP: Record<string, string> = {
  slate: "bg-slate-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  indigo: "bg-indigo-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
}

function DroppableColumn({
  column,
  children,
}: {
  column: KanbanColumn
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-t-4 ${BORDER_COLOR_MAP[column.color] ?? "border-t-slate-500"} bg-muted/30 p-3 transition-colors ${isOver ? "ring-2 ring-primary/30" : ""}`}
      style={{ minHeight: 180 }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${BG_COLOR_MAP[column.color] ?? "bg-slate-500"}`} />
          <h3 className="text-xs font-semibold uppercase tracking-wider">{column.title}</h3>
        </div>
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium tabular-nums">
          {column.items.length}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DraggableCard({ item }: { item: KanbanItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-lg border border-border/50 bg-card p-3 cursor-grab space-y-1.5 ${isDragging ? "opacity-50 shadow-lg" : ""}`}
    >
      <ItemContent item={item} />
    </div>
  )
}

function ItemContent({
  item,
  showAction = true,
}: {
  item: KanbanItem
  showAction?: boolean
}) {
  return (
    <>
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium leading-snug line-clamp-2">
          {item.documentTitle}
        </span>
      </div>

      {/* Entity + Category — prominent */}
      {(item.entity || item.category) && (
        <div className="flex flex-wrap gap-1">
          {item.entity && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <Building className="size-2.5" />
              {item.entity}
            </span>
          )}
          {item.category && (
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400 capitalize">
              <Tag className="size-2.5" />
              {item.category}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <User className="size-2.5" />
        <span className="truncate">{item.signatoryName}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="size-2.5" />
          <span>
            {item.daysInStatus === 0 ? "Today" : `${item.daysInStatus}d`}
          </span>
        </div>
        {item.value && (
          <span className="text-[10px] font-medium font-mono tabular-nums">
            {item.value}
          </span>
        )}
      </div>
      {showAction && item.canPrepareSignature && (
        <div className="pt-1">
          <DropboxSignPrepButton
            documentId={item.documentId}
            pendingCount={item.pendingSignatureCount ?? 0}
            disabled={!item.hasFile}
            compact
            stopPropagation
          />
        </div>
      )}
    </>
  )
}

// Map column IDs to document lifecycle transitions
const DOC_TRANSITION_MAP: Record<string, LifecycleStatus> = {
  doc_DRAFT: "DRAFT",
  doc_IN_REVIEW: "IN_REVIEW",
  doc_NEGOTIATION: "NEGOTIATION",
  doc_AWAITING_SIGNATURE: "AWAITING_SIGNATURE",
}

const SIG_STATUSES = new Set<SignatureStatus>([
  "PENDING",
  "SENT",
  "SIGNED",
  "STALLED",
])

export function SignatureKanban({ columns: initialColumns }: SignatureKanbanProps) {
  const dndId = useId()
  const [columns, setColumns] = useState(initialColumns)
  const [activeItem, setActiveItem] = useState<KanbanItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function findItem(id: string) {
    for (const col of columns) {
      const item = col.items.find((i) => i.id === id)
      if (item) return { item, columnId: col.id }
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    const found = findItem(String(event.active.id))
    setActiveItem(found?.item ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null)
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    const source = findItem(activeId)
    if (!source) return

    let destColumnId = overId
    const overInColumn = findItem(overId)
    if (overInColumn) destColumnId = overInColumn.columnId

    if (source.columnId === destColumnId) return

    // Optimistic update
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id === source.columnId) {
          return { ...col, items: col.items.filter((i) => i.id !== activeId) }
        }
        if (col.id === destColumnId) {
          return { ...col, items: [...col.items, source.item] }
        }
        return col
      })
    )

    try {
      // Determine if this is a document pipeline drag or signature drag
      const isDocItem = activeId.startsWith("doc_")
      const isDocDest = destColumnId.startsWith("doc_")

      if (isDocItem && isDocDest) {
        // Document lifecycle transition
        const realDocId = activeId.replace("doc_", "")
        const toStatus = DOC_TRANSITION_MAP[destColumnId]
        if (toStatus) {
          await transitionDocument(realDocId, toStatus)
        }
      } else if (!isDocItem && SIG_STATUSES.has(destColumnId as SignatureStatus)) {
        // Signature status update
        await updateSignatureStatus(
          activeId,
          destColumnId as SignatureStatus
        )
      }
    } catch {
      setColumns(initialColumns)
    }
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 2xl:grid-cols-8">
        {columns.map((column) => (
          <DroppableColumn key={column.id} column={column}>
            {column.items.length === 0 ? (
              <p className="py-6 text-center text-[10px] text-muted-foreground">
                Empty
              </p>
            ) : (
              column.items.map((item) => (
                <DraggableCard key={item.id} item={item} />
              ))
            )}
          </DroppableColumn>
        ))}
      </div>
      <DragOverlay>
        {activeItem ? (
          <div className="rounded-lg border border-border/50 bg-card p-3 shadow-xl space-y-1.5 w-[220px]">
            <ItemContent item={activeItem} showAction={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
