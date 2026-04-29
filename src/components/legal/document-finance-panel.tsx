"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Loader2,
} from "lucide-react"
import { resyncDocumentToFinance } from "@/actions/documents"
import { cn } from "@/lib/utils"

interface ContractMetadata {
  contract_name: string | null
  contract_value_usd: number | null
  contract_status: string | null
  sponsor_name: string | null
  contract_start_date: string | null // ISO date strings — server-side formatted
  contract_end_date: string | null
  currency_code: string | null
}

interface TrancheRow {
  id: string
  tranche_number: number | null
  tranche_label: string | null
  tranche_amount_usd: number | null
  finance_post_status: string | null
}

interface Props {
  documentId: string
  syncStatus: string | null // "synced" | "pending" | "failed" | null
  lastPostedAt: string | null // pre-humanized
  errorMessage: string | null
  contract: ContractMetadata
  tranches: TrancheRow[]
}

export function DocumentFinancePanel({
  documentId,
  syncStatus,
  lastPostedAt,
  errorMessage,
  contract,
  tranches,
}: Props) {
  const [isPending, startTransition] = useTransition()

  function onResync() {
    const fd = new FormData()
    fd.set("id", documentId)
    startTransition(async () => {
      await resyncDocumentToFinance(fd)
    })
  }

  return (
    <div className="mt-4 space-y-6">
      {/* Sync status */}
      <div className="rounded-xl border border-border/50 bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">Sync status</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Last sent to the Finance dashboard via webhook.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResync}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Resync to Finance
          </Button>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="mt-1">
              {syncStatus === "synced" ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  <span className="text-sm font-medium">Synced</span>
                </span>
              ) : syncStatus === "failed" ? (
                <span className="inline-flex items-center gap-1.5 text-rose-400">
                  <AlertCircle className="size-4" />
                  <span className="text-sm font-medium">Failed</span>
                </span>
              ) : syncStatus === "pending" ? (
                <span className="inline-flex items-center gap-1.5 text-amber-400">
                  <Clock className="size-4" />
                  <span className="text-sm font-medium">Pending</span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Never synced</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last attempt</dt>
            <dd className="mt-1 text-sm font-medium">{lastPostedAt ?? "--"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tranches</dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">
              {tranches.length}
            </dd>
          </div>
        </dl>

        {errorMessage && (
          <div className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-400">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Contract metadata mirror */}
      <div className="rounded-xl border border-border/50 bg-card p-6">
        <h3 className="text-base font-semibold">Contract metadata sent to Finance</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          These values are what the most recent <code>contract.*</code> webhook event carried.
        </p>
        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Contract name" value={contract.contract_name} />
          <Field label="Status" value={contract.contract_status ?? "draft"} />
          <Field label="Sponsor / Counterparty" value={contract.sponsor_name} />
          <Field
            label="Contract value"
            value={
              contract.contract_value_usd != null
                ? `${contract.currency_code ?? "USD"} ${contract.contract_value_usd.toLocaleString()}`
                : null
            }
          />
          <Field label="Start date" value={contract.contract_start_date} />
          <Field label="End date" value={contract.contract_end_date} />
        </dl>
      </div>

      {/* Linked tranches */}
      <div className="rounded-xl border border-border/50 bg-card p-6">
        <h3 className="text-base font-semibold">Linked tranches</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Tranches reference this contract via Document id when they sync.
        </p>
        {tranches.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No tranches yet. Create one on{" "}
            <a
              href="/legal/payment-cycles"
              className="text-blue-400 hover:underline underline-offset-4"
            >
              Payment Cycles
            </a>
            .
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {tranches.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-md border border-border/40 bg-background/50 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">
                    Tranche #{t.tranche_number ?? "?"}
                    {t.tranche_label ? ` — ${t.tranche_label}` : ""}
                  </span>
                  {t.tranche_amount_usd != null && (
                    <span className="ml-2 text-xs font-mono tabular-nums text-muted-foreground">
                      ${t.tranche_amount_usd.toLocaleString()}
                    </span>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    t.finance_post_status === "synced" &&
                      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                    t.finance_post_status === "failed" &&
                      "bg-rose-500/10 text-rose-400 border-rose-500/20",
                    t.finance_post_status === "pending" &&
                      "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  )}
                >
                  {t.finance_post_status ?? "--"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value ?? "--"}</dd>
    </div>
  )
}
