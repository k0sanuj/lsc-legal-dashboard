"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  FileText,
  PenTool,
  LayoutTemplate,
  Sparkles,
  Clock,
  ShieldCheck,
  CreditCard,
  TrendingUp,
  BookOpen,
  AlertCircle,
  ListChecks,
  MessageSquare,
  Scale,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Handshake,
  MousePointerClick,
  Lock,
  Building,
  Mail,
  ClipboardCheck,
  Gavel,
  UserCheck,
  KeyRound,
  Landmark,
  Inbox,
  Bot,
  FileSignature,
  Settings2,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { UserRole, Priority } from "@/generated/prisma/client"
import { getNavigationItems } from "@/lib/permissions"
import { SidebarChecklist } from "./sidebar-checklist"

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  FileText,
  PenTool,
  LayoutTemplate,
  Sparkles,
  Clock,
  ShieldCheck,
  CreditCard,
  TrendingUp,
  BookOpen,
  AlertCircle,
  ListChecks,
  MessageSquare,
  Handshake,
  MousePointerClick,
  Lock,
  Building,
  Mail,
  ClipboardCheck,
  Gavel,
  UserCheck,
  KeyRound,
  Landmark,
  Inbox,
  Bot,
  FileSignature,
  Settings2,
}

interface ChecklistItem {
  id: string
  title: string
  done: boolean
  priority: Priority
  category: string
  dependency_ids: string[]
  notes: string | null
  sort_order: number
}

interface LegalSidebarProps {
  userRole: UserRole
  userName: string
  checklistItems: ChecklistItem[]
}

export function LegalSidebar({ userRole, userName, checklistItems }: LegalSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const navItems = getNavigationItems(userRole)

  // Group items
  const groups = navItems.reduce<Record<string, typeof navItems>>(
    (acc, item) => {
      if (!acc[item.group]) acc[item.group] = []
      acc[item.group].push(item)
      return acc
    },
    {}
  )

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
          <Scale className="h-5 w-5 text-primary" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
              League Sports Co
            </p>
            <p className="text-sm font-semibold truncate">Legal OS</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            {!collapsed && (
              <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                {group}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = ICON_MAP[item.icon] ?? FileText
                const isActive =
                  item.href === "/legal"
                    ? pathname === "/legal"
                    : pathname.startsWith(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary font-medium border-l-2 border-sidebar-primary -ml-px"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Project Checklist */}
      <SidebarChecklist items={checklistItems} collapsed={collapsed} />

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-2 px-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {userName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{userName}</p>
              <p className="text-[10px] text-muted-foreground capitalize">
                {userRole.toLowerCase().replace(/_/g, " ")}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1">
          <form action="/api/auth/logout" method="POST" className="flex-1">
            <button
              type="submit"
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-colors",
                collapsed && "justify-center"
              )}
            >
              <LogOut className="h-3.5 w-3.5" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </form>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
