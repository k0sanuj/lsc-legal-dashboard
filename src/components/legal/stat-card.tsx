import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: { value: number; label: string }
  accentColor?: string
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  accentColor = "primary",
}: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-card border border-border/50 p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <Icon className={`h-5 w-5 text-${accentColor}`} />
        </div>
        <p className="mt-2 text-3xl font-bold font-figures">{value}</p>
        {trend && (
          <p
            className={`mt-1 text-xs ${trend.value >= 0 ? "text-positive" : "text-negative"}`}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}% {trend.label}
          </p>
        )}
      </div>
    </div>
  )
}
