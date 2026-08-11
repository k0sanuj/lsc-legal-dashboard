import { FileDiff } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  summarizeRedlineDiff,
  type RedlineDiffSegment,
  type RedlineDiffStatus,
} from "@/lib/redline-diff"

// A 300-page agreement can produce tens of thousands of segments; rendering
// them all would stall the page, so cap the output and say so plainly.
const MAX_RENDERED_SEGMENTS = 400

export function RedlineDiffView({
  segments,
  status = "ok",
}: {
  segments: RedlineDiffSegment[]
  status?: RedlineDiffStatus
}) {
  const counts = summarizeRedlineDiff(segments)
  const visible = segments.slice(0, MAX_RENDERED_SEGMENTS)
  const truncated = segments.length > visible.length
  // diffWords on identical text returns one unchanged part, never zero parts,
  // so an unchanged round has to be recognised by its change counts.
  const noChanges = counts.added === 0 && counts.removed === 0

  return (
    <div className="space-y-3 rounded-xl border border-border/50 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileDiff className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Tracked changes</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          >
            <span className="font-mono tabular-nums">+{counts.added}</span> added
          </Badge>
          <Badge
            variant="outline"
            className="bg-rose-500/10 text-rose-400 border-rose-500/20"
          >
            <span className="font-mono tabular-nums">-{counts.removed}</span> removed
          </Badge>
          <Badge
            variant="outline"
            className="bg-slate-400/10 text-slate-400 border-slate-400/20"
          >
            <span className="font-mono tabular-nums">{counts.unchanged}</span> unchanged
          </Badge>
        </div>
      </div>

      {status === "too_large" ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          These two versions are too large and too different to diff inline. Compare them in the
          proposed text editor below.
        </div>
      ) : noChanges ? (
        <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          No differences between the base text and the proposed text.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/50 bg-background/40 p-4">
          <p className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {visible.map((segment, index) => {
              if (segment.type === "added") {
                return (
                  <ins
                    key={index}
                    className="rounded bg-emerald-500/10 px-0.5 text-emerald-300 no-underline"
                  >
                    {segment.value}
                  </ins>
                )
              }
              if (segment.type === "removed") {
                return (
                  <del
                    key={index}
                    className="rounded bg-rose-500/10 px-0.5 text-rose-300 line-through"
                  >
                    {segment.value}
                  </del>
                )
              }
              return (
                <span key={index} className="text-muted-foreground">
                  {segment.value}
                </span>
              )
            })}
          </p>
        </div>
      )}

      {truncated ? (
        <p className="text-xs text-amber-300">
          Diff truncated after{" "}
          <span className="font-mono tabular-nums">{MAX_RENDERED_SEGMENTS}</span> of{" "}
          <span className="font-mono tabular-nums">{segments.length}</span> segments. Review
          the remaining changes in the proposed text editor.
        </p>
      ) : null}
    </div>
  )
}
