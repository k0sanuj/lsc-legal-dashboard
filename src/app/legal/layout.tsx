import { requireSession } from "@/lib/auth"
import { LegalSidebar } from "@/components/shell/legal-sidebar"
import { LegalTopbar } from "@/components/shell/legal-topbar"
import { prisma } from "@/lib/prisma"

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()

  const checklistItems = await prisma.projectChecklist.findMany({
    orderBy: [
      { done: "asc" },
      { priority: "asc" },
      { sort_order: "asc" },
      { created_at: "asc" },
    ],
  })

  return (
    <div className="flex min-h-screen">
      <LegalSidebar
        userRole={session.role}
        userName={session.fullName}
        checklistItems={checklistItems}
      />
      <div className="flex flex-1 flex-col pl-64">
        <LegalTopbar userId={session.userId} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
