import { requireSession } from "@/lib/auth"
import { LegalSidebar } from "@/components/shell/legal-sidebar"
import { LegalTopbar } from "@/components/shell/legal-topbar"
import { isGlobalDocumentUser } from "@/lib/document-access"
import { prisma } from "@/lib/prisma"

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()

  const globalAccess = await isGlobalDocumentUser(session)
  const checklistItems = globalAccess ? await prisma.projectChecklist.findMany({
    orderBy: [
      { done: "asc" },
      { priority: "asc" },
      { sort_order: "asc" },
      { created_at: "asc" },
    ],
  }) : []

  return (
    <div className="flex min-h-screen">
      <LegalSidebar
        userRole={session.role}
        globalAccess={globalAccess}
        userName={session.fullName}
        checklistItems={checklistItems}
      />
      <div className="flex min-w-0 flex-1 flex-col pl-16 lg:pl-64 lg:peer-data-[collapsed=true]:pl-16">
        <LegalTopbar userId={session.userId} />
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
