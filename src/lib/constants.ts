import type { LifecycleStatus, Priority, TrackerCategory } from "@/generated/prisma/client"

// Valid lifecycle transitions: from → allowed destinations
export const VALID_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["NEGOTIATION", "DRAFT"],
  NEGOTIATION: ["AWAITING_SIGNATURE", "IN_REVIEW"],
  AWAITING_SIGNATURE: ["SIGNED", "NEGOTIATION"],
  SIGNED: ["ACTIVE"],
  ACTIVE: ["EXPIRING", "TERMINATED"],
  EXPIRING: ["EXPIRED", "ACTIVE"],
  EXPIRED: [],
  TERMINATED: [],
}

export const LIFECYCLE_STATUS_LABELS: Record<LifecycleStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In Review",
  NEGOTIATION: "Negotiation",
  AWAITING_SIGNATURE: "Awaiting Signature",
  SIGNED: "Signed",
  ACTIVE: "Active",
  EXPIRING: "Expiring",
  EXPIRED: "Expired",
  TERMINATED: "Terminated",
}

export const LIFECYCLE_STATUS_COLORS: Record<LifecycleStatus, string> = {
  DRAFT: "bg-slate-400/10 text-slate-400 border-slate-400/20",
  IN_REVIEW: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  NEGOTIATION: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  AWAITING_SIGNATURE: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  SIGNED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  ACTIVE: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  EXPIRING: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  EXPIRED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  TERMINATED: "bg-red-700/10 text-red-500 border-red-700/20",
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  CRITICAL: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  HIGH: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  MEDIUM: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  LOW: "bg-slate-400/10 text-slate-400 border-slate-400/20",
}

export const TRACKER_CATEGORY_LABELS: Record<TrackerCategory, string> = {
  PLATFORM: "Platform",
  VAUNT_ACQUISITION: "Vaunt Acquisition",
  KEY_AGREEMENTS: "Key Agreements",
  CORPORATE: "Corporate",
  PAYMENTS: "Payments",
  IP_PATENTS: "IP & Patents",
  GIG_MARKETING: "Gig / Marketing",
  OTHER: "Other",
}

export const ENTITIES = [
  { value: "LSC", label: "League Sports Co" },
  { value: "TBR", label: "Team Blue Rising" },
  { value: "FSP", label: "Future of Sports" },
  { value: "XTZ", label: "XTZ Esports Tech" },
  { value: "XTE", label: "XTE" },
] as const

/**
 * Sports are stored on rows that previously used a sport-specific Entity
 * enum value. After the Finance integration migration, sport tournaments
 * collapse into entity=FSP plus this string. Keep in sync with Finance.
 */
export const SPORTS = [
  "BOWLING",
  "SQUASH",
  "BASKETBALL",
  "WORLD_PONG",
  "FOUNDATION",
] as const

export const SPORT_LABELS: Record<string, string> = {
  BOWLING: "Bowl & Darts",
  SQUASH: "Squash",
  BASKETBALL: "Basketball",
  WORLD_PONG: "Ping Pong",
  FOUNDATION: "Foundation Events",
}

export function formatAED(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(d)
}

export function daysUntil(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  return Math.ceil((d.getTime() - now.getTime()) / 86400000)
}
