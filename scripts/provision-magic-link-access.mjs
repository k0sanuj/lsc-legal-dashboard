// Provision the three magic-link login accounts. Idempotent: safe to re-run.
//
// Magic link is the only login path. AppUser.password_hash is NOT NULL in the
// database, so rows are written with a bcrypt hash of a random secret that is
// never printed and never stored; it satisfies the column and can never be used
// to sign in.
//
//   node scripts/provision-magic-link-access.mjs
//   node scripts/provision-magic-link-access.mjs --deactivate-others
import { randomBytes } from "node:crypto"
import { config } from "dotenv"
import pg from "pg"
import bcrypt from "bcryptjs"

config({ path: ".env" })
config({ path: ".env.local", override: true })

const users = [
  {
    email: "anuj@futureofsports.io",
    fullName: "Anuj Kumar Singh",
    role: "PLATFORM_ADMIN",
  },
  {
    email: "ak@futureofsports.io",
    fullName: "AK",
    role: "PLATFORM_ADMIN",
  },
  {
    email: "adi@futureofsports.io",
    fullName: "Adi",
    role: "PLATFORM_ADMIN",
  },
]

const deactivateOthers = process.argv.includes("--deactivate-others")

async function unusablePasswordHash() {
  return bcrypt.hash(randomBytes(32).toString("base64url"), 12)
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const created = []
  const updated = []

  try {
    for (const user of users) {
      const passwordHash = await unusablePasswordHash()

      // Existing rows keep their stored hash untouched; it is unusable either
      // way now that no password login path exists.
      const result = await pool.query(
        `
          INSERT INTO "AppUser" ("id", "full_name", "email", "role", "password_hash", "is_active", "created_at", "updated_at")
          VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("email") DO UPDATE SET
            "full_name" = EXCLUDED."full_name",
            "role" = EXCLUDED."role",
            "is_active" = true,
            "updated_at" = CURRENT_TIMESTAMP
          RETURNING (xmax = 0) AS inserted
        `,
        [user.fullName, user.email, user.role, passwordHash]
      )

      if (result.rows[0]?.inserted) {
        created.push(user.email)
      } else {
        updated.push(user.email)
      }
    }

    if (deactivateOthers) {
      const result = await pool.query(
        `
          UPDATE "AppUser"
          SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP
          WHERE "email" <> ALL($1::text[]) AND "is_active" = true
        `,
        [users.map((user) => user.email)]
      )
      console.log(`Deactivated ${result.rowCount} non-allowlisted AppUser accounts.`)
    }
  } finally {
    await pool.end()
  }

  console.log(`Provisioned ${users.length} magic-link accounts as PLATFORM_ADMIN.`)
  if (created.length > 0) console.log(`Created: ${created.join(", ")}`)
  if (updated.length > 0) console.log(`Reactivated or updated: ${updated.join(", ")}`)
  console.log(
    "Magic link is the only way to sign in. Keep AUTH_ALLOWED_EMAILS in step with this list, and make sure Mailgun delivery works before narrowing it."
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
