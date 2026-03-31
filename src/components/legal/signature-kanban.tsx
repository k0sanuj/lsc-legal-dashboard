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
import { FileText, User, Clock } from "lucide-react"

interface KanbanItem {
  id: string
  documentTitle: string
  signatoryName: string
  daysInStatus: number
  value: string | null
  documentId: string
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

function DroppableColumn({
  column,
  children,
}: {
  column: KanbanColumn
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  const borderColorMap: Record<string, string> = {
    amber: "border-t-amber-500",
    blue: "border-t-blue-500",
    emerald: "border-t-emerald-500",
    rose: "border-t-rose-500",
  }

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-t-4 ${borderColorMap[column.color] ?? "border-t-slate-500"} bg-muted/30 p-4 transition-colors ${isOver ? "ring-2 ring-primary/30" : ""}`}
      style={{ minHeight: 200 }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{column.title}</h3>
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
          {column.items.length}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function DraggableCard({ item }: { item: KanbanItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-lg border border-border/50 bg-card p-4 cursor-grab space-y-2 ${isDragging ? "opacity-50 shadow-lg" : ""}`}
    >
      <CardContent item={item} />
    </div>
  )
}

function CardContent({ item }: { item: KanbanItem }) {
  return (
    <>
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium leading-snug line-clamp-2">
          {item.documentTitle}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <User className="size-3" />
        <span>{item.signatoryName}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <span>
            {item.daysInStatus === 0 ? "Today" : `${item.daysInStatus}d in status`}
          </span>
        </div>
        {item.value && (
          <span className="text-xs font-medium font-mono tabular-nums">
            {item.value}
          </span>
        )}
      </div>
    </>
  )
}

export function SignatureKanban({ columns: initialColumns }: SignatureKanbanProps) {
  const dndId = useId()
  const [columns, setColumns] = useState(initialColumns)
  const [activeItem, setActiveItem] = useState<KanbanItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
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

    // Determine destination column: over could be a column id or another card
    let destColumnId = overId
    const overInColumn = findItem(overId)
    if (overInColumn) {
      destColumnId = overInColumn.columnId
    }

    // Only update if moving to a different column
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
      await updateSignatureStatus(
        activeId,
        destColumnId as "PENDING" | "SENT" | "SIGNED" | "STALLED"
      )
    } catch {
      // Revert on error
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => (
          <DroppableColumn key={column.id} column={column}>
            {column.items.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No requests
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
          <div className="rounded-lg border border-border/50 bg-card p-4 shadow-xl space-y-2 w-[280px]">
            <CardContent item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
