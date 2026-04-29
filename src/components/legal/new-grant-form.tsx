"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Plus, Loader2 } from "lucide-react"
import { createEsopGrantAction } from "@/actions/esop"

const ENTITIES = [
  { value: "LSC", label: "League Sports Co" },
  { value: "TBR", label: "Team Blue Rising" },
  { value: "FSP", label: "Future of Sports" },
  { value: "XTZ", label: "XTZ Esports Tech" },
  { value: "XTE", label: "XTE" },
]

const SPORTS = [
  { value: "", label: "— None —" },
  { value: "BOWLING", label: "Bowl & Darts" },
  { value: "SQUASH", label: "Squash" },
  { value: "BASKETBALL", label: "Basketball" },
  { value: "WORLD_PONG", label: "Ping Pong" },
  { value: "FOUNDATION", label: "Foundation Events" },
]

const HOLDER_TYPES = [
  { value: "employee", label: "Employee" },
  { value: "founder", label: "Founder" },
  { value: "investor", label: "Investor" },
  { value: "advisor", label: "Advisor" },
]

const SHARE_CLASSES = [
  { value: "options", label: "Options" },
  { value: "common", label: "Common" },
  { value: "preferred_a", label: "Preferred A" },
  { value: "preferred_b", label: "Preferred B" },
]

const VESTING_TYPES = [
  { value: "STANDARD_4Y_1Y_CLIFF", label: "4Y / 1Y Cliff" },
  { value: "GRADED", label: "Graded" },
  { value: "MILESTONE", label: "Milestone" },
  { value: "CUSTOM", label: "Custom" },
]

export function NewGrantForm() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await createEsopGrantAction(formData)
      setOpen(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors">
        <Plus className="size-4" />
        New Grant
      </SheetTrigger>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Equity Grant</SheetTitle>
        </SheetHeader>

        <form action={handleSubmit} className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Holder Name *</label>
              <Input name="employeeName" required placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Holder Email</label>
              <Input name="employeeEmail" type="email" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Entity *</label>
              <select
                name="entity"
                required
                defaultValue="LSC"
                aria-label="Entity"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {ENTITIES.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Sport / Property</label>
              <select
                name="sport"
                defaultValue=""
                aria-label="Sport"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {SPORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Holder Type</label>
              <select
                name="holderType"
                defaultValue="employee"
                aria-label="Holder type"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {HOLDER_TYPES.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Share Class</label>
              <select
                name="shareClass"
                defaultValue="options"
                aria-label="Share class"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {SHARE_CLASSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Total Shares *</label>
              <Input
                name="totalShares"
                type="number"
                required
                min={1}
                placeholder="10000"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Exercise Price</label>
              <Input
                name="exercisePrice"
                type="number"
                step="0.01"
                placeholder="0.10"
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Grant Date *</label>
            <Input name="grantDate" type="date" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Vesting Start</label>
              <Input name="vestingStartDate" type="date" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Vesting End</label>
              <Input name="vestingEndDate" type="date" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Vesting Type</label>
              <select
                name="vestingType"
                defaultValue="STANDARD_4Y_1Y_CLIFF"
                aria-label="Vesting type"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {VESTING_TYPES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cliff (months)</label>
              <Input name="cliffMonths" type="number" defaultValue={12} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Vesting (months)</label>
              <Input name="vestingMonths" type="number" defaultValue={48} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Agreement Reference</label>
            <Input
              name="agreementReference"
              placeholder="e.g. ESOP-2026-014"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving + syncing...
                </>
              ) : (
                "Create Grant"
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
