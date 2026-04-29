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
  "/legal/expirations": ADMIN_ROLES,
  "/legal/compliance": ADMIN_ROLES,
  "/legal/compliance/data-protection": ADMIN_ROLES,
  "/legal/compliance/registered-offices": ADMIN_ROLES,
  "/legal/compliance/emails": ADMIN_ROLES,
  "/legal/esop": ADMIN_ROLES,
  "/legal/esop/[id]": ADMIN_ROLES,
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
  "/legal/documents/review": LEGAL_WRITE_ROLES,
  // New sections
  "/legal/litigation": ADMIN_ROLES,
  "/legal/litigation/[id]": ADMIN_ROLES,
  "/legal/kyc": ADMIN_ROLES,
  "/legal/admin-accounts": ADMIN_ROLES,
  "/legal/subsidies": ADMIN_ROLES,
  "/legal/email-intelligence": ADMIN_ROLES,
  "/legal/agreements": ALL_ROLES,
  "/legal/clickwrap": ADMIN_ROLES,
  "/legal/audit-reports": LEGAL_WRITE_ROLES,
  "/legal/agent-architecture": ADMIN_ROLES,
  "/legal/file-naming": ADMIN_ROLES,
  "/legal/table-config": LEGAL_WRITE_ROLES,
}

export function canAccessPage(role: UserRole, path: string): boolean {
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

  // Documents & Agreements
  { label: "Agreements", href: "/legal/agreements", icon: "Handshake", group: "Agreements" },
  { label: "Documents", href: "/legal/documents", icon: "FileText", group: "Agreements" },
  { label: "Review Queue", href: "/legal/documents/review", icon: "MessageSquare", group: "Agreements" },
  { label: "Signatures", href: "/legal/signatures", icon: "PenTool", group: "Agreements" },
  { label: "Templates", href: "/legal/templates", icon: "LayoutTemplate", group: "Agreements" },
  { label: "AI Generator", href: "/legal/generate", icon: "Sparkles", group: "Agreements" },
  { label: "Clickwrap", href: "/legal/clickwrap", icon: "MousePointerClick", group: "Agreements" },

  // Compliance & Risk
  { label: "Compliance", href: "/legal/compliance", icon: "ShieldCheck", group: "Compliance" },
  { label: "Data Protection", href: "/legal/compliance/data-protection", icon: "Lock", group: "Compliance" },
  { label: "Registered Offices", href: "/legal/compliance/registered-offices", icon: "Building", group: "Compliance" },
  { label: "Company Emails", href: "/legal/compliance/emails", icon: "Mail", group: "Compliance" },
  { label: "Expirations", href: "/legal/expirations", icon: "Clock", group: "Compliance" },
  { label: "Audit Reports", href: "/legal/audit-reports", icon: "ClipboardCheck", group: "Compliance" },

  // Legal Operations
  { label: "Litigation", href: "/legal/litigation", icon: "Gavel", group: "Legal Ops" },
  { label: "KYC", href: "/legal/kyc", icon: "UserCheck", group: "Legal Ops" },
  { label: "Admin Accounts", href: "/legal/admin-accounts", icon: "KeyRound", group: "Legal Ops" },
  { label: "Subsidies", href: "/legal/subsidies", icon: "Landmark", group: "Legal Ops" },
  { label: "Email Intel", href: "/legal/email-intelligence", icon: "Inbox", group: "Legal Ops" },

  // Finance & Corporate
  { label: "Payment Cycles", href: "/legal/payment-cycles", icon: "CreditCard", group: "Finance" },
  { label: "Cap Table", href: "/legal/esop", icon: "TrendingUp", group: "Finance" },

  // Integrations
  { label: "Finance Sync", href: "/legal/finance-sync", icon: "Webhook", group: "Integrations" },

  // Operations
  { label: "Policies", href: "/legal/policies", icon: "BookOpen", group: "Operations" },
  { label: "Issues", href: "/legal/issues", icon: "AlertCircle", group: "Operations" },
  { label: "Tracker", href: "/legal/tracker", icon: "ListChecks", group: "Operations" },

  // System
  { label: "Agent Architecture", href: "/legal/agent-architecture", icon: "Bot", group: "System" },
  { label: "File Naming", href: "/legal/file-naming", icon: "FileSignature", group: "System" },
  { label: "Table Config", href: "/legal/table-config", icon: "Settings2", group: "System" },
]
