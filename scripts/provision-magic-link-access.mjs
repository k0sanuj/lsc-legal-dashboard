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
const withBreakGlass = process.argv.includes("--with-break-glass-password")
const clearBreakGlass = process.argv.includes("--clear-break-glass-password")

if (withBreakGlass && clearBreakGlass) {
  console.error(
    "--with-break-glass-password and --clear-break-glass-password are mutually exclusive."
  )
  process.exit(1)
}

/**
 * Magic link is the login path for these accounts, but AppUser.password_hash is
 * NOT NULL. New rows get a hash of a random secret that is never printed and
 * never stored, so it cannot be used to sign in. Existing rows keep whatever
 * hash they already have, so the password fallback keeps working for them.
 */
async function unusablePasswordHash() {
  return bcrypt.hash(randomBytes(32).toString("base64url"), 12)
}

/**
 * Break-glass mode, for the window before magic-link delivery is proven.
 *
 * Narrowing AUTH_ALLOWED_EMAILS to this list stops the previous addresses from
 * signing in, and these accounts have no usable password, so if Mailgun is not
 * working yet nobody can reach the dashboard at all. This mode sets a real
 * password on each account and prints it once so there is a way back in.
 *
 * A flagless re-run does NOT retire these passwords: the upsert deliberately
 * preserves existing hashes so the legacy accounts keep the passwords they need
 * during rollout. Retiring is an explicit action, --clear-break-glass-password.
 */
function breakGlassPassword() {
  return randomBytes(18).toString("base64url")
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const created = []
  const updated = []
  const breakGlass = []

  try {
    for (const user of users) {
      const plainPassword = withBreakGlass ? breakGlassPassword() : null
      const passwordHash = plainPassword
        ? await bcrypt.hash(plainPassword, 12)
        : await unusablePasswordHash()

      // Both break-glass modes overwrite the hash on existing rows: one to set a
      // password you can use, the other to replace it with one nobody can. A run
      // with neither flag leaves existing hashes alone.
      const overwritePassword = withBreakGlass || clearBreakGlass
      const result = await pool.query(
        `
          INSERT INTO "AppUser" ("id", "full_name", "email", "role", "password_hash", "is_active", "created_at", "updated_at")
          VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("email") DO UPDATE SET
            "full_name" = EXCLUDED."full_name",
            "role" = EXCLUDED."role",
            "is_active" = true,
            "password_hash" = CASE WHEN $5 THEN EXCLUDED."password_hash" ELSE "AppUser"."password_hash" END,
            "updated_at" = CURRENT_TIMESTAMP
          RETURNING (xmax = 0) AS inserted
        `,
        [user.fullName, user.email, user.role, passwordHash, overwritePassword]
      )

      if (result.rows[0]?.inserted) {
        created.push(user.email)
      } else {
        updated.push(user.email)
      }

      if (plainPassword) {
        breakGlass.push({ email: user.email, password: plainPassword })
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

  if (clearBreakGlass) {
    console.log(
      "Break-glass passwords retired. All three accounts now carry an unusable random hash; magic link is the only way in."
    )
  } else if (breakGlass.length > 0) {
    // Refuse to print secrets into a pipe, a CI log, or a redirected file.
    if (!process.stdout.isTTY) {
      console.log("")
      console.log(
        "Break-glass passwords were set but NOT printed, because stdout is not a terminal."
      )
      console.log(
        "Re-run this command in an interactive terminal to see them, or use --clear-break-glass-password to undo."
      )
    } else {
      console.log("")
      console.log("BREAK-GLASS PASSWORDS, shown once and not stored anywhere:")
      for (const entry of breakGlass) {
        console.log(`  ${entry.email}  ${entry.password}`)
      }
      console.log("")
      console.log(
        "Move these into a password manager now, then close this terminal so they leave the scrollback."
      )
      console.log(
        "Once a magic link has worked, run with --clear-break-glass-password to make them unusable."
      )
    }
  } else {
    console.log(
      "New rows carry an unusable random password hash. Sign in with a magic link, and keep AUTH_ALLOWED_EMAILS in step with this list."
    )
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
