import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env" })
loadEnv({ path: ".env.local", override: true })

async function main() {
  const { prisma } = await import("@/lib/prisma")
  const result = await prisma.crossModuleEvent.deleteMany({
    where: {
      OR: [
        { entity_id: "synthetic-test-id" },
        { entity_id: { startsWith: "synthetic-test-tranche-" } },
      ],
    },
  })
  console.log("Deleted synthetic test rows:", result.count)
  await prisma.$disconnect()
}
main()
