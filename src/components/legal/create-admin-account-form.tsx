'use client'

import { useState, useTransition } from 'react'
import { createAdminAccount } from '@/actions/kyc'
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
  { value: 'LSC', label: 'LSC' },
  { value: 'TBR', label: 'TBR' },
  { value: 'FSP', label: 'FSP' },
]

export function CreateAdminAccountForm() {
  const [open, setOpen] = useState(false)
  const [entity, setEntity] = useState('LSC')
  const [twoFactor, setTwoFactor] = useState('true')
  const [recoveryDoc, setRecoveryDoc] = useState('false')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set('entity', entity)
    formData.set('two_factor_enabled', twoFactor)
    formData.set('recovery_documented', recoveryDoc)

    startTransition(async () => {
      const result = await createAdminAccount(formData)
      if (result.success) {
        form.reset()
        setEntity('LSC')
        setTwoFactor('true')
        setRecoveryDoc('false')
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add Account
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Admin Account</DialogTitle>
          <DialogDescription>
            Register a platform admin account for audit tracking.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
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
            <label className="text-xs text-muted-foreground">Platform Name *</label>
            <Input name="platform_name" placeholder="e.g. AWS Console" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Platform URL</label>
            <Input name="platform_url" type="url" placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Account Holder *</label>
            <Input name="account_holder" placeholder="e.g. Anuj Singh" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Access Level</label>
            <Input name="access_level" placeholder="e.g. Owner, Admin, Editor" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">2FA Enabled</label>
              <Select value={twoFactor} onValueChange={(v) => setTwoFactor(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Recovery Documented</label>
              <Select value={recoveryDoc} onValueChange={(v) => setRecoveryDoc(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add Account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
