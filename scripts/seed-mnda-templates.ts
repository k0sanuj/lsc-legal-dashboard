// Seed the two FSP MNDA ContractTemplate rows from the canonical constants.
// Idempotent: safe to re-run. Version bumps only when the content changed.
//
//   npx tsx scripts/seed-mnda-templates.ts
import { config } from "dotenv"
import pg from "pg"
import {
  MNDA_TEMPLATE_NAMES,
  mndaBusinessTemplate,
  mndaBusinessVariables,
  mndaIndividualTemplate,
  mndaIndividualVariables,
} from "../src/lib/mnda-templates"

config({ path: ".env" })
config({ path: ".env.local", override: true })

const templates = [
  {
    name: MNDA_TEMPLATE_NAMES.individual,
    content: mndaIndividualTemplate,
    variables: mndaIndividualVariables,
  },
  {
    name: MNDA_TEMPLATE_NAMES.business,
    content: mndaBusinessTemplate,
    variables: mndaBusinessVariables,
  },
]

// jsonb does not preserve key order, so compare canonically, keys sorted.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    )
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

  try {
    for (const template of templates) {
      const variablesJson = JSON.stringify(template.variables)
      const existing = await pool.query(
        `SELECT "id", "content", "variables", "version", "is_active"
         FROM "ContractTemplate"
         WHERE "name" = $1
         ORDER BY "created_at" ASC
         LIMIT 1`,
        [template.name]
      )

      if (existing.rowCount === 0) {
        await pool.query(
          `INSERT INTO "ContractTemplate"
             ("id", "name", "category", "entity", "content", "variables", "version", "usage_count", "is_active", "created_at", "updated_at")
           VALUES
             (gen_random_uuid()::text, $1, 'NDA'::"DocumentCategory", 'FSP'::"Entity", $2, $3::jsonb, 1, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [template.name, template.content, variablesJson]
        )
        console.log(`Created "${template.name}" (v1).`)
        continue
      }

      const row = existing.rows[0]
      const contentChanged = row.content !== template.content
      const variablesChanged = canonicalJson(row.variables) !== canonicalJson(template.variables)

      if (!contentChanged && !variablesChanged && row.is_active) {
        console.log(`Unchanged "${template.name}" (v${row.version}).`)
        continue
      }

      const nextVersion = contentChanged ? row.version + 1 : row.version
      await pool.query(
        `UPDATE "ContractTemplate"
         SET "content" = $2, "variables" = $3::jsonb, "version" = $4, "is_active" = true, "updated_at" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        [row.id, template.content, variablesJson, nextVersion]
      )
      console.log(`Updated "${template.name}" (v${nextVersion}).`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
