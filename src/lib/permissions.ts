import type { UserRole } from "@/generated/prisma/client"

const ALL_ROLES: UserRole[] = [
  "PLATFORM_ADMIN",
  "FINANCE_ADMIN",
  "LEGAL_ADMIN",
  "OPS_ADMIN",
  "FSP_FINANCE",
  "COMMERCIAL_OFFICER",
  "TEAM_MEMBER",
  "EXTERNAL_AUDITOR",
]

const ADMIN_ROLES: UserRole[] = [
  "PLATFORM_ADMIN",
  "FINANCE_ADMIN",
  "LEGAL_ADMIN",
  "OPS_ADMIN",
]

const LEGAL_WRITE_ROLES: UserRole[] = [
  "PLATFORM_ADMIN",
  "LEGAL_ADMIN",
  "OPS_ADMIN",
]

export const PAGE_PERMISSIONS: Record<string, UserRole[]> = {
  "/legal": ALL_ROLES,
  "/legal/documents": ALL_ROLES,
  "/legal/documents/[id]": ALL_ROLES,
  "/legal/signatures": ADMIN_ROLES,
  "/legal/generate": ADMIN_ROLES,
  "/legal/templates": ADMIN_ROLES,
  "/legal/expirations": [
    "PLATFORM_ADMIN",
    "FINANCE_ADMIN",
    "LEGAL_ADMIN",
    "OPS_ADMIN",
  ],
  "/legal/compliance": [
    "PLATFORM_ADMIN",
    "LEGAL_ADMIN",
    "OPS_ADMIN",
  ],
  "/legal/esop": [
    "PLATFORM_ADMIN",
    "FINANCE_ADMIN",
    "LEGAL_ADMIN",
    "OPS_ADMIN",
  ],
  "/legal/esop/[id]": [
    "PLATFORM_ADMIN",
    "FINANCE_ADMIN",
    "LEGAL_ADMIN",
    "OPS_ADMIN",
  ],
  "/legal/policies": [
    "PLATFORM_ADMIN",
    "FINANCE_ADMIN",
    "LEGAL_ADMIN",
    "OPS_ADMIN",
    "FSP_FINANCE",
    "TEAM_MEMBER",
  ],
  "/legal/issues": [
    "PLATFORM_ADMIN",
    "FINANCE_ADMIN",
    "LEGAL_ADMIN",
    "OPS_ADMIN",
    "FSP_FINANCE",
    "COMMERCIAL_OFFICER",
    "TEAM_MEMBER",
  ],
  "/legal/tracker": ADMIN_ROLES,
  "/legal/payment-cycles": ADMIN_ROLES,
  "/legal/documents/review": [
    "PLATFORM_ADMIN",
    "LEGAL_ADMIN",
    "OPS_ADMIN",
  ],
}

export function canAccessPage(role: UserRole, path: string): boolean {
  // Normalize dynamic segments
  const normalized = path.replace(/\/[a-f0-9-]{36}/g, "/[id]")
  const allowedRoles = PAGE_PERMISSIONS[normalized]
  if (!allowedRoles) return false
  return allowedRoles.includes(role)
}

export function getNavigationItems(role: UserRole) {
  return NAV_ITEMS.filter((item) => {
    const allowedRoles = PAGE_PERMISSIONS[item.href]
    return allowedRoles?.includes(role)
  })
}

export interface NavItem {
  label: string
  href: string
  icon: string
  group: string
}

export const NAV_ITEMS: NavItem[] = [
  // Overview
  { label: "Command Center", href: "/legal", icon: "LayoutDashboard", group: "Overview" },

  // Documents
  { label: "Documents", href: "/legal/documents", icon: "FileText", group: "Documents" },
  { label: "Review Queue", href: "/legal/documents/review", icon: "MessageSquare", group: "Documents" },
  { label: "Signatures", href: "/legal/signatures", icon: "PenTool", group: "Documents" },
  { label: "Templates", href: "/legal/templates", icon: "LayoutTemplate", group: "Documents" },
  { label: "AI Generator", href: "/legal/generate", icon: "Sparkles", group: "Documents" },

  // Compliance
  { label: "Expirations", href: "/legal/expirations", icon: "Clock", group: "Compliance" },
  { label: "Compliance", href: "/legal/compliance", icon: "ShieldCheck", group: "Compliance" },
  { label: "Payment Cycles", href: "/legal/payment-cycles", icon: "CreditCard", group: "Compliance" },

  // Operations
  { label: "ESOP", href: "/legal/esop", icon: "TrendingUp", group: "Operations" },
  { label: "Policies", href: "/legal/policies", icon: "BookOpen", group: "Operations" },
  { label: "Issues", href: "/legal/issues", icon: "AlertCircle", group: "Operations" },
  { label: "Tracker", href: "/legal/tracker", icon: "ListChecks", group: "Operations" },
]
