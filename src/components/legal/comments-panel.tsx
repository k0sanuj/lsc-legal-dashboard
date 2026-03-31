'use client'

import { useState, useTransition } from 'react'
import { addDocumentComment, resolveDocumentComment } from '@/actions/comments'
import { formatRelativeDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Check, Loader2, MessageSquare, Send } from 'lucide-react'

interface Comment {
  id: string
  content: string
  resolved: boolean
  created_at: Date | string
  author: { full_name: string }
}

interface CommentsPanelProps {
  documentId: string
  comments: Comment[]
}

export function CommentsPanel({ documentId, comments }: CommentsPanelProps) {
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const unresolvedCount = comments.filter((c) => !c.resolved).length

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    startTransition(async () => {
      const result = await addDocumentComment(documentId, content)
      if (result.success) setContent('')
    })
  }

  function handleResolve(commentId: string) {
    setResolvingId(commentId)
    startTransition(async () => {
      await resolveDocumentComment(commentId, documentId)
      setResolvingId(null)
    })
  }

  return (
    <div className="space-y-4">
      {/* Unresolved badge */}
      {unresolvedCount > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
            {unresolvedCount} unresolved
          </Badge>
        </div>
      )}

      {/* Add comment form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          placeholder="Add a comment..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[80px] bg-muted/30 border-border/50"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!content.trim() || isPending}>
            {isPending && !resolvingId ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Add Comment
          </Button>
        </div>
      </form>

      {/* Comments list */}
      {comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No comments yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className={`rounded-lg border p-4 ${
                comment.resolved
                  ? 'border-border/30 bg-card/50 opacity-60'
                  : 'border-border/50 bg-card'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{comment.author.full_name}</span>
                  {comment.resolved && (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                      Resolved
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeDate(comment.created_at)}
                  </span>
                  {!comment.resolved && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-emerald-400"
                      onClick={() => handleResolve(comment.id)}
                      disabled={resolvingId === comment.id}
                      title="Resolve comment"
                    >
                      {resolvingId === comment.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                {comment.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
