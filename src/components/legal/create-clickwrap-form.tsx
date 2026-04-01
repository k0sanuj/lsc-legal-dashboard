'use client'

import { useState, useTransition } from 'react'
import { createClickwrapAcceptance } from '@/actions/clickwrap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  { value: '_none', label: 'None' },
  { value: 'LSC', label: 'LSC' },
  { value: 'TBR', label: 'TBR' },
  { value: 'FSP', label: 'FSP' },
]

export function CreateClickwrapForm() {
  const [open, setOpen] = useState(false)
  const [entity, setEntity] = useState('_none')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    if (entity && entity !== '_none') {
      formData.set('entity', entity)
    } else {
      formData.delete('entity')
    }

    startTransition(async () => {
      const result = await createClickwrapAcceptance(formData)
      if (result.success) {
        form.reset()
        setEntity('_none')
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Log Acceptance
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Clickwrap Acceptance</DialogTitle>
          <DialogDescription>
            Record a clickwrap or terms-of-service acceptance event.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Person Name *</label>
              <Input name="person_name" placeholder="Full name" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Person Email *</label>
              <Input name="person_email" type="email" placeholder="email@example.com" required />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Agreement Title *</label>
            <Input name="agreement_title" placeholder="e.g. Platform Terms of Service" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Agreement Version</label>
              <Input
                name="agreement_version"
                type="number"
                min="1"
                defaultValue="1"
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Entity (optional)</label>
              <Select value={entity} onValueChange={(v) => setEntity(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select entity" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITIES.map((e) => (
                    <SelectItem key={e.value || '_none'} value={e.value || '_none'}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">IP Address</label>
            <Input name="ip_address" placeholder="e.g. 192.168.1.1" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Log Acceptance
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
