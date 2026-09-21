import { spawnSync } from "node:child_process"

const commands = [
  ["node", ["scripts/check-release-env.mjs"]],
  ["node", ["scripts/check-agent-hygiene.mjs"]],
  ["npx", ["prisma", "validate"]],
  ["npx", ["tsc", "--noEmit"]],
  ["node", ["scripts/verify-generation-pause.mjs"]],
  ["node", ["scripts/verify-v2-generation-slack.mjs"]],
  ["node", ["scripts/verify-generation-worker.mjs"]],
  ["node", ["scripts/verify-generation-artifacts.mjs"]],
  ["node", ["scripts/verify-upload-atomicity.mjs"]],
  ["node", ["scripts/verify-opensign-concurrency.mjs"]],
  ["node", ["scripts/verify-opensign-certificates.mjs"]],
  ["node", ["scripts/verify-review-completion-race.mjs"]],
  ["node", ["scripts/verify-protected-file-responses.mjs"]],
  ["node", ["scripts/verify-gcs-upload-transport.mjs"]],
  ["npx", ["tsx", "scripts/verify-document-foundations.ts"]],
  ["npx", ["tsx", "scripts/verify-entities-reviews-disputes.ts"]],
  ["node", ["scripts/verify-dispute-finance.mjs"]],
  ["npx", ["tsx", "scripts/verify-mnda-render.ts"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "build"]],
]

for (const [command, args] of commands) {
  console.log(`\n> ${command} ${args.join(" ")}`)
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log("\nRelease gate passed")
