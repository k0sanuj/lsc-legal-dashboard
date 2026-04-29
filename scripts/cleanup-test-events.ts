import "dotenv/config"
import { prisma } from "@/lib/prisma"
async function main() {
  const result = await prisma.crossModuleEvent.deleteMany({
    where: { entity_id: "synthetic-test-id" }
  })
  console.log("Deleted synthetic test rows:", result.count)
  await prisma.$disconnect()
}
main()
