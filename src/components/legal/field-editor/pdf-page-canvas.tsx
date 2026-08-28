"use client"

// Renders a single PDF page to a canvas with pdfjs-dist, plus the
// usePdfDocument hook that loads the document once for the whole editor.
//
// pdfjs is imported dynamically inside effects so it never enters a server
// bundle graph (same rule as src/lib/extract-text.ts). The canvas backing
// store is devicePixelRatio-scaled while the CSS box stays layout-driven, so
// all placement math happens in CSS px and the classic 2x Retina offset bug
// cannot occur.

import { useCallback, useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist"

const RESIZE_DEBOUNCE_MS = 150

export interface PdfDocumentState {
  pdf: PDFDocumentProxy | null
  numPages: number
  loading: boolean
  error: string | null
}

// Loads a PDF from a same-origin URL (session cookie included) and parses it
// with pdfjs. The bytes are fetched with a plain fetch() so pdfjs never deals
// with credentials or range requests itself.
export function usePdfDocument(url: string | null): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>({
    pdf: null,
    numPages: 0,
    loading: Boolean(url),
    error: null,
  })

  useEffect(() => {
    if (!url) {
      setState({ pdf: null, numPages: 0, loading: false, error: null })
      return
    }

    let cancelled = false
    let loaded: PDFDocumentProxy | null = null
    setState({ pdf: null, numPages: 0, loading: true, error: null })

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString()

        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Could not load the document file (HTTP ${response.status}).`)
        }
        const data = new Uint8Array(await response.arrayBuffer())
        const pdf = await pdfjs.getDocument({ data }).promise
        if (cancelled) {
          void pdf.destroy()
          return
        }
        loaded = pdf
        setState({ pdf, numPages: pdf.numPages, loading: false, error: null })
      } catch (error) {
        console.error("PDF load failed:", error)
        if (!cancelled) {
          setState({
            pdf: null,
            numPages: 0,
            loading: false,
            error: error instanceof Error ? error.message : "Could not load the PDF.",
          })
        }
      }
    })()

    return () => {
      cancelled = true
      if (loaded) void loaded.destroy()
    }
  }, [url])

  return state
}

interface PdfPageCanvasProps {
  pdf: PDFDocumentProxy
  /** 1-based, matching pdfjs and the OpenSign contract. */
  pageNumber: number
  /** Page box in PDF points from getViewport({ scale: 1 }); fired once per document load. */
  onDims?: (pageNumber: number, dims: { widthPt: number; heightPt: number }) => void
}

export function PdfPageCanvas({ pdf, pageNumber, onDims }: PdfPageCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pageRef = useRef<PDFPageProxy | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const onDimsRef = useRef(onDims)

  useEffect(() => {
    onDimsRef.current = onDims
  }, [onDims])

  const renderPage = useCallback(async () => {
    const page = pageRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!page || !canvas || !container) return

    const cssWidth = container.getBoundingClientRect().width
    if (cssWidth <= 0) return

    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: cssWidth / base.width })
    const dpr = window.devicePixelRatio || 1

    renderTaskRef.current?.cancel()

    // Backing store at dpr resolution; the CSS box stays layout-driven
    // (w-full/h-auto), so fields position against CSS px, never device px.
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)

    const task = page.render({
      canvas,
      viewport,
      transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
    })
    renderTaskRef.current = task
    try {
      await task.promise
    } catch {
      // A cancelled render throws RenderingCancelledException; the replacing
      // render owns the canvas now, so there is nothing to do.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return
        pageRef.current = page
        const base = page.getViewport({ scale: 1 })
        onDimsRef.current?.(pageNumber, { widthPt: base.width, heightPt: base.height })
        void renderPage()
      } catch (error) {
        console.error(`PDF page ${pageNumber} load failed:`, error)
      }
    })()
    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      pageRef.current = null
    }
  }, [pdf, pageNumber, renderPage])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let timer: number | null = null
    const observer = new ResizeObserver(() => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => void renderPage(), RESIZE_DEBOUNCE_MS)
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [renderPage])

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} className="block h-auto w-full" />
    </div>
  )
}
