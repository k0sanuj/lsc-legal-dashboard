'use client'

import { useState, useTransition } from 'react'
import { createIncomingNotice } from '@/actions/notices'
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
import type { NoticeCategory } from '@/generated/prisma/client'

const NOTICE_CATEGORIES: { value: NoticeCategory; label: string }[] = [
  { value: 'DATA_PROTECTION', label: 'Data Protection' },
  { value: 'COMPLAINT', label: 'Complaint' },
  { value: 'LEGAL_NOTICE', label: 'Legal Notice' },
  { value: 'REGULATORY', label: 'Regulatory' },
  { value: 'OTHER', label: 'Other' },
]

export function IncomingNoticeForm() {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<NoticeCategory>('OTHER')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim()) return

    startTransition(async () => {
      const result = await createIncomingNotice({
        subject: subject.trim(),
        from_email: fromEmail.trim() || undefined,
        body: body.trim() || undefined,
        category,
      })
      if (result.success) {
        setSubject('')
        setFromEmail('')
        setBody('')
        setCategory('OTHER')
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Log Notice
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Incoming Notice</DialogTitle>
          <DialogDescription>
            Record an incoming legal notice, complaint, or regulatory communication.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="notice-subject" className="text-sm font-medium">Subject</label>
            <Input
              id="notice-subject"
              placeholder="Notice subject..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="notice-category" className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={(v) => setCategory(v as NoticeCategory)}>
              <SelectTrigger id="notice-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="notice-email" className="text-sm font-medium">From (email)</label>
            <Input
              id="notice-email"
              type="email"
              placeholder="sender@example.com"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="notice-body" className="text-sm font-medium">Details</label>
            <Textarea
              id="notice-body"
              placeholder="Additional details..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!subject.trim() || isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Log Notice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
