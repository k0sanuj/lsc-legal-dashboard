/** Provision the explicitly confirmed v2 identities without replacing existing owner records. */
import { randomBytes } from "node:crypto"
import { hash } from "bcryptjs"
import { prisma } from "../src/lib/prisma"
import type { UserRole } from "../src/generated/prisma/client"

const principals: { email: string; legacyEmail?: string; fallbackRole: UserRole }[] = [
  { email: "legal@futureofsports.io", fallbackRole: "LEGAL_ADMIN" },
  { email: "ak@futureofsports.io", legacyEmail: "ak@leaguesportsco.com", fallbackRole: "PLATFORM_ADMIN" },
  { email: "arvind@futureofsports.io", legacyEmail: "arvind@leaguesportsco.com", fallbackRole: "LEGAL_ADMIN" },
  { email: "adi@futureofsports.io", legacyEmail: "adi@leaguesportsco.com", fallbackRole: "PLATFORM_ADMIN" },
  // Worker ownership and Workspace administration do not grant global document access.
  { email: "anuj@futureofsports.io", legacyEmail: "anuj@leaguesportsco.com", fallbackRole: "FINANCE_ADMIN" },
]

async function main() {
  const apply = process.argv.includes("--apply")
  for (const principal of principals) {
    const existing = await prisma.appUser.findUnique({ where: { email: principal.email } })
    if (existing) {
      console.log(JSON.stringify({ email: existing.email, status: "unchanged", active: existing.is_active, role: existing.role }))
      continue
    }
    const legacy = principal.legacyEmail ? await prisma.appUser.findUnique({ where: { email: principal.legacyEmail } }) : null
    const data = {
      email: principal.email,
      full_name: legacy?.full_name ?? principal.email,
      role: legacy?.role ?? principal.fallbackRole,
      // No shared or known password is created. The random input is never persisted or printed.
      password_hash: await hash(randomBytes(48).toString("base64url"), 12),
      is_active: true,
    }
    if (apply) await prisma.appUser.create({ data })
    console.log(JSON.stringify({ email: principal.email, status: apply ? "created_magic_link_only" : "would_create", role: data.role }))
  }
}

main().catch(() => { console.error("Account provisioning failed; inspect current identities before retrying"); process.exitCode = 1 }).finally(() => prisma.$disconnect())
