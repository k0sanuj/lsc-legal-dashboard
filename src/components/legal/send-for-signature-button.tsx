'use client'

import { useTransition } from 'react'
import { sendForSignature } from '@/actions/hellosign'
import { Button } from '@/components/ui/button'
import { PenTool, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface SendForSignatureButtonProps {
  documentId: string
  disabled?: boolean
  pendingCount: number
}

export function SendForSignatureButton({
  documentId,
  disabled = false,
  pendingCount,
}: SendForSignatureButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await sendForSignature(documentId)
      if (result.success) {
        toast.success('Signature request sent', {
          description: `${pendingCount} signator${pendingCount === 1 ? 'y' : 'ies'} notified via HelloSign`,
        })
      } else {
        toast.error('Failed to send', {
          description: result.error ?? 'An unexpected error occurred',
        })
      }
    })
  }

  return (
    <Button
      onClick={handleClick}
      disabled={disabled || isPending || pendingCount === 0}
      className="bg-violet-600 text-white hover:bg-violet-700 border-violet-500/20"
      size="sm"
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <PenTool className="h-3.5 w-3.5" />
      )}
      Send for Signature ({pendingCount} pending)
    </Button>
  )
}
