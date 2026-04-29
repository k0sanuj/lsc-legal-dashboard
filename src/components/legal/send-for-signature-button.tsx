'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import HelloSign from 'hellosign-embedded'
import { createEmbeddedSignatureDraft } from '@/actions/hellosign'
import { Button } from '@/components/ui/button'
import { PenTool, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DropboxSignPrepButtonProps {
  documentId: string
  disabled?: boolean
  pendingCount: number
  compact?: boolean
  stopPropagation?: boolean
}

function getEmbeddedErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const message = record.message ?? record.code
    if (typeof message === 'string') return message
  }
  return 'The embedded session failed.'
}

export function DropboxSignPrepButton({
  documentId,
  disabled = false,
  pendingCount,
  compact = false,
  stopPropagation = false,
}: DropboxSignPrepButtonProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    startTransition(async () => {
      const result = await createEmbeddedSignatureDraft(documentId)
      if (result.success && 'clientId' in result) {
        const client = new HelloSign({ clientId: result.clientId })

        client.on('send', () => {
          toast.success('Signature request sent', {
            description: `${pendingCount} signer${pendingCount === 1 ? '' : 's'} notified via Dropbox Sign`,
          })
          router.refresh()
        })
        client.on('cancel', () => {
          toast.message('Dropbox Sign preparation canceled')
        })
        client.on('error', (payload) => {
          toast.error('Dropbox Sign error', {
            description: getEmbeddedErrorMessage(payload),
          })
        })
        client.on('close', () => {
          router.refresh()
        })

        client.open(result.claimUrl, {
          testMode: result.testMode,
          skipDomainVerification: result.testMode,
        })
        toast.success('Dropbox Sign opened', {
          description: 'Place fields and send from the embedded Dropbox Sign editor.',
        })
        return
      }

      toast.error('Failed to prepare signature request', {
        description: result.error ?? 'An unexpected error occurred',
      })
    })
  }

  return (
    <Button
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation()
        handleClick()
      }}
      onPointerDown={(event) => {
        if (stopPropagation) event.stopPropagation()
      }}
      disabled={disabled || isPending || pendingCount === 0}
      className={cn(
        !compact && 'bg-violet-600 text-white hover:bg-violet-700 border-violet-500/20'
      )}
      variant={compact ? 'outline' : 'default'}
      size={compact ? 'xs' : 'sm'}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <PenTool className="h-3.5 w-3.5" />
      )}
      {compact
        ? 'Prepare'
        : `Prepare in Dropbox Sign (${pendingCount} pending)`}
    </Button>
  )
}

export const SendForSignatureButton = DropboxSignPrepButton
