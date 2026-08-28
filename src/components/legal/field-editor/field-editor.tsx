"use client"

// DocuSign-style placement surface: signer selector and field palette on the
// left, vertically scrolled PDF pages with absolutely positioned field boxes
// on the right. Interactions are native pointer events (click-to-place, drag
// to move with pointer capture, corner-handle resize, Delete key to remove).
// All geometry lives as fractions of the page box, origin top-left; the
// server converts to PDF points in src/lib/opensign.ts.

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Ref } from "react"
import type { LucideIcon } from "lucide-react"
import {
  CalendarDays,
  Loader2,
  Mail,
  PenLine,
  PenTool,
  Trash2,
  Type,
  User,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { PdfPageCanvas, usePdfDocument } from "./pdf-page-canvas"
import type {
  EditorField,
  EditorFieldType,
  EditorPageDims,
  EditorSigner,
} from "./types"
import {
  clamp,
  clampFieldToPage,
  FIELD_DEFAULT_SIZES,
  FIELD_TYPE_LABELS,
  MIN_FIELD_H_PCT,
  MIN_FIELD_W_PCT,
  roundPt,
  signerColor,
  signerInitials,
} from "./types"

const PALETTE: Array<{ type: EditorFieldType; icon: LucideIcon }> = [
  { type: "signature", icon: PenTool },
  { type: "initials", icon: PenLine },
  { type: "date", icon: CalendarDays },
  { type: "text input", icon: Type },
  { type: "name", icon: User },
  { type: "email", icon: Mail },
]

interface DragState {
  mode: "move" | "resize"
  fieldId: string
  pointerId: number
  page: number
  /** px from the box's top-left corner to the pointer at drag start (move only). */
  grabOffsetX: number
  grabOffsetY: number
}

export interface FieldEditorHandle {
  /** Emits the current fields plus every captured page dim through onSave. */
  save: () => void
}

interface FieldEditorProps {
  documentId: string
  signers: EditorSigner[]
  initialFields: EditorField[]
  onSave: (fields: EditorField[], pages: EditorPageDims[]) => void
  /** Mirrors every fields change upward, for footers that show counts. */
  onFieldsChange?: (fields: EditorField[]) => void
  handleRef?: Ref<FieldEditorHandle>
}

export function FieldEditor({
  documentId,
  signers,
  initialFields,
  onSave,
  onFieldsChange,
  handleRef,
}: FieldEditorProps) {
  const { pdf, numPages, loading, error } = usePdfDocument(
    `/api/documents/${documentId}/file`
  )
  const [fields, setFields] = useState<EditorField[]>(initialFields)
  const [activeSignerEmail, setActiveSignerEmail] = useState(signers[0]?.email ?? "")
  const [pendingType, setPendingType] = useState<EditorFieldType | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const fieldsRef = useRef(fields)
  const pagesRef = useRef<Map<number, EditorPageDims>>(new Map())
  const pageBoxRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragRef = useRef<DragState | null>(null)
  const onFieldsChangeRef = useRef(onFieldsChange)
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    onFieldsChangeRef.current = onFieldsChange
  }, [onFieldsChange])
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  // Seed the parent's counts once, including any initialFields.
  useEffect(() => {
    onFieldsChangeRef.current?.(fieldsRef.current)
  }, [])

  const applyFields = useCallback((next: EditorField[]) => {
    fieldsRef.current = next
    setFields(next)
    onFieldsChangeRef.current?.(next)
  }, [])

  const handleDims = useCallback(
    (pageNumber: number, dims: { widthPt: number; heightPt: number }) => {
      pagesRef.current.set(pageNumber, {
        pageNumber,
        widthPt: roundPt(dims.widthPt),
        heightPt: roundPt(dims.heightPt),
      })
    },
    []
  )

  const save = useCallback(() => {
    const pages = [...pagesRef.current.values()].sort(
      (a, b) => a.pageNumber - b.pageNumber
    )
    onSaveRef.current(fieldsRef.current, pages)
  }, [])

  useImperativeHandle(handleRef, () => ({ save }), [save])

  // Keyboard delete for the selected box, ignoring keystrokes aimed at inputs.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return
      if (!selectedId) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      applyFields(fieldsRef.current.filter((field) => field.id !== selectedId))
      setSelectedId(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedId, applyFields])

  const signerIndexByEmail = useMemo(() => {
    const map = new Map<string, number>()
    signers.forEach((signer, index) => map.set(signer.email.toLowerCase(), index))
    return map
  }, [signers])

  const activeSigner = signers.find((signer) => signer.email === activeSignerEmail)

  function handlePageClick(event: React.MouseEvent<HTMLDivElement>, pageNumber: number) {
    if (!pendingType) {
      setSelectedId(null)
      return
    }
    if (!activeSignerEmail) return
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return
    const size = FIELD_DEFAULT_SIZES[pendingType]
    const field = clampFieldToPage({
      id: crypto.randomUUID(),
      signerEmail: activeSignerEmail,
      page: pageNumber,
      xPct: (event.clientX - box.left) / box.width - size.wPct / 2,
      yPct: (event.clientY - box.top) / box.height - size.hPct / 2,
      wPct: size.wPct,
      hPct: size.hPct,
      type: pendingType,
      required: true,
    })
    applyFields([...fieldsRef.current, field])
    setSelectedId(field.id)
    setPendingType(null)
  }

  function handleBoxPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    field: EditorField
  ) {
    event.stopPropagation()
    setSelectedId(field.id)
    const container = pageBoxRefs.current.get(field.page)
    if (!container) return
    const box = container.getBoundingClientRect()
    dragRef.current = {
      mode: "move",
      fieldId: field.id,
      pointerId: event.pointerId,
      page: field.page,
      grabOffsetX: event.clientX - (box.left + field.xPct * box.width),
      grabOffsetY: event.clientY - (box.top + field.yPct * box.height),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleResizePointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    field: EditorField
  ) {
    event.stopPropagation()
    setSelectedId(field.id)
    dragRef.current = {
      mode: "resize",
      fieldId: field.id,
      pointerId: event.pointerId,
      page: field.page,
      grabOffsetX: 0,
      grabOffsetY: 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  // The page container rect is re-measured every move, so scrolling or a
  // resize mid-drag cannot desync pointer and box positions.
  function handleDragPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const container = pageBoxRefs.current.get(drag.page)
    if (!container) return
    const box = container.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return
    applyFields(
      fieldsRef.current.map((field) => {
        if (field.id !== drag.fieldId) return field
        if (drag.mode === "move") {
          return clampFieldToPage({
            ...field,
            xPct: (event.clientX - box.left - drag.grabOffsetX) / box.width,
            yPct: (event.clientY - box.top - drag.grabOffsetY) / box.height,
          })
        }
        return {
          ...field,
          wPct: clamp(
            (event.clientX - box.left) / box.width - field.xPct,
            MIN_FIELD_W_PCT,
            1 - field.xPct
          ),
          hPct: clamp(
            (event.clientY - box.top) / box.height - field.yPct,
            MIN_FIELD_H_PCT,
            1 - field.yPct
          ),
        }
      })
    )
  }

  function handleDragPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function toggleRequired(fieldId: string) {
    applyFields(
      fieldsRef.current.map((field) =>
        field.id === fieldId ? { ...field, required: !field.required } : field
      )
    )
  }

  function removeField(fieldId: string) {
    applyFields(fieldsRef.current.filter((field) => field.id !== fieldId))
    setSelectedId((current) => (current === fieldId ? null : current))
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Signers</p>
          {signers.map((signer, index) => {
            const color = signerColor(index)
            const active = signer.email === activeSignerEmail
            const count = fields.filter(
              (field) => field.signerEmail.toLowerCase() === signer.email.toLowerCase()
            ).length
            return (
              <button
                key={signer.email}
                type="button"
                onClick={() => setActiveSignerEmail(signer.email)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs",
                  active ? "bg-muted" : "border-border/50 hover:bg-muted/50"
                )}
                style={active ? { borderColor: color } : undefined}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{signer.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {signer.email}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Fields</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PALETTE.map(({ type, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  setPendingType((current) => (current === type ? null : type))
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs",
                  pendingType === type
                    ? "border-primary bg-muted text-foreground"
                    : "border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {FIELD_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {pendingType
              ? `Click on the document to place a ${FIELD_TYPE_LABELS[pendingType]} field for ${activeSigner?.name ?? activeSignerEmail}.`
              : "Pick a field type, then click on the document to place it. Drag to move, corner handle to resize, Delete key to remove."}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/50 bg-card p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : pdf ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {Array.from({ length: numPages }, (_, index) => index + 1).map(
              (pageNumber) => (
                <div key={pageNumber}>
                  <div
                    ref={(element) => {
                      if (element) pageBoxRefs.current.set(pageNumber, element)
                      else pageBoxRefs.current.delete(pageNumber)
                    }}
                    className={cn(
                      "relative bg-white",
                      pendingType && "cursor-crosshair"
                    )}
                    onClick={(event) => handlePageClick(event, pageNumber)}
                  >
                    <PdfPageCanvas pdf={pdf} pageNumber={pageNumber} onDims={handleDims} />
                    {fields
                      .filter((field) => field.page === pageNumber)
                      .map((field) => {
                        const signerIdx =
                          signerIndexByEmail.get(field.signerEmail.toLowerCase()) ?? 0
                        const color = signerColor(signerIdx)
                        const selected = field.id === selectedId
                        const signer = signers[signerIdx]
                        return (
                          <div
                            key={field.id}
                            className={cn(
                              "absolute flex cursor-move touch-none items-center justify-center rounded-sm border select-none",
                              selected ? "z-20 ring-2 ring-white/60" : "z-10"
                            )}
                            style={{
                              left: `${field.xPct * 100}%`,
                              top: `${field.yPct * 100}%`,
                              width: `${field.wPct * 100}%`,
                              height: `${field.hPct * 100}%`,
                              borderColor: color,
                              // 20% fill: 0x33 alpha on the signer color.
                              backgroundColor: `${color}33`,
                            }}
                            onPointerDown={(event) => handleBoxPointerDown(event, field)}
                            onPointerMove={handleDragPointerMove}
                            onPointerUp={handleDragPointerUp}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="max-w-full truncate px-1 text-[10px] font-medium text-slate-900">
                              {FIELD_TYPE_LABELS[field.type]}
                              {" · "}
                              {signerInitials(signer?.name ?? field.signerEmail)}
                              {field.required ? "" : " (optional)"}
                            </span>
                            {selected ? (
                              <>
                                <div
                                  className="absolute -top-7 left-0 z-30 flex items-center gap-1 rounded-md border border-border/50 bg-card p-0.5"
                                  onPointerDown={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className={cn(
                                      "rounded px-1.5 py-0.5 text-[10px]",
                                      field.required
                                        ? "bg-muted text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      toggleRequired(field.id)
                                    }}
                                  >
                                    Required
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded p-0.5 text-muted-foreground hover:text-red-400"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      removeField(field.id)
                                    }}
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>
                                <div
                                  className="absolute right-0 bottom-0 size-3 cursor-nwse-resize touch-none rounded-tl-sm"
                                  style={{ backgroundColor: color }}
                                  onPointerDown={(event) =>
                                    handleResizePointerDown(event, field)
                                  }
                                  onPointerMove={handleDragPointerMove}
                                  onPointerUp={handleDragPointerUp}
                                />
                              </>
                            ) : null}
                          </div>
                        )
                      })}
                  </div>
                  <p className="mt-1 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
                    Page {pageNumber} / {numPages}
                  </p>
                </div>
              )
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
