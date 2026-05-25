import { randomBytes } from "node:crypto"
import { config } from "dotenv"
import pg from "pg"
import bcrypt from "bcryptjs"

config({ path: ".env" })
config({ path: ".env.local", override: true })

const users = [
  {
    email: "anuj@leaguesportsco.com",
    fullName: "Anuj Kumar Singh",
    role: "PLATFORM_ADMIN",
  },
  {
    email: "ak@leaguesportsco.com",
    fullName: "Adi K Mishra",
    role: "PLATFORM_ADMIN",
  },
  {
    email: "adi@leaguesportsco.com",
    fullName: "Adi K Mishra",
    role: "PLATFORM_ADMIN",
  },
]

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12)

  for (const user of users) {
    await pool.query(
      `
        INSERT INTO "AppUser" ("id", "full_name", "email", "role", "password_hash", "is_active", "created_at", "updated_at")
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("email") DO UPDATE SET
          "full_name" = EXCLUDED."full_name",
          "role" = EXCLUDED."role",
          "is_active" = true,
          "updated_at" = CURRENT_TIMESTAMP
      `,
      [user.fullName, user.email, user.role, passwordHash]
    )
  }

  console.log(`Provisioned ${users.length} passwordless access accounts.`)
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
  .finally(async () => {
    await pool.end()
  })
