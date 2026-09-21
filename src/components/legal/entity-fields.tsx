/** Compact server-rendered fields and source references for operational registers. */
import type { ReactNode } from 'react'
import { isWebReference } from '@/lib/entity-input'

export const fieldClass = 'w-full border border-border bg-background px-3 py-2 text-sm text-foreground'
export function EntityField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-xs text-muted-foreground">{label}{children}</label>
}
export function SourceReference({ value }: { value: string | null }) {
  return value ? isWebReference(value) ? <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary underline">Source evidence</a> : <span>{value}</span> : <span className="text-muted-foreground">Not supplied</span>
}
