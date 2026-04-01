'use client'

import { useState, useTransition } from 'react'
import { createSubsidy } from '@/actions/kyc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2 } from 'lucide-react'

const ENTITIES = [
  { value: 'LSC', label: 'LSC' },
  { value: 'TBR', label: 'TBR' },
  { value: 'FSP', label: 'FSP' },
]

const JURISDICTIONS = [
  { value: 'UAE', label: 'UAE' },
  { value: 'US_DELAWARE', label: 'US (Delaware)' },
  { value: 'GLOBAL', label: 'Global' },
  { value: 'INDIA', label: 'India' },
  { value: 'KENYA', label: 'Kenya' },
  { value: 'UK', label: 'UK' },
  { value: 'SINGAPORE', label: 'Singapore' },
  { value: 'CAYMAN', label: 'Cayman' },
]

export function CreateSubsidyForm() {
  const [open, setOpen] = useState(false)
  const [entity, setEntity] = useState('LSC')
  const [jurisdiction, setJurisdiction] = useState('UAE')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set('entity', entity)
    formData.set('jurisdiction', jurisdiction)

    startTransition(async () => {
      const result = await createSubsidy(formData)
      if (result.success) {
        form.reset()
        setEntity('LSC')
        setJurisdiction('UAE')
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add Subsidy
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Subsidy</DialogTitle>
          <DialogDescription>
            Track a government or institutional subsidy or grant.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Title *</label>
            <Input name="title" placeholder="e.g. Dubai SME Innovation Grant" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Entity</label>
              <Select value={entity} onValueChange={(v) => setEntity(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITIES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Jurisdiction</label>
              <Select value={jurisdiction} onValueChange={(v) => setJurisdiction(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JURISDICTIONS.map((j) => (
                    <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Source</label>
            <Input name="source" placeholder="e.g. Dubai SME" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Amount (AED)</label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="font-mono tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Conditions</label>
            <Textarea
              name="conditions"
              placeholder="Any conditions or requirements..."
              className="min-h-[80px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Website URL</label>
            <Input name="website_url" type="url" placeholder="https://..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add Subsidy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
