/** Durable per-user CLI jobs. Only hash-bound reviewed output can become a saved draft. */
import { randomUUID, timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import type { SessionPayload } from "@/lib/session"
import { requireGlobalDocumentAccess } from "@/lib/document-access"
import { CONTRACT_GENERATION_PAUSED, CONTRACT_GENERATION_PAUSED_MESSAGE } from "./contract-generation"
import { GENERATION_SKILL_HASH, GENERATION_LEASE_MS, WORKER_FRESHNESS_MS, boundedText, isRecord, parseGenerationResult, resultPassesReviews, hashDraft } from "./contract-generation-protocol"
import { Entity, type Prisma } from "@/generated/prisma/client"

const TERMINAL_STATUSES = ["READY", "REVIEW_REQUIRED", "FAILED", "CANCELLED"]

export async function generationAvailability(actor: SessionPayload) {
  if (CONTRACT_GENERATION_PAUSED) return { ready: false, message: CONTRACT_GENERATION_PAUSED_MESSAGE }
  actor = await requireGlobalDocumentAccess(actor)
  const worker = await prisma.contractGenerationWorker.findFirst({
    where: { allowed_actor_emails: { has: actor.email.toLowerCase() }, provider: "codex", status: "READY", skill_hash: GENERATION_SKILL_HASH, verified_at: { not: null }, last_seen_at: { gte: new Date(Date.now() - WORKER_FRESHNESS_MS) } },
  })
  return worker ? { ready: true, message: "Your Codex worker is ready." } : { ready: false, message: "AI drafting is paused until the authorized Codex worker is authenticated and verified." }
}

export async function queueGeneration(actor: SessionPayload, kind: "DRAFT" | "REFINE", input: Prisma.InputJsonObject, requestKey: string) {
  actor = await requireGlobalDocumentAccess(actor)
  if (!['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'].includes(actor.role)) throw new Error('Drafting access is required')
  const availability = await generationAvailability(actor)
  if (!availability.ready) throw new Error(availability.message)
  if (!/^[\w-]{8,100}$/.test(requestKey)) throw new Error("Invalid request identifier")
  return prisma.contractGenerationJob.upsert({
    where: { request_key: `${actor.userId}:${requestKey}` },
    create: { actor_user_id: actor.userId, kind, request_key: `${actor.userId}:${requestKey}`, input, skill_hash: GENERATION_SKILL_HASH },
    update: {},
  })
}

export async function readGenerationJob(actor: SessionPayload, id: string) {
  actor = await requireGlobalDocumentAccess(actor)
  return prisma.contractGenerationJob.findFirst({
    where: { id, actor_user_id: actor.userId },
    select: { id: true, status: true, output_text: true, output_hash: true, reviews: true, error: true, created_at: true, completed_at: true, document_id: true },
  })
}

export async function cancelGenerationJob(actor: SessionPayload, id: string) {
  actor = await requireGlobalDocumentAccess(actor)
  const changed = await prisma.contractGenerationJob.updateMany({
    where: { id, actor_user_id: actor.userId, status: { notIn: TERMINAL_STATUSES } },
    data: { status: "CANCELLED", completed_at: new Date(), lease_token: null, lease_expires_at: null },
  })
  return changed.count === 1
}

export async function requireReviewedGeneration(actor: SessionPayload, id: string | undefined, content: string) {
  actor = await requireGlobalDocumentAccess(actor)
  if (!id) throw new Error("A reviewed generation job is required")
  const job = await prisma.contractGenerationJob.findFirst({ where: { id, actor_user_id: actor.userId, status: "READY" } })
  if (!job || job.output_hash !== hashDraft(content) || job.output_text !== content || job.skill_hash !== GENERATION_SKILL_HASH) throw new Error("The draft changed or has not passed its reviews")
  const result = parseGenerationResult(job.reviews)
  if (!resultPassesReviews(result) || result.draftHash !== job.output_hash) throw new Error("Review gates have not passed")
  return job
}

export type WorkerIdentity = { id: string; ownerEmail: string; actorEmails: string[] }

/** App-issued worker secrets are distinct from the login credentials retained on the worker VM. */
export function authenticateGenerationWorker(headers: Headers): WorkerIdentity | null {
  const id = headers.get("x-legal-worker-id")
  const presented = headers.get("authorization")?.replace(/^Bearer /, "")
  if (!id || !presented) return null
  try {
    const config: unknown = JSON.parse(process.env.LEGAL_GENERATION_WORKERS ?? "{}")
    if (!isRecord(config) || !isRecord(config[id])) return null
    const entry = config[id]
    if (!boundedText(entry.token, 512) || entry.token.length < 32 || !boundedText(entry.ownerEmail, 254) || !Array.isArray(entry.actorEmails) || !entry.actorEmails.length || !entry.actorEmails.every(email => boundedText(email, 254))) return null
    const expected = Buffer.from(entry.token), actual = Buffer.from(presented)
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? { id, ownerEmail: entry.ownerEmail.toLowerCase(), actorEmails: entry.actorEmails.map(email => String(email).toLowerCase()) } : null
  } catch { return null }
}

async function workerRequesters(identity: WorkerIdentity) {
  const users = await prisma.appUser.findMany({ where: { email: { in: identity.actorEmails }, is_active: true } })
  const authorized: SessionPayload[] = []
  for (const user of users) {
    try {
      const actor = await requireGlobalDocumentAccess({ userId: user.id, email: user.email, role: user.role, fullName: user.full_name, exp: Date.now() + 60_000 })
      if (['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN'].includes(actor.role)) authorized.push(actor)
    } catch { /* Removed entitlements cannot receive or finish jobs. */ }
  }
  return authorized
}

export async function handleGenerationWorker(identity: WorkerIdentity, payload: unknown) {
  const owner = await prisma.appUser.findUnique({ where: { email: identity.ownerEmail } })
  if (!owner?.is_active) throw new Error("Worker owner is inactive")
  if (!isRecord(payload)) throw new Error("Invalid worker request")
  const actors = await workerRequesters(identity)
  const actorIds = actors.map(actor => actor.userId)
  if (payload.action === "heartbeat") {
    if (payload.ownerEmail !== identity.ownerEmail || payload.authMethod !== "chatgpt" || payload.provider !== "codex" || payload.skillHash !== GENERATION_SKILL_HASH || !boundedText(payload.verificationRunId, 120) || !boundedText(payload.cliVersion, 120) || !boundedText(payload.model, 120)) throw new Error("Worker authentication or skill verification is missing")
    const verifiedAt = typeof payload.verifiedAt === "string" ? new Date(payload.verifiedAt) : new Date(NaN)
    if (!Number.isFinite(verifiedAt.getTime()) || Date.now() - verifiedAt.getTime() > 86_400_000 || verifiedAt.getTime() > Date.now() + 60_000) throw new Error("Synthetic readiness proof is stale")
    const evidence = { actor_user_id: owner.id, actor_email: owner.email, allowed_actor_emails: actors.map(actor => actor.email.toLowerCase()), provider: "codex", status: "READY", skill_hash: GENERATION_SKILL_HASH, verified_at: verifiedAt, last_seen_at: new Date(), verification_run_id: payload.verificationRunId, cli_version: payload.cliVersion, model: payload.model }
    await prisma.contractGenerationWorker.upsert({ where: { id: identity.id }, create: { id: identity.id, ...evidence }, update: evidence })
    return { ready: !CONTRACT_GENERATION_PAUSED }
  }
  if (payload.action === "claim") {
    if (CONTRACT_GENERATION_PAUSED) return { job: null }
    const ready = await prisma.contractGenerationWorker.findFirst({ where: { id: identity.id, actor_user_id: owner.id, provider: "codex", status: "READY", skill_hash: GENERATION_SKILL_HASH, verified_at: { not: null }, last_seen_at: { gte: new Date(Date.now() - WORKER_FRESHNESS_MS) } } })
    if (!ready) return { job: null }
    await prisma.contractGenerationJob.updateMany({ where: { actor_user_id: { in: actorIds }, status: "RUNNING", lease_expires_at: { lt: new Date() } }, data: { status: "FAILED", error: "Worker lease expired. Start a new job to retry.", completed_at: new Date(), lease_token: null } })
    const job = await prisma.contractGenerationJob.findFirst({ where: { actor_user_id: { in: actorIds }, status: "QUEUED", skill_hash: GENERATION_SKILL_HASH }, orderBy: { created_at: "asc" } })
    if (!job) return { job: null }
    const leaseToken = randomUUID()
    const claimed = await prisma.contractGenerationJob.updateMany({ where: { id: job.id, actor_user_id: { in: actorIds }, status: "QUEUED" }, data: { status: "RUNNING", worker_id: identity.id, lease_token: leaseToken, lease_expires_at: new Date(Date.now() + GENERATION_LEASE_MS) } })
    return { job: claimed.count === 1 ? { id: job.id, requesterId: job.actor_user_id, kind: job.kind, input: job.input, skillHash: job.skill_hash, leaseToken } : null }
  }
  if (!boundedText(payload.jobId, 100) || !boundedText(payload.leaseToken, 100)) throw new Error("Job and lease are required")
  const where = { id: payload.jobId, actor_user_id: { in: actorIds }, worker_id: identity.id, status: "RUNNING", lease_token: payload.leaseToken, lease_expires_at: { gte: new Date() } }
  if (payload.action === "progress") {
    if (CONTRACT_GENERATION_PAUSED) return { active: false }
    return { active: Boolean(await prisma.contractGenerationJob.findFirst({ where, select: { id: true } })) }
  }
  if (payload.action === "fail") {
    const changed = await prisma.contractGenerationJob.updateMany({ where, data: { status: "FAILED", error: "Codex worker failed. Check its authentication, limits and operator logs.", completed_at: new Date(), lease_token: null } })
    return { accepted: changed.count === 1 }
  }
  if (payload.action === "complete") {
    if (CONTRACT_GENERATION_PAUSED) return { accepted: false }
    const result = parseGenerationResult(payload.result)
    const changed = await prisma.contractGenerationJob.updateMany({ where, data: { status: resultPassesReviews(result) ? "READY" : "REVIEW_REQUIRED", output_text: result.draft, output_hash: result.draftHash, reviews: result, completed_at: new Date(), lease_token: null, lease_expires_at: null } })
    return { accepted: changed.count === 1 }
  }
  throw new Error("Unsupported worker action")
}

/** Shared dashboard/Slack entry point, preserving the exact approved template snapshot. */
export async function requestTemplateGeneration(actor: SessionPayload, templateId: string, variables: Record<string, string>, entity: string, reference: string | undefined, requestKey: string) {
  actor = await requireGlobalDocumentAccess(actor)
  if (!['PLATFORM_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'].includes(actor.role)) throw new Error('Drafting access is required')
  if (!Object.values(Entity).includes(entity as Entity) || !boundedText(templateId, 100)) throw new Error('Select a valid entity and approved template')
  if (!isRecord(variables) || Object.keys(variables).length > 80 || Object.values(variables).some(value => typeof value !== 'string' || value.length > 5000)) throw new Error('Invalid template variables')
  const availability = await generationAvailability(actor)
  if (!availability.ready) throw new Error(availability.message)
  const template = await prisma.contractTemplate.findFirst({ where: { id: templateId, is_active: true } })
  if (!template || !boundedText(template.content)) throw new Error('An active source template is required')
  if (reference && reference.length > 5000) throw new Error('Reference is too long')
  return queueGeneration(actor, 'DRAFT', { templateId: template.id, templateName: template.name, templateUpdatedAt: template.updated_at.toISOString(), template: template.content, category: template.category, entity, variables, reference: reference ?? '' }, requestKey)
}

export async function requestRefinement(actor: SessionPayload, parentJobId: string, instruction: string, requestKey: string) {
  const parent = await readGenerationJob(actor, parentJobId)
  if (!parent?.output_text || !boundedText(instruction, 5000)) throw new Error('An owned draft job and bounded instruction are required')
  const source = await prisma.contractGenerationJob.findFirstOrThrow({ where: { id: parentJobId, actor_user_id: actor.userId } })
  return queueGeneration(actor, 'REFINE', { currentDraft: parent.output_text, instruction, parentJobId, source: source.kind === 'DRAFT' ? source.input : (isRecord(source.input) && isRecord(source.input.source) ? source.input.source : {}) }, requestKey)
}
