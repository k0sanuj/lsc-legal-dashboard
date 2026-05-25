import { spawnSync } from "node:child_process"

const commands = [
  ["node", ["scripts/check-release-env.mjs"]],
  ["node", ["scripts/check-agent-hygiene.mjs"]],
  ["npx", ["prisma", "validate"]],
  ["npx", ["tsc", "--noEmit"]],
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
