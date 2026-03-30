import { Badge } from "@/components/ui/badge"
import type { Priority } from "@/generated/prisma/client"
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        PRIORITY_COLORS[priority],
        priority === "CRITICAL" && "animate-pulse"
      )}
    >
      {PRIORITY_LABELS[priority]}
    </Badge>
  )
}
