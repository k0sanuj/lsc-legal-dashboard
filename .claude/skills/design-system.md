# Design System — LSC Legal & Compliance Dashboard

## Philosophy
Elite, vibrant, dark-mode-first. This is NOT a subdued corporate tool — it's a command center for legal operations. High contrast, gradient accents, glow effects on interactive elements. Think Bloomberg Terminal meets Linear.

## Color Tokens (Tailwind v4 @theme inline in globals.css)

### Backgrounds
- `--background`: `#020617` (slate-950) — primary surface
- `--card`: `#0f172a` (slate-900) — card surfaces
- `--card-hover`: `#1e293b` (slate-800) — card hover state
- `--sidebar`: `#020617` (slate-950) — sidebar background
- `--popover`: `#0f172a` — dropdowns, dialogs
- `--muted`: `#1e293b` (slate-800) — muted backgrounds

### Foreground
- `--foreground`: `#f8fafc` (slate-50) — primary text
- `--card-foreground`: `#f1f5f9` (slate-100) — card text
- `--muted-foreground`: `#94a3b8` (slate-400) — secondary text
- `--popover-foreground`: `#f1f5f9`

### Semantic Colors
- `--primary`: `#3b82f6` (blue-500) — primary actions, active navigation
- `--primary-foreground`: `#ffffff`
- `--positive`: `#10b981` (emerald-500) — revenue, paid, signed, complete
- `--negative`: `#f43f5e` (rose-500) — costs, overdue, unverified, stalled
- `--warning`: `#f59e0b` (amber-500) — pending, approaching deadline
- `--info`: `#0ea5e9` (sky-500) — submitted, in progress
- `--accent`: `#8b5cf6` (violet-500) — special highlights, AI features

### Lifecycle Status Colors
| Status | Color | Tailwind Class |
|--------|-------|---------------|
| DRAFT | `slate-400` | `bg-slate-400/10 text-slate-400 border-slate-400/20` |
| IN_REVIEW | `sky-500` | `bg-sky-500/10 text-sky-400 border-sky-500/20` |
| NEGOTIATION | `amber-500` | `bg-amber-500/10 text-amber-400 border-amber-500/20` |
| AWAITING_SIGNATURE | `violet-500` | `bg-violet-500/10 text-violet-400 border-violet-500/20` |
| SIGNED | `emerald-500` | `bg-emerald-500/10 text-emerald-400 border-emerald-500/20` |
| ACTIVE | `blue-500` | `bg-blue-500/10 text-blue-400 border-blue-500/20` |
| EXPIRING | `rose-500` | `bg-rose-500/10 text-rose-400 border-rose-500/20` |
| EXPIRED | `slate-500` | `bg-slate-500/10 text-slate-500 border-slate-500/20` |
| TERMINATED | `red-700` | `bg-red-700/10 text-red-500 border-red-700/20` |

### Priority Colors
| Priority | Color |
|----------|-------|
| CRITICAL | `rose-500` with pulse animation |
| HIGH | `amber-500` |
| MEDIUM | `blue-500` |
| LOW | `slate-400` |

### Borders & Rings
- `--border`: `#1e293b` (slate-800) — default borders
- `--ring`: `#3b82f6` (blue-500) — focus rings
- `--input`: `#334155` (slate-700) — input borders

### Radius
- `--radius-sm`: `6px`
- `--radius-md`: `8px`
- `--radius-lg`: `12px`
- `--radius-xl`: `16px`

## Typography

### Fonts
- **Body**: Geist (loaded via `next/font/google` in layout.tsx)
- **Numbers/Code**: JetBrains Mono (loaded via `next/font/google`)
- Both assigned to CSS variables: `--font-sans`, `--font-mono`

### Scale
- Page title: `text-2xl font-bold tracking-tight`
- Section heading: `text-lg font-semibold`
- Card title: `text-sm font-medium text-muted-foreground`
- Body: `text-sm`
- Small/label: `text-xs text-muted-foreground`
- Financial figures: `font-mono tabular-nums`

## Component Patterns

### Cards
```tsx
// Standard card
<Card className="bg-card border-border/50 hover:border-border transition-colors">

// Featured/highlighted card (e.g., critical items)
<Card className="bg-card border-rose-500/20 shadow-rose-500/5 shadow-lg">

// Stat card with gradient accent
<div className="relative overflow-hidden rounded-xl bg-card border border-border/50 p-6">
  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
  <div className="relative">...</div>
</div>
```

### Badges
```tsx
// Lifecycle badge pattern
<Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
  SIGNED
</Badge>

// Priority badge
<Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse">
  CRITICAL
</Badge>
```

### Tables
- Use shadcn/ui `<Table>` with dark theme
- Row hover: `hover:bg-muted/50`
- Header: `text-xs uppercase tracking-wider text-muted-foreground`
- Zebra striping: NOT used (dark mode makes it cluttered)

### Navigation Sidebar
- Width: `w-64` (expanded), `w-16` (collapsed)
- Background: `bg-background` (slate-950)
- Active item: `bg-primary/10 text-primary border-l-2 border-primary`
- Hover: `hover:bg-muted/50`
- Group labels: `text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium`
- Separator between groups: `border-border/30`

### Charts (Recharts)
- Background: transparent (sits on card bg)
- Grid lines: `stroke="#1e293b"` (slate-800)
- Axis text: `fill="#94a3b8"` (slate-400), font: JetBrains Mono, size 11
- Tooltip: `bg-card border-border shadow-xl rounded-lg`
- Color palette: `["#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#0ea5e9"]`

### Kanban Boards
- Column bg: `bg-muted/30 rounded-xl`
- Column header: color-coded top border (4px)
- Cards: `bg-card border-border/50 rounded-lg p-4 shadow-sm`
- Drag ghost: `opacity-50 ring-2 ring-primary`

### Buttons
- Primary: `bg-primary hover:bg-primary/90 text-primary-foreground`
- Destructive: `bg-rose-500/10 text-rose-400 hover:bg-rose-500/20`
- Ghost: `hover:bg-muted/50`
- AI feature buttons: `bg-gradient-to-r from-violet-500 to-blue-500 text-white`

### Empty States
- Centered in container
- Icon (lucide) at 48px, `text-muted-foreground/50`
- Title: `text-lg font-medium`
- Description: `text-sm text-muted-foreground`
- CTA button below

### Loading States
- Skeleton: `bg-muted/50 animate-pulse rounded-md`
- Use shadcn/ui Skeleton component
- Match card layouts for content loading

## Verified/Unverified Badges (from PRD)
- Verified: `<Shield className="w-4 h-4 text-emerald-500" />` with tooltip "Document backed"
- Unverified: `<AlertTriangle className="w-4 h-4 text-rose-500" />` with tooltip "Missing backing document"

## Responsive Breakpoints
- Sidebar collapses to icon-only below `lg`
- Tables switch to card layout below `md`
- Stat grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Command center: stack sections below `lg`

## Animation & Transitions
- Card hover: `transition-colors duration-150`
- Sidebar expand/collapse: `transition-all duration-200 ease-in-out`
- Badge pulse (critical items): `animate-pulse`
- Page transitions: rely on Next.js built-in (no custom)
- Kanban drag: spring animation via @dnd-kit
