/** Authorized pull worker. Uses the official CLI login; never reads or forwards its credentials. */
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { GENERATION_SKILL_HASH, GENERATION_SKILL_VERSION, hashDraft, isRecord, parseGenerationResult } from "../../src/lib/contract-generation-protocol"

const reviewSchema = {
  type: "object", additionalProperties: false,
  required: ["draftHash", "pass", "findings"],
  properties: {
    draftHash: { type: "string" }, pass: { type: "boolean" },
    findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["severity", "issue", "excerpt"], properties: { severity: { enum: ["blocker", "warning"] }, issue: { type: "string" }, excerpt: { type: "string" } } } },
  },
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const origin = new URL(required("LEGAL_APP_ORIGIN"))
if (origin.protocol !== "https:" && origin.hostname !== "127.0.0.1") throw new Error("Worker endpoint must use HTTPS")
const workerId = required("LEGAL_GENERATION_WORKER_ID")
if (!/^[A-Za-z0-9_-]{1,100}$/.test(workerId)) throw new Error("Invalid worker identifier")
const workerToken = required("LEGAL_GENERATION_WORKER_TOKEN")
const ownerEmail = required("LEGAL_GENERATION_OWNER_EMAIL").toLowerCase()
const configuredModel = process.env.LEGAL_GENERATION_MODEL?.trim()
const model = configuredModel || "CLI_DEFAULT"
const executable = process.env.CODEX_BIN || "codex"

// Pass only runtime necessities. Inherited API keys, cloud providers, MCP settings,
// app tokens and debug flags cannot enter the Codex subprocess environment.
const cliEnv: NodeJS.ProcessEnv = { NODE_ENV: "production" }
for (const name of ["HOME", "PATH", "USER", "LOGNAME", "TMPDIR", "LANG", "CODEX_HOME"]) {
  if (process.env[name]) cliEnv[name] = process.env[name]
}

async function exchange(payload: object): Promise<Record<string, unknown>> {
  const response = await fetch(new URL("/api/webhooks/generation-worker", origin), {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${workerToken}`, "x-legal-worker-id": workerId },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000), redirect: "error",
  })
  if (!response.ok) throw new Error(`Legal worker endpoint returned ${response.status}`)
  const value: unknown = await response.json()
  if (!isRecord(value)) throw new Error("Invalid worker response")
  return value
}

function runCli(args: string[], cwd: string, input = "", signal?: AbortSignal, captureStatus = false): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Codex CLI was cancelled")); return }
    // Own cancellation instead of spawn({signal}): its early AbortError can
    // settle the promise while a child that ignores SIGTERM is still running.
    const processGroup = process.platform !== "win32"
    const child = spawn(executable, args, { cwd, env: cliEnv, stdio: ["pipe", "pipe", "pipe"], detached: processGroup })
    let output = ""
    let tooLarge = false
    let timedOut = false
    let stopped = false
    let spawnError: Error | undefined
    let forceKill: ReturnType<typeof setTimeout> | undefined
    const kill = (kind: NodeJS.Signals) => {
      if (processGroup && child.pid) {
        try { process.kill(-child.pid, kind); return } catch { /* The group may already have exited. */ }
      }
      child.kill(kind)
    }
    const stop = () => {
      stopped = true
      kill("SIGTERM")
      forceKill ??= setTimeout(() => kill("SIGKILL"), 5000)
    }
    const timeout = setTimeout(() => { timedOut = true; stop() }, 240_000)
    signal?.addEventListener("abort", stop, { once: true })
    child.stdout.on("data", (part: Buffer) => {
      output += part.toString("utf8")
      if (output.length > 1_000_000) { tooLarge = true; stop() }
    })
    // Never echo CLI stderr, which may contain document text or account details.
    if (captureStatus) child.stderr.on("data", (part: Buffer) => { output += part.toString("utf8"); if (output.length > 10000) stop() })
    else child.stderr.resume()
    child.once("error", (error) => { spawnError = error; stop() })
    child.once("close", (code) => {
      // A wrapper may exit before a descendant with detached stdio. Terminate
      // the remaining process group before releasing a cancelled invocation.
      if (stopped) kill("SIGKILL")
      clearTimeout(timeout)
      if (forceKill) clearTimeout(forceKill)
      signal?.removeEventListener("abort", stop)
      if (spawnError || code !== 0 || timedOut || tooLarge || signal?.aborted) reject(new Error("Codex CLI failed, timed out or was cancelled"))
      else resolve(output.trim())
    })
    child.stdin.on("error", () => {})
    child.stdin.end(input)
  })
}

async function infer(cwd: string, skillFile: string, prompt: object, schema: object, signal?: AbortSignal) {
  const id = randomUUID()
  const schemaPath = join(cwd, `${id}-schema.json`)
  const outputPath = join(cwd, `${id}-output.json`)
  await writeFile(schemaPath, JSON.stringify(schema), { mode: 0o600 })
  const instructions = await readFile(skillFile, "utf8")
  const raw = await runCli([
    "exec", "--strict-config", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check",
    "--sandbox", "read-only", "--json", "--color", "never",
    ...(configuredModel ? ["--model", configuredModel] : []),
    "--disable", "shell_tool", "--disable", "unified_exec", "--disable", "apps",
    "--disable", "plugins", "--disable", "multi_agent", "--disable", "image_generation", "--disable", "view_image",
    ...["browser_use", "browser_use_external", "browser_use_full_cdp_access", "computer_use", "in_app_browser", "code_mode_host", "hooks", "remote_plugin", "skill_search", "skill_mcp_dependency_install", "tool_suggest", "sleep_tool", "goals", "workspace_dependencies", "memories", "shell_snapshot", "auth_elicitation"].flatMap(feature => ["--disable", feature]),
    "-c", 'forced_login_method="chatgpt"', "-c", 'approval_policy="never"',
    "-c", 'web_search="disabled"', "-c", "mcp_servers={}", "-c", "project_doc_max_bytes=0",
    "-c", 'history.persistence="none"', "-c", `developer_instructions=${JSON.stringify(instructions)}`,
    "--output-schema", schemaPath, "--output-last-message", outputPath, "-",
  ], cwd, JSON.stringify(prompt), signal)
  let sessionId: string | null = null
  let completed = false
  for (const line of raw.split("\n").filter(Boolean)) {
    const event: unknown = JSON.parse(line)
    if (!isRecord(event)) throw new Error("Invalid Codex event")
    if (event.type === "thread.started" && typeof event.thread_id === "string") sessionId = event.thread_id
    if (event.type === "turn.completed") completed = true
    if (event.type === "turn.failed" || event.type === "error") throw new Error("Codex inference failed")
    if (isRecord(event.item) && !["agent_message", "reasoning"].includes(String(event.item.type))) throw new Error("Unexpected tool activity in isolated generation")
  }
  const result: unknown = JSON.parse(await readFile(outputPath, "utf8"))
  if (!completed || !sessionId || !isRecord(result)) throw new Error("Codex returned an incomplete or unstructured result")
  return { output: result, sessionId }
}

async function main() {
  const skillNames = ["drafting.md", "independent-review.md", "cross-references.md"]
  const skills = await Promise.all(skillNames.map((name) => readFile(new URL(`./skills/${name}`, import.meta.url), "utf8")))
  if (hashDraft(skills.join("\n")) !== GENERATION_SKILL_HASH) throw new Error("Worker skills do not match the deployed application")
  const cwd = await mkdtemp(join(tmpdir(), "legal-generation-"))
  try {
    const skillPaths = skillNames.map((name) => join(cwd, name))
    await Promise.all(skills.map((content, index) => writeFile(skillPaths[index], content, { mode: 0o600 })))
    const cliVersion = await runCli(["--version"], cwd)
    const authStatus = await runCli(["login", "status"], cwd, "", undefined, true)
    if (!/logged in using chatgpt/i.test(authStatus)) throw new Error("Log in to the official Codex CLI with ChatGPT; API and token fallbacks are disabled")
    // Recheck account authentication on every run, but spend subscription quota on
    // a synthetic inference only once per UTC date/configuration, never every poll.
    const stateDirectory = process.env.LEGAL_GENERATION_STATE_DIR || join(required("HOME"), ".legal-generation-worker")
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 })
    const receiptPath = join(stateDirectory, `${workerId}-readiness.json`)
    const day = new Date().toISOString().slice(0, 10)
    let receipt: Record<string, unknown> | null = null
    try {
      const previous: unknown = JSON.parse(await readFile(receiptPath, "utf8"))
      if (isRecord(previous) && previous.day === day && previous.ownerEmail === ownerEmail && previous.cliVersion === cliVersion && previous.model === model && previous.skillHash === GENERATION_SKILL_HASH && typeof previous.verificationRunId === "string" && typeof previous.verifiedAt === "string") receipt = previous
    } catch { /* Missing or invalid local evidence requires a new synthetic proof. */ }
    if (!receipt) {
      const check = await infer(cwd, skillPaths[0], { task: "Synthetic readiness check. Return ready true and the supplied skillVersion. No contract or real data.", skillVersion: GENERATION_SKILL_VERSION }, { type: "object", additionalProperties: false, required: ["ready", "skillVersion"], properties: { ready: { const: true }, skillVersion: { const: GENERATION_SKILL_VERSION } } })
      if (check.output.ready !== true || check.output.skillVersion !== GENERATION_SKILL_VERSION) throw new Error("Codex readiness test failed")
      receipt = { day, ownerEmail, cliVersion, model, skillHash: GENERATION_SKILL_HASH, verificationRunId: check.sessionId, verifiedAt: new Date().toISOString() }
      await writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600 })
    }
    await exchange({ action: "heartbeat", ownerEmail, authMethod: "chatgpt", provider: "codex", cliVersion, model, skillHash: GENERATION_SKILL_HASH, verificationRunId: receipt.verificationRunId, verifiedAt: receipt.verifiedAt })
    const claimed = await exchange({ action: "claim" })
    if (!isRecord(claimed.job)) { console.log("Worker authenticated; no eligible queued job."); return }
    const job = claimed.job
    if (typeof job.id !== "string" || typeof job.leaseToken !== "string" || job.skillHash !== GENERATION_SKILL_HASH) throw new Error("Invalid claimed job")
    const controller = new AbortController()
    let finished = false
    const monitor = (async () => {
      while (!finished) {
        await delay(5000, undefined, { signal: controller.signal }).catch(() => {})
        if (finished || controller.signal.aborted) return
        try {
          const progress = await exchange({ action: "progress", jobId: job.id, leaseToken: job.leaseToken })
          if (progress.active !== true) { controller.abort(); return }
        } catch { controller.abort(); return }
      }
    })()
    try {
      const draft = await infer(cwd, skillPaths[0], { kind: job.kind, matter: job.input }, { type: "object", additionalProperties: false, required: ["draft"], properties: { draft: { type: "string" } } }, controller.signal)
      if (typeof draft.output.draft !== "string") throw new Error("Draft output is missing")
      const draftHash = hashDraft(draft.output.draft)
      const reviewInput = { matter: job.input, draft: draft.output.draft, draftHash }
      const reviews = await Promise.allSettled([
        infer(cwd, skillPaths[1], reviewInput, reviewSchema, controller.signal),
        infer(cwd, skillPaths[2], reviewInput, reviewSchema, controller.signal),
      ].map(review => review.catch(error => { controller.abort(); throw error })))
      if (reviews[0].status !== "fulfilled" || reviews[1].status !== "fulfilled") throw new Error("Independent review failed")
      const [substantive, references] = [reviews[0].value, reviews[1].value]
      const result = parseGenerationResult({ draft: draft.output.draft, draftHash, substantive: substantive.output, references: references.output, model, sessionIds: [draft.sessionId, substantive.sessionId, references.sessionId], skillHash: GENERATION_SKILL_HASH })
      const completion = await exchange({ action: "complete", jobId: job.id, leaseToken: job.leaseToken, result })
      if (completion.accepted !== true) throw new Error("Job completion was rejected or cancelled")
      console.log(`Completed job ${job.id}; result and reviews recorded.`)
    } catch {
      await exchange({ action: "fail", jobId: job.id, leaseToken: job.leaseToken }).catch(() => {})
      throw new Error("Generation failed; no API fallback was attempted")
    } finally {
      finished = true
      controller.abort()
      await monitor
    }
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Worker failed"); process.exitCode = 1 })
