"use client"

import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"

const ROUTE_LABELS: Record<string, string> = {
  "/legal": "Command Center",
  "/legal/documents": "Documents",
  "/legal/signatures": "Signatures",
  "/legal/generate": "AI Generator",
  "/legal/templates": "Templates",
  "/legal/expirations": "Expirations",
  "/legal/compliance": "Compliance",
  "/legal/esop": "ESOP Contracts",
  "/legal/policies": "Policies",
  "/legal/issues": "Issues",
  "/legal/tracker": "Tracker",
  "/legal/payment-cycles": "Payment Cycles",
}

export function LegalTopbar() {
  const pathname = usePathname()

  // Build breadcrumb segments
  const segments = pathname.split("/").filter(Boolean)
  const currentLabel =
    ROUTE_LABELS[pathname] ??
    segments[segments.length - 1]?.replace(/-/g, " ") ??
    "Legal"

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-sm px-6">
      <nav className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">Legal</span>
        {pathname !== "/legal" && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="font-medium capitalize">{currentLabel}</span>
          </>
        )}
        {pathname === "/legal" && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="font-medium">Command Center</span>
          </>
        )}
      </nav>
    </header>
  )
}
