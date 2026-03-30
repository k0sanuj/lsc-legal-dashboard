# Component Patterns — LSC Legal Dashboard

## File Organization

```
src/components/
  ui/                    # shadcn/ui primitives (auto-generated)
  legal/                 # Legal domain components
  charts/                # Recharts wrappers
  shell/                 # Layout shell components
```

## Server vs Client Component Rules

**Server Components** (default — no directive needed):
- Page components (`page.tsx`)
- Layout components (`layout.tsx`)
- Data display components that receive data via props
- Static UI components

**Client Components** (`'use client'` at top):
- Anything with `useState`, `useEffect`, event handlers
- Kanban boards (drag-and-drop)
- Filter bars (interactive dropdowns)
- Form components
- Chart components (Recharts requires client)
- Tabs with interactive switching
- Modals/dialogs with open/close state

## Pattern: Server Component Page with Client Islands

```tsx
// src/app/legal/documents/page.tsx (Server Component)
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DocumentFilters } from '@/components/legal/document-filters'
import { DocumentTable } from '@/components/legal/document-table'

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>
}) {
  await requireSession()
  const params = await searchParams

  const documents = await prisma.legalDocument.findMany({
    where: {
      ...(params.q && { title: { contains: params.q, mode: 'insensitive' } }),
      ...(params.category && { category: params.category }),
      ...(params.status && { lifecycle_status: params.status }),
    },
    orderBy: { updated_at: 'desc' },
    include: { owner: { select: { full_name: true } } },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <CreateDocumentButton />
      </div>
      <DocumentFilters />           {/* Client Component */}
      <DocumentTable data={documents} />  {/* Can be server if no interactivity */}
    </div>
  )
}
```

## Pattern: Lifecycle Badge

```tsx
// src/components/legal/lifecycle-badge.tsx
import { Badge } from '@/components/ui/badge'
import { LifecycleStatus } from '@/generated/prisma'

const STATUS_STYLES: Record<LifecycleStatus, string> = {
  DRAFT:               'bg-slate-400/10 text-slate-400 border-slate-400/20',
  IN_REVIEW:           'bg-sky-500/10 text-sky-400 border-sky-500/20',
  NEGOTIATION:         'bg-amber-500/10 text-amber-400 border-amber-500/20',
  AWAITING_SIGNATURE:  'bg-violet-500/10 text-violet-400 border-violet-500/20',
  SIGNED:              'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  ACTIVE:              'bg-blue-500/10 text-blue-400 border-blue-500/20',
  EXPIRING:            'bg-rose-500/10 text-rose-400 border-rose-500/20',
  EXPIRED:             'bg-slate-500/10 text-slate-500 border-slate-500/20',
  TERMINATED:          'bg-red-700/10 text-red-500 border-red-700/20',
}

const STATUS_LABELS: Record<LifecycleStatus, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  NEGOTIATION: 'Negotiation',
  AWAITING_SIGNATURE: 'Awaiting Signature',
  SIGNED: 'Signed',
  ACTIVE: 'Active',
  EXPIRING: 'Expiring',
  EXPIRED: 'Expired',
  TERMINATED: 'Terminated',
}

export function LifecycleBadge({ status }: { status: LifecycleStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
```

## Pattern: Stat Card

```tsx
// Stat card with gradient accent
interface StatCardProps {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  trend?: { value: number; label: string }
  accentColor?: string // tailwind color like 'blue' | 'emerald' | 'rose' | 'amber'
}

export function StatCard({ title, value, icon: Icon, trend, accentColor = 'blue' }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-card border border-border/50 p-6">
      <div className={`absolute inset-0 bg-gradient-to-br from-${accentColor}-500/5 to-transparent`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <Icon className={`h-5 w-5 text-${accentColor}-500`} />
        </div>
        <p className="mt-2 text-3xl font-bold font-mono tabular-nums">{value}</p>
        {trend && (
          <p className={`mt-1 text-xs ${trend.value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
          </p>
        )}
      </div>
    </div>
  )
}
```

## Pattern: Recharts Wrapper

```tsx
// src/components/charts/donut-chart.tsx
'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#0ea5e9', '#94a3b8']

interface DonutChartProps {
  data: { name: string; value: number }[]
  innerRadius?: number
  outerRadius?: number
}

export function DonutChart({ data, innerRadius = 60, outerRadius = 90 }: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            color: '#f8fafc',
            fontFamily: 'var(--font-mono)',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

## Pattern: Kanban Board

```tsx
// src/components/legal/signature-kanban.tsx
'use client'

import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { updateSignatureStatus } from '@/actions/signatures'

interface KanbanColumn {
  id: string
  title: string
  color: string       // tailwind color class
  items: KanbanCard[]
}

interface KanbanCard {
  id: string
  title: string
  parties: string
  daysInStatus: number
  value: string
  entity: string
}

// Column component with droppable area
// Card component with draggable wrapper
// DndContext at the board level
// onDragEnd calls server action to update status
```

## Pattern: Filter Bar

```tsx
// src/components/legal/document-filters.tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function DocumentFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/legal/documents?${params.toString()}`)
  }

  // Render filter controls...
}
```

## Pattern: SLA Countdown Badge

```tsx
// src/components/legal/issue-sla-badge.tsx
import { Badge } from '@/components/ui/badge'
import { differenceInHours, differenceInDays } from 'date-fns'

export function SLABadge({ deadline }: { deadline: Date }) {
  const now = new Date()
  const hoursRemaining = differenceInHours(deadline, now)
  const daysRemaining = differenceInDays(deadline, now)

  if (hoursRemaining < 0) {
    return <Badge className="bg-rose-500/10 text-rose-400 animate-pulse">OVERDUE</Badge>
  }
  if (daysRemaining < 1) {
    return <Badge className="bg-rose-500/10 text-rose-400">{hoursRemaining}h left</Badge>
  }
  if (daysRemaining < 3) {
    return <Badge className="bg-amber-500/10 text-amber-400">{daysRemaining}d left</Badge>
  }
  return <Badge className="bg-emerald-500/10 text-emerald-400">{daysRemaining}d left</Badge>
}
```

## Pattern: Activity Feed

```tsx
// Recent activity with icon + timestamp
const ACTIVITY_ICONS = {
  transition: ArrowRight,
  signature: PenTool,
  issue: AlertCircle,
  document: FileText,
  compliance: Shield,
}

// Each item: icon | description | actor | relative timestamp
// "Anuj transitioned 'TBR Sponsorship' from Draft to In Review — 2h ago"
```

## Formatting Utilities

```typescript
// src/lib/format.ts
export function formatAED(amount: number): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatRelativeDate(date: Date): string {
  // "2h ago", "3d ago", "Mar 15"
}

export function formatSLACountdown(deadline: Date): string {
  // "4d 6h remaining" or "OVERDUE by 2d"
}
```

## Import Aliases
All imports use the `@/` alias mapped to `src/`:
```typescript
import { Button } from '@/components/ui/button'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth'
import { LifecycleBadge } from '@/components/legal/lifecycle-badge'
```
