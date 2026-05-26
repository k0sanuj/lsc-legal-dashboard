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
    fullName: "AK",
    role: "PLATFORM_ADMIN",
  },
  {
    email: "adi@leaguesportsco.com",
    fullName: "Adi",
    role: "PLATFORM_ADMIN",
  },
]

const resetPasswords = process.argv.includes("--reset-passwords")
const deactivateOthers = process.argv.includes("--deactivate-others")

function generatePassword() {
  return randomBytes(24).toString("base64url")
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const generated = []

  try {
    for (const user of users) {
      const password = generatePassword()
      const passwordHash = await bcrypt.hash(password, 12)

      await pool.query(
        `
          INSERT INTO "AppUser" ("id", "full_name", "email", "role", "password_hash", "is_active", "created_at", "updated_at")
          VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("email") DO UPDATE SET
            "full_name" = EXCLUDED."full_name",
            "role" = EXCLUDED."role",
            "is_active" = true,
            "password_hash" = CASE
              WHEN $5::boolean THEN EXCLUDED."password_hash"
              ELSE "AppUser"."password_hash"
            END,
            "updated_at" = CURRENT_TIMESTAMP
        `,
        [user.fullName, user.email, user.role, passwordHash, resetPasswords]
      )

      if (resetPasswords) {
        generated.push({ email: user.email, password })
      }
    }

    if (deactivateOthers) {
      await pool.query(
        `
          UPDATE "AppUser"
          SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP
          WHERE "email" <> ALL($1::text[])
        `,
        [users.map((user) => user.email)]
      )
    }
  } finally {
    await pool.end()
  }

  console.log(`Provisioned ${users.length} email/password access accounts.`)
  if (deactivateOthers) console.log("Deactivated all non-allowlisted AppUser accounts.")
  if (generated.length > 0) {
    console.log("Generated temporary passwords:")
    for (const entry of generated) {
      console.log(`${entry.email}: ${entry.password}`)
    }
  } else {
    console.log("Existing passwords were preserved. Pass --reset-passwords to generate new temporary passwords.")
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
