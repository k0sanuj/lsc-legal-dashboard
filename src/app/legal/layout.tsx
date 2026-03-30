import { requireSession } from "@/lib/auth"
import { LegalSidebar } from "@/components/shell/legal-sidebar"
import { LegalTopbar } from "@/components/shell/legal-topbar"

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()

  return (
    <div className="flex min-h-screen">
      <LegalSidebar userRole={session.role} userName={session.fullName} />
      <div className="flex flex-1 flex-col pl-64">
        <LegalTopbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
