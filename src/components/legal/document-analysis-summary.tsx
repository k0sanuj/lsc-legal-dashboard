"use client"

import { useCallback, useEffect, useState } from "react"
import type { ComponentType, ReactNode } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSearch,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type {
  DocumentAnalysisSummary,
  RiskLevel,
} from "@/lib/document-analysis-summary"

interface ApiResponse {
  document: {
    id: string
    title: string
    category: string
    entity: string
    hasFile: boolean
  }
  analysis: DocumentAnalysisSummary
}

interface DocumentAnalysisSummaryDrawerProps {
  documentId: string
  targetType?: "document" | "kyc" | "litigation"
  autoOpen?: boolean
  compact?: boolean
  showTrigger?: boolean
}

const RISK_CLASSES: Record<RiskLevel, string> = {
  low: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  medium: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  high: "border-rose-500/20 bg-rose-500/10 text-rose-300",
}

function riskClass(level?: RiskLevel) {
  return level ? RISK_CLASSES[level] : "border-border bg-muted text-muted-foreground"
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  )
}

export function DocumentAnalysisSummaryDrawer({
  documentId,
  targetType = "document",
  autoOpen = false,
  compact = false,
  showTrigger = true,
}: DocumentAnalysisSummaryDrawerProps) {
  const [open, setOpen] = useState(autoOpen)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadSummary = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const url =
        targetType === "document"
          ? `/api/documents/${documentId}/analysis-summary`
          : `/api/analysis-summary?target=${targetType}&id=${documentId}`
      const response = await fetch(url, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error("Could not load AI summary")
      }
      setData((await response.json()) as ApiResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load AI summary")
    } finally {
      setIsLoading(false)
    }
  }, [documentId, targetType])

  useEffect(() => {
    if (open) {
      void loadSummary()
    }
  }, [open, loadSummary])

  useEffect(() => {
    if (!open) return
    const status = data?.analysis.status
    if (status === "complete" || status === "failed") return
    if (status === "none" && data?.document.hasFile === false) return

    const timer = window.setInterval(() => {
      void loadSummary()
    }, 2500)

    return () => window.clearInterval(timer)
  }, [open, data?.analysis.status, data?.document.hasFile, loadSummary])

  const analysis = data?.analysis
  const hasFinancialTerms =
    analysis?.financialTerms &&
    Object.values(analysis.financialTerms).some((value) => Boolean(value))

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {showTrigger ? (
        <SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>
          <Sparkles className="size-3.5" />
          {compact ? "AI" : "AI Summary"}
        </SheetTrigger>
      ) : null}
      <SheetContent className="w-[min(92vw,680px)] overflow-y-auto sm:max-w-none">
        <SheetHeader className="pr-12">
          <SheetTitle>AI Upload Summary</SheetTitle>
          <SheetDescription>
            Key fields, clauses, gaps, and next steps from the uploaded file.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            {data?.document ? (
              <>
                <Badge variant="outline">{data.document.entity}</Badge>
                <Badge variant="outline">
                  {data.document.category.replace(/_/g, " ")}
                </Badge>
              </>
            ) : null}
            {analysis?.status ? (
              <Badge
                variant="outline"
                className={cn(
                  analysis.status === "complete" &&
                    "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
                  analysis.status === "pending" &&
                    "border-amber-500/20 bg-amber-500/10 text-amber-300",
                  analysis.status === "failed" &&
                    "border-rose-500/20 bg-rose-500/10 text-rose-300"
                )}
              >
                {analysis.status.replace(/_/g, " ")}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => void loadSummary()}
              disabled={isLoading}
              className="ml-auto"
            >
              {isLoading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Refresh
            </Button>
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              {error}
            </div>
          ) : null}

          {!analysis ||
          analysis.status === "pending" ||
          (analysis.status === "none" && data?.document.hasFile) ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <Clock className="size-4 text-amber-300" />
                <div>
                  <p className="text-sm font-medium">Analysis is being prepared</p>
                  <p className="text-xs text-muted-foreground">
                    This panel will update automatically once the upload analysis finishes.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {analysis?.status === "none" && data?.document.hasFile === false ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <p className="text-sm font-medium">No file attached</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Attach a document file to generate an upload summary.
              </p>
            </div>
          ) : null}

          {analysis?.status === "failed" ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 text-rose-300" />
                <div>
                  <p className="text-sm font-medium text-rose-200">Analysis failed</p>
                  <p className="text-sm text-rose-200/80">
                    {analysis.error ?? "The analyzer could not process this upload."}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {analysis?.status === "complete" ? (
            <>
              <Section title="Summary" icon={FileSearch}>
                <p className="text-sm leading-6 text-foreground/85">
                  {analysis.summary ?? "No summary returned."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {analysis.suggestedCategory ? (
                    <Badge variant="outline">
                      Suggested: {analysis.suggestedCategory.replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                  {analysis.suggestedFileName ? (
                    <Badge variant="outline" className="max-w-full truncate">
                      {analysis.suggestedFileName}
                    </Badge>
                  ) : null}
                </div>
              </Section>

              <Separator />

              <Section title="Key Fields" icon={ListChecks}>
                {analysis.keyFields.length > 0 ? (
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {analysis.keyFields.map((field, index) => (
                      <div key={`${field.label}-${index}`} className="rounded-lg border border-border/60 p-3">
                        <dt className="text-xs text-muted-foreground">{field.label}</dt>
                        <dd className="mt-1 text-sm font-medium">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <EmptyLine text="No key fields extracted." />
                )}
              </Section>

              <Section title="Key Dates" icon={Clock}>
                {analysis.keyDates.length > 0 ? (
                  <div className="space-y-2">
                    {analysis.keyDates.map((date, index) => (
                      <div
                        key={`${date.label}-${index}`}
                        className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3"
                      >
                        <span className="text-sm">{date.label}</span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {date.date}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyLine text="No actionable dates extracted." />
                )}
              </Section>

              <Section title="Clauses" icon={FileSearch}>
                {analysis.keyClauses.length > 0 || analysis.unusualClauses.length > 0 ? (
                  <div className="space-y-2">
                    {analysis.keyClauses.map((clause, index) => (
                      <div key={`${clause.clause}-${index}`} className="rounded-lg border border-border/60 p-3">
                        <div className="flex items-start gap-2">
                          <p className="text-sm font-medium">{clause.clause}</p>
                          <Badge variant="outline" className={cn("ml-auto", riskClass(clause.riskLevel))}>
                            {clause.riskLevel ?? "not rated"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{clause.summary}</p>
                      </div>
                    ))}
                    {analysis.unusualClauses.map((clause, index) => (
                      <div key={`${clause.clause}-unusual-${index}`} className="rounded-lg border border-border/60 p-3">
                        <div className="flex items-start gap-2">
                          <p className="text-sm font-medium">{clause.clause}</p>
                          <Badge variant="outline" className={cn("ml-auto", riskClass(clause.riskLevel))}>
                            {clause.riskLevel ?? "not rated"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{clause.concern}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyLine text="No clauses highlighted." />
                )}
              </Section>

              <Section title="Obligations" icon={CheckCircle2}>
                {analysis.obligations.length > 0 ? (
                  <div className="space-y-2">
                    {analysis.obligations.map((obligation, index) => (
                      <div key={`${obligation.party}-${index}`} className="rounded-lg border border-border/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{obligation.party}</Badge>
                          {obligation.deadline ? (
                            <span className="font-mono text-xs text-muted-foreground">
                              {obligation.deadline}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm text-foreground/85">
                          {obligation.obligation}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyLine text="No party obligations extracted." />
                )}
              </Section>

              {hasFinancialTerms ? (
                <Section title="Financial Terms" icon={ListChecks}>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(analysis.financialTerms).map(([label, value]) =>
                      value ? (
                        <div key={label} className="rounded-lg border border-border/60 p-3">
                          <dt className="text-xs capitalize text-muted-foreground">
                            {label.replace(/([A-Z])/g, " $1")}
                          </dt>
                          <dd className="mt-1 text-sm font-medium">{value}</dd>
                        </div>
                      ) : null
                    )}
                  </dl>
                </Section>
              ) : null}

              <Section title="Gaps" icon={AlertTriangle}>
                {analysis.missingGaps.length > 0 ? (
                  <div className="space-y-2">
                    {analysis.missingGaps.map((gap, index) => (
                      <div key={`${gap.gap}-${index}`} className="rounded-lg border border-border/60 p-3">
                        <div className="flex items-start gap-2">
                          <p className="text-sm font-medium">{gap.gap}</p>
                          <Badge variant="outline" className={cn("ml-auto", riskClass(gap.severity))}>
                            {gap.severity ?? "not rated"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{gap.impact}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyLine text="No missing gaps identified." />
                )}
              </Section>

              <Section title="Next Steps" icon={ListChecks}>
                {analysis.recommendedNextSteps.length > 0 ? (
                  <ol className="space-y-2">
                    {analysis.recommendedNextSteps.map((step, index) => (
                      <li key={`${step.action}-${index}`} className="rounded-lg border border-border/60 p-3">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{step.action}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {step.owner ? (
                                <Badge variant="outline">Owner: {step.owner}</Badge>
                              ) : null}
                              <Badge variant="outline" className={riskClass(step.priority)}>
                                {step.priority ?? "not rated"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyLine text="No next steps returned." />
                )}
              </Section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
