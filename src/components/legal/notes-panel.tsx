'use client'

import { useState, useTransition } from 'react'
import { addDocumentNote } from '@/actions/notes'
import { formatRelativeDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StickyNote, Loader2, Send } from 'lucide-react'

interface Note {
  id: string
  content: string
  created_at: Date | string
  author: { full_name: string }
}

interface NotesPanelProps {
  documentId: string
  notes: Note[]
}

export function NotesPanel({ documentId, notes }: NotesPanelProps) {
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    startTransition(async () => {
      const result = await addDocumentNote(documentId, content)
      if (result.success) setContent('')
    })
  }

  return (
    <div className="space-y-4">
      {/* Add note form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          placeholder="Add a note..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[80px] bg-muted/30 border-border/50"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!content.trim() || isPending}>
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Add Note
          </Button>
        </div>
      </form>

      {/* Notes timeline */}
      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <StickyNote className="h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No notes yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border border-border/50 bg-card p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{note.author.full_name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeDate(note.created_at)}
                </span>
              </div>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                {note.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
