/**
 * Executes the real generation actions and authorization code with isolated
 * session, database and provider boundaries. No env files, credentials, database
 * or network are used; a paused request must stop before every external effect.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import * as crypto from "node:crypto"

const allowedRoles = ["PLATFORM_ADMIN", "FINANCE_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"]
const deniedRoles = ["FSP_FINANCE", "COMMERCIAL_OFFICER", "TEAM_MEMBER", "EXTERNAL_AUDITOR"]

function loadModule(path, dependencies, env, fetch) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  })
  const moduleRecord = { exports: {} }
  runInNewContext(outputText, {
    module: moduleRecord,
    exports: moduleRecord.exports,
    process: { env },
    console,
    fetch,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected import in ${path}: ${name}`)
      return dependencies[name]
    },
  }, { filename: path, timeout: 1000 })
  return moduleRecord.exports
}

function createFixture(provider) {
  const effects = { database: 0, constructors: 0, provider: 0, network: 0, cache: 0 }
  let session = null
  let sessionReads = 0
  const rejectEffect = (kind) => {
    effects[kind] += 1
    throw new Error(`Unexpected ${kind} access during paused generation`)
  }
  const prisma = new Proxy({}, { get: (_target, property) => {
    if (property === 'appUser') return { async findUnique(query) {
      assert.equal(query.where.id, session?.userId)
      return session ? { email: session.email, role: session.role, full_name: session.fullName, is_active: true } : null
    } }
    return rejectEffect("database")
  } })
  const fetch = () => rejectEffect("network")
  const env = Object.freeze({ AI_PROVIDER: provider })
  const load = (path, dependencies) => loadModule(path, dependencies, env, fetch)
  const state = load("src/lib/contract-generation.ts", {})
  const auth = load("src/lib/auth.ts", {
    "next/navigation": {
      redirect(path) {
        throw new Error(`AUTH_REDIRECT:${path}`)
      },
    },
    "./prisma": { prisma },
    "./session": {
      async getSessionFromCookie() {
        sessionReads += 1
        return session
      },
    },
  })
  const protocol = load("src/lib/contract-generation-protocol.ts", { "node:crypto": crypto })
  const access = { requireGlobalDocumentAccess: () => rejectEffect("database") }
  const queue = load("src/lib/contract-generation-queue.ts", {
    "node:crypto": crypto,
    "@/lib/prisma": { prisma },
    "@/lib/document-access": access,
    "./contract-generation": state,
    "./contract-generation-protocol": protocol,
    "@/generated/prisma/client": { Entity: {} },
  })
  const actions = load("src/actions/generate.ts", {
    "node:crypto": crypto,
    "@/lib/auth": auth,
    "@/lib/prisma": { prisma },
    "@/lib/contract-generation": state,
    "@/lib/document-access": access,
    "@/lib/s3": { uploadBufferToS3: () => rejectEffect("network") },
    "@/lib/document-artifacts": { recordArtifact: () => rejectEffect("database") },
    "@/lib/template-service": { saveTextTemplate: () => rejectEffect("database") },
    "@/lib/contract-generation-queue": queue,
    "@/lib/contract-generation-protocol": protocol,
    "@/generated/prisma/client": { Entity: {}, DocumentCategory: {}, Prisma: {} },
    "next/cache": { revalidatePath: () => rejectEffect("cache") },
    "@anthropic-ai/sdk": class {
      constructor() {
        effects.constructors += 1
        this.messages = { create: () => rejectEffect("provider") }
      }
    },
    "@google/generative-ai": {
      GoogleGenerativeAI: class {
        constructor() {
          effects.constructors += 1
        }
        getGenerativeModel() {
          return rejectEffect("provider")
        }
      },
    },
  })
  const formType = Symbol("GenerateForm")
  const jsx = (type, props) => ({ type, props })
  const page = load("src/app/legal/generate/page.tsx", {
    "@/lib/auth": auth,
    "@/lib/prisma": { prisma },
    "@/lib/contract-generation-queue": queue,
    "@/lib/constants": { ENTITIES: [] },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": Symbol("Link"),
    "lucide-react": { Sparkles: Symbol("Sparkles") },
    "./generate-form": { GenerateForm: formType },
  }).default
  return {
    actions,
    state,
    page,
    formType,
    getSessionReads: () => sessionReads,
    setRole(role) {
      session = role ? {
        userId: "synthetic-user",
        fullName: "Synthetic User",
        email: "synthetic@example.invalid",
        role,
      } : null
    },
    assertNoEffects() {
      assert.deepEqual(effects, { database: 0, constructors: 0, provider: 0, network: 0, cache: 0 })
    },
  }
}

function flattenChildren(value) {
  if (Array.isArray(value)) return value.flatMap(flattenChildren)
  if (value && typeof value === "object") {
    return [value, ...flattenChildren(value.props?.children)]
  }
  return [value]
}

let authorizedCalls = 0
let deniedCalls = 0

for (const provider of ["gemini", "anthropic"]) {
  const fixture = createFixture(provider)
  const calls = [
    () => fixture.actions.generateContract("synthetic-template", {}, "FSP", "Synthetic test"),
    () => fixture.actions.refineContract("Synthetic draft", "Synthetic instruction"),
  ]
  fixture.assertNoEffects()

  for (const role of allowedRoles) {
    fixture.setRole(role)
    for (const call of calls) {
      const readsBefore = fixture.getSessionReads()
      const result = await call()
      assert.equal(fixture.getSessionReads(), readsBefore + 1, "Every action must authorize its caller")
      assert.equal(result.success, false)
      assert.equal(result.code, "GENERATION_PAUSED")
      assert.equal(result.draft, "")
      assert.equal(result.error, fixture.state.CONTRACT_GENERATION_PAUSED_MESSAGE)
      assert.match(result.error, /paused/i)
      fixture.assertNoEffects()
      authorizedCalls += 1
    }
  }

  for (const role of [null, ...deniedRoles]) {
    fixture.setRole(role)
    for (const call of calls) {
      const readsBefore = fixture.getSessionReads()
      await assert.rejects(call, (error) => {
        assert.equal(error.message, role ? "AUTH_REDIRECT:/legal?error=unauthorized" : "AUTH_REDIRECT:/login")
        return true
      })
      assert.equal(fixture.getSessionReads(), readsBefore + 1)
      fixture.assertNoEffects()
      deniedCalls += 1
    }
  }

  fixture.setRole("LEGAL_ADMIN")
  const readsBefore = fixture.getSessionReads()
  const nodes = flattenChildren(await fixture.page({ searchParams: Promise.resolve({ template: "synthetic" }) }))
  assert.equal(fixture.getSessionReads(), readsBefore + 1)
  assert.ok(nodes.includes(fixture.state.CONTRACT_GENERATION_PAUSED_MESSAGE))
  assert.ok(nodes.some((node) => node?.type === "h2" && node.props.children === "Generation paused"))
  assert.ok(!nodes.some((node) => node?.type === fixture.formType), "Paused page must not offer the generation form")
  assert.ok(nodes.some((node) => node?.props?.href === "/legal/documents"))
  assert.ok(nodes.some((node) => node?.props?.href === "/legal/templates"))
  fixture.setRole(null)
  await assert.rejects(() => fixture.page({ searchParams: Promise.resolve({}) }), /AUTH_REDIRECT:\/login/)
  fixture.assertNoEffects()
}

console.log(`Generation pause checks passed: ${authorizedCalls} authorized calls, ${deniedCalls} auth denials and paused-page checks across both providers; no provider construction, provider calls, document database, network or cache activity; only fresh authorization reads allowed.`)
