'use client'

/** Shared form feedback for the entity, review and matter registers. */
import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

export function EntityActionForm({ action, children, submitLabel = 'Save', className = '', reset = true }: {
  action: (form: FormData) => Promise<unknown>
  children: ReactNode
  submitLabel?: string
  className?: string
  reset?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const router = useRouter()
  return <form className={className} onSubmit={(event) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setMessage('')
    startTransition(async () => {
      try {
        const result = await action(data)
        if (result && typeof result === 'object' && 'error' in result && typeof result.error === 'string') throw new Error(result.error)
        setFailed(false)
        setMessage('Saved.')
        if (reset) form.reset()
        router.refresh()
      } catch (error) {
        setFailed(true)
        setMessage(error instanceof Error ? error.message : 'Unable to save. Please try again.')
      }
    })
  }}>
    <fieldset disabled={pending} className="contents">{children}</fieldset>
    <div className="mt-4 flex flex-wrap items-center gap-4">
      <button disabled={pending} type="submit" className="border border-border px-4 py-2 text-sm text-foreground disabled:opacity-50">{pending ? 'Saving...' : submitLabel}</button>
      <p role={failed ? 'alert' : 'status'} className={failed ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message}</p>
    </div>
  </form>
}
