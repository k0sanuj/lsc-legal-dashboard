import { Badge } from "@/components/ui/badge"
import type { LifecycleStatus } from "@/generated/prisma/client"
import {
  LIFECYCLE_STATUS_LABELS,
  LIFECYCLE_STATUS_COLORS,
} from "@/lib/constants"

export function LifecycleBadge({ status }: { status: LifecycleStatus }) {
  return (
    <Badge variant="outline" className={LIFECYCLE_STATUS_COLORS[status]}>
      {LIFECYCLE_STATUS_LABELS[status]}
    </Badge>
  )
}
