"use client"

import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { NotificationBell } from "./notification-bell"

const ROUTE_LABELS: Record<string, string> = {
  "/legal": "Command Center",
  "/legal/documents": "Documents",
  "/legal/documents/review": "Review Queue",
  "/legal/signatures": "Signatures",
  "/legal/generate": "AI Generator",
  "/legal/templates": "Templates",
  "/legal/expirations": "Expirations",
  "/legal/compliance": "Compliance",
  "/legal/compliance/data-protection": "Data Protection",
  "/legal/compliance/registered-offices": "Registered Offices",
  "/legal/compliance/emails": "Company Emails",
  "/legal/esop": "ESOP Contracts",
  "/legal/policies": "Policies",
  "/legal/issues": "Issues",
  "/legal/tracker": "Tracker",
  "/legal/payment-cycles": "Payment Cycles",
  "/legal/litigation": "Litigation",
  "/legal/kyc": "KYC",
  "/legal/admin-accounts": "Admin Accounts",
  "/legal/subsidies": "Subsidies",
  "/legal/email-intelligence": "Email Intelligence",
  "/legal/agreements": "Agreements",
  "/legal/clickwrap": "Clickwrap",
  "/legal/audit-reports": "Audit Reports",
  "/legal/agent-architecture": "Agent Architecture",
}

interface LegalTopbarProps {
  userId?: string
}

export function LegalTopbar({ userId }: LegalTopbarProps) {
  const pathname = usePathname()

  // Build breadcrumb segments
  const segments = pathname.split("/").filter(Boolean)
  const currentLabel =
    ROUTE_LABELS[pathname] ??
    segments[segments.length - 1]?.replace(/-/g, " ") ??
    "Legal"

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 backdrop-blur-sm px-6">
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
      <div className="flex items-center gap-2">
        {userId && <NotificationBell userId={userId} />}
      </div>
    </header>
  )
}
