/** Shared Slack operations, scoped through the same services as dashboard actions. */
import { prisma } from '@/lib/prisma'
import type { SessionPayload } from '@/lib/session'
import { KycDocStatus, LitigationStatus } from '@/generated/prisma/client'
import { requireGlobalDocumentAccess, requestDocumentAccess } from '@/lib/document-access'
import { listDocumentAccessRequests, decideDocumentAccess, revokeDocumentGrant } from '@/lib/document-access-management'
import { listEntityProfiles, setKycVerification } from '@/lib/entity-service'
import { listReviewTasks, completeReviewTask, signalReviewChange } from '@/lib/review-service'
import { listDisputes, setDisputeStatus } from '@/lib/dispute-service'
import { queueDocumentExport, listDocumentExports } from '@/lib/document-exports'
import { searchLegalDrive } from '@/lib/drive-retrieval'
import { readGenerationJob, cancelGenerationJob, requestTemplateGeneration, requestRefinement } from '@/lib/contract-generation-queue'
import { saveTextTemplate, readTextTemplate } from '@/lib/template-service'
import { saveEntityProfileForSession, saveEntityFilingForSession, saveEntityOwnershipForSession, linkKycToEntityForSession } from '@/lib/entity-record-service'
import { createReviewScheduleForSession, importReviewDependenciesForSession, setReviewScheduleActiveForSession, createInternalPolicyForSession } from '@/lib/review-schedule-service'
import { proposeArtifactNameForActor, approveArtifactNameForActor, finalizeArtifactForActor, publishArtifactForActor, updateArtifactLineageForActor, updateNativeAmountForActor } from '@/lib/repository-service'
import { documentScope } from '@/lib/document-access'
import { isRecord } from '@/lib/contract-generation-protocol'

export const SLACK_OPERATION_INVENTORY = [
  { operation: 'Agreement search', command: 'find', mode: 'read', readiness: 'implemented' },
  { operation: 'Signature tracking', command: 'signatures', mode: 'read', readiness: 'implemented' },
  { operation: 'Legal summary', command: 'status', mode: 'read', readiness: 'implemented' },
  { operation: 'Drive search and fetch', command: 'drive', mode: 'read', readiness: 'requires approved folders' },
  { operation: 'Request scoped access', command: 'request', mode: 'write', readiness: 'implemented' },
  { operation: 'Decide and revoke access', command: 'approve / deny / revoke', mode: 'write', readiness: 'implemented' },
  { operation: 'Entity register', command: 'entities', mode: 'read', readiness: 'implemented' },
  { operation: 'KYC verification', command: 'kyc-status', mode: 'write', readiness: 'implemented' },
  { operation: 'Review queue and completion', command: 'reviews / review-complete', mode: 'write', readiness: 'implemented' },
  { operation: 'Dependency review trigger', command: 'review-change', mode: 'write', readiness: 'implemented' },
  { operation: 'Litigation and arbitration tracking', command: 'matters / matter-status', mode: 'write', readiness: 'implemented' },
  { operation: 'Backup export', command: 'export / exports', mode: 'write', readiness: 'requires export worker' },
  { operation: 'Contract drafting and refinement', command: 'generate / refine / job / cancel', mode: 'write', readiness: 'requires authenticated Codex worker' },
  { operation: 'Deterministic MNDA signing', command: '/mnda', mode: 'write', readiness: 'existing integration' },
  { operation: 'Edit entity records and shareholding', command: 'entity-save / filing-save / ownership-save / kyc-link', mode: 'write', readiness: 'implemented' },
  { operation: 'Edit templates and review schedules', command: 'template-save / schedule-create / dependencies / policy-create', mode: 'write', readiness: 'implemented' },
  { operation: 'Final approval and publication', command: 'name-propose / name-approve / artifact-finalize / artifact-publish', mode: 'write', readiness: 'requires approved Drive destination' },
  { operation: 'Mailbox and account administration', command: '/legal/admin-accounts', mode: 'dashboard', readiness: 'dashboard' },
] as const

export const SLACK_HELP = `Legal commands (answers are private):
/ legal find <title or counterparty>
/ legal status | signatures | entities | reviews | access | exports | coverage
/ legal drive <name>  (approved Drive sources only)
/ legal request <reference> -- <reason>
/ legal approve <request-id> <document-id> <expiry YYYY-MM-DD>
/ legal deny <request-id> | revoke <grant-id>
/ legal review-complete <task-id> -- <evidence>
/ legal review-change <schedule-id> -- <change reference>
/ legal kyc-status <record-id> <COLLECTED|VERIFIED|EXPIRED|NEEDS_RENEWAL>
/ legal matters <LITIGATION|ARBITRATION|UNCLASSIFIED>
/ legal matter-status <matter-id> <status>
/ legal templates
/ legal generate <template-id> <entity enum> -- {"counterparty":"Full name","value":"1000.00","currency":"USD"}
/ legal refine <job-id> -- <instruction>
/ legal job <job-id> | cancel <job-id>
/ legal export
/ legal entity-save | filing-save | ownership-save | kyc-link -- <fields JSON>
/ legal schedule-create | schedule-active | dependencies | policy-create -- <fields JSON>
/ legal template <id> | template-save -- <complete template JSON>
/ legal artifacts <document-id>
/ legal name-propose | name-approve | artifact-finalize | artifact-publish | artifact-lineage | amount -- <fields JSON>
/ mnda opens the deterministic signing form.
Global legal access is required for administrative operations. Copilot is not connected.`.replaceAll('/ legal', '/legal').replaceAll('/ mnda', '/mnda')

const escapeSlack = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const line = (values: unknown[]) => values.map(value => escapeSlack(String(value ?? 'unknown'))).join(' | ')
const lines = (rows: unknown[][], empty: string) => rows.length ? rows.slice(0, 25).map(line).join('\n') : empty
function parts(text: string) {
  const delimiter = text.indexOf(' -- ')
  return { args: (delimiter < 0 ? text : text.slice(0, delimiter)).trim().split(/\s+/).filter(Boolean), detail: delimiter < 0 ? '' : text.slice(delimiter + 4).trim() }
}

const formHelp: Record<string, string> = {
  'entity-save': 'legal_name, jurisdiction, source_reference; optional id, legacy_entity, registration_number, incorporation_date, registered_agent_name, registered_agent_contact, registered_office, notes',
  'filing-save': 'entity_profile_id, filing_type (REGISTRATION|ANNUAL_REPORT|AGENT_APPOINTMENT|OFFICE_AGREEMENT), source_reference; optional id, reporting_period, due_date, filed_date, notes',
  'ownership-save': 'owned_entity_id, source_reference, either owner_entity_id or owner_name; optional id, percentage (decimal string), effective_date',
  'kyc-link': 'kyc_document_id, entity_profile_id',
  'schedule-create': 'title, kind (PUBLIC|INTERNAL), start_date YYYY-MM-DD, owner_id, source_reference; PUBLIC needs document_id and steady_interval_months; INTERNAL needs policy_id and interval_months (4|5|6)',
  'schedule-active': 'schedule_id, active (true|false)',
  dependencies: 'rows (array of source_schedule_id,target_schedule_id), source_reference',
  'policy-create': 'title, effective_date YYYY-MM-DD, content; optional acknowledgment_required (true|false)',
  'template-save': 'name, category (document enum), content, variables (array of key,label,placeholder); optional entity (enum or null). Updates require id and exact updatedAt from /legal template <id>',
  'name-propose': 'artifactId, arena, category (approved three-letter code), counterparty (full), date YYYY-MM-DD, dateBasis, initials',
  'name-approve': 'artifactId, proposedName (exact current proposal from /legal artifacts <document-id>)',
  'artifact-finalize': 'artifactId',
  'artifact-publish': 'artifactId',
  'artifact-lineage': 'artifactId; optional sourceArtifactId, signers (newline separated), deliverables',
  amount: 'documentId, value (decimal string or empty for unknown), currency (ISO code)',
}

const formOperations = {
  'entity-save': saveEntityProfileForSession,
  'filing-save': saveEntityFilingForSession,
  'ownership-save': saveEntityOwnershipForSession,
  'kyc-link': linkKycToEntityForSession,
  'schedule-create': createReviewScheduleForSession,
  'schedule-active': setReviewScheduleActiveForSession,
  dependencies: importReviewDependenciesForSession,
  'policy-create': createInternalPolicyForSession,
  'name-propose': proposeArtifactNameForActor,
  'name-approve': approveArtifactNameForActor,
  'artifact-finalize': finalizeArtifactForActor,
  'artifact-publish': publishArtifactForActor,
  'artifact-lineage': updateArtifactLineageForActor,
  amount: updateNativeAmountForActor,
} as const

function commandForm(detail: string): FormData {
  if (!detail || detail.length > 180000) throw new Error('Provide a bounded JSON object after --')
  const input: unknown = JSON.parse(detail)
  if (!isRecord(input) || Object.keys(input).length > 80) throw new Error('Provide a JSON object with at most 80 fields')
  const form = new FormData()
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue
    if (['value', 'percentage'].includes(key) && typeof value !== 'string') throw new Error(`${key} must be an exact decimal string`)
    if (typeof value === 'string') form.set(key, value)
    else if (typeof value === 'boolean' || typeof value === 'number') form.set(key, key === 'acknowledgment_required' && value === true ? 'on' : String(value))
    else if (key === 'rows' && Array.isArray(value)) form.set(key, JSON.stringify(value))
    else throw new Error(`Field ${key} must be text, number or boolean`)
  }
  return form
}

/** Receipts are based on signed request identity; source text is never put in the audit log. */
export async function executeSlackOperation(actor: SessionPayload, command: string, text: string, requestKey: string): Promise<string> {
  const { args, detail } = parts(text)
  if (Object.hasOwn(formOperations, command)) {
    const operation = formOperations[command as keyof typeof formOperations]
    const form = commandForm(detail)
    if (command === 'amount' && !form.has('value')) throw new Error('Provide value as a decimal string or an explicit empty string for unknown')
    const result = await operation(actor, form)
    return `${command} recorded.${result ? ` ${escapeSlack(JSON.stringify(result))}` : ''}${command === 'artifact-publish' ? ' Publication is queued; check the artifact for its Drive delivery receipt.' : ''}`
  }
  switch (command) {
    case 'help': return args[0] && formHelp[args[0]] ? `Usage: /legal ${args[0]} -- <JSON object>\nFields: ${formHelp[args[0]]}\nUse exact sourced values. Dates are YYYY-MM-DD; decimal amounts and percentages are strings.` : `${SLACK_HELP}\nUse /legal help <command> for required JSON fields.`
    case 'coverage':
      await requireGlobalDocumentAccess(actor)
      return `${SLACK_OPERATION_INVENTORY.map(item => line([item.operation, item.command, item.readiness])).join('\n')}\nThis inventory is implementation coverage. The 90% target requires measured real-user completion and is not yet verified.`
    case 'drive': {
      const result = await searchLegalDrive(actor, text.trim())
      return lines(result.files.map(file => [file.name, `/api/drive-documents/${file.id}`, file.modifiedAt, file.version]), 'No accessible matches.') + (result.partial ? '\nSearch limit reached; narrow the query.' : '')
    }
    case 'request': {
      const request = await requestDocumentAccess(actor, args.join(' '), detail)
      return `Access request ${request.id}: ${request.status}. Legal will select the document after review.`
    }
    case 'access': {
      const requests = await listDocumentAccessRequests(actor)
      return lines(requests.map(request => [request.id, request.requester_id, request.reference, request.reason]), 'No pending access requests.')
    }
    case 'approve': {
      if (args.length !== 3 || !/^\d{4}-\d{2}-\d{2}$/.test(args[2])) throw new Error('Usage: approve <request-id> <selected-document-id> <expiry YYYY-MM-DD>')
      const expiry = new Date(`${args[2]}T23:59:59.999Z`)
      if (expiry.toISOString().slice(0, 10) !== args[2]) throw new Error('Invalid expiry date')
      await decideDocumentAccess(actor, args[0], true, args[1], expiry)
      return `Scoped document access approved until ${args[2]} UTC.`
    }
    case 'deny':
      if (args.length !== 1) throw new Error('Usage: deny <request-id>')
      await decideDocumentAccess(actor, args[0], false, '', new Date())
      return 'Access request denied.'
    case 'revoke':
      if (args.length !== 1) throw new Error('Usage: revoke <grant-id>')
      await revokeDocumentGrant(actor, args[0])
      return 'Document grant revoked.'
    case 'entities': {
      const entities = await listEntityProfiles(actor)
      return lines(entities.map(entity => [entity.id, entity.legacy_entity, entity.legal_name, entity.registration_number, `Filings ${entity._count.filings}`, `KYC ${entity._count.kyc_documents}`]), 'No entity profiles recorded.')
    }
    case 'reviews': {
      const tasks = await listReviewTasks(actor)
      return lines(tasks.map(task => [task.id, task.schedule.title, task.schedule.kind, task.due_date.toISOString().slice(0, 10)]), 'No open review tasks.')
    }
    case 'review-complete':
      if (args.length !== 1) throw new Error('Usage: review-complete <task-id> -- <evidence>')
      await completeReviewTask(actor, args[0], detail)
      return 'Review completed with evidence.'
    case 'review-change':
      if (args.length !== 1) throw new Error('Usage: review-change <schedule-id> -- <change reference>')
      await signalReviewChange(actor, args[0], detail)
      return 'Dependency change recorded and affected review tasks queued.'
    case 'kyc-status':
      if (args.length !== 2 || !Object.values(KycDocStatus).includes(args[1] as KycDocStatus)) throw new Error('Provide a KYC record ID and valid status')
      await setKycVerification(actor, args[0], args[1] as KycDocStatus)
      return `KYC status recorded: ${args[1]}.`
    case 'matters': {
      const kind = args[0] || undefined
      if (kind !== undefined && kind !== 'LITIGATION' && kind !== 'ARBITRATION' && kind !== 'UNCLASSIFIED') throw new Error('Choose LITIGATION, ARBITRATION or UNCLASSIFIED')
      const disputes = await listDisputes(actor, kind)
      return lines(disputes.map(matter => [matter.id, matter.case_name, matter.dispute_kind, matter.status, matter.estimated_liability ?? 'exposure unknown', matter.currency]), 'No matters recorded.')
    }
    case 'matter-status':
      if (args.length !== 2 || !Object.values(LitigationStatus).includes(args[1] as LitigationStatus)) throw new Error(`Provide a matter ID and status: ${Object.values(LitigationStatus).join(', ')}`)
      await setDisputeStatus(actor, args[0], args[1] as LitigationStatus)
      return `Matter status recorded: ${args[1]}. Finance synchronization has its own delivery receipt.`
    case 'template-save': {
      const result = await saveTextTemplate(actor, JSON.parse(detail))
      return `Template ${result.templateId} saved with immutable artifact ${result.artifactId}. Finalization and publication require separate approval.`
    }
    case 'template': {
      if (args.length !== 1) throw new Error('Usage: template <id>')
      const template = await readTextTemplate(actor, args[0])
      return template ? escapeSlack(JSON.stringify({ ...template, content: template.content.slice(0, 20000), updatedAt: template.updated_at.toISOString() })) + (template.content.length > 20000 ? '\nContent exceeds Slack preview limit. Read the full template in the dashboard before editing.' : '') : 'Template is unavailable.'
    }
    case 'artifacts': {
      if (args.length !== 1) throw new Error('Usage: artifacts <document-id>')
      const artifacts = await prisma.documentArtifact.findMany({ where: { document_id: args[0], document: await documentScope(actor) }, orderBy: { created_at: 'desc' }, take: 25, select: { id: true, stage: true, proposed_name: true, approved_name: true, finalized_at: true, publish_status: true } })
      return lines(artifacts.map(artifact => [artifact.id, artifact.stage, artifact.proposed_name, artifact.approved_name, artifact.finalized_at?.toISOString() ?? 'not final', artifact.publish_status]), 'No accessible artifacts.')
    }
    case 'templates': {
      await requireGlobalDocumentAccess(actor)
      const templates = await prisma.contractTemplate.findMany({ where: { is_active: true }, select: { id: true, name: true, category: true, entity: true }, take: 25, orderBy: { name: 'asc' } })
      return lines(templates.map(template => [template.id, template.name, template.category, template.entity]), 'No approved templates.')
    }
    case 'generate': {
      if (args.length !== 2 || !detail) throw new Error('Usage: generate <template-id> <entity enum> -- <variables JSON>')
      const variables: unknown = JSON.parse(detail)
      if (!isRecord(variables) || !Object.values(variables).every(value => typeof value === 'string')) throw new Error('Template variables must be a JSON object of strings')
      const job = await requestTemplateGeneration(actor, args[0], variables as Record<string, string>, args[1], undefined, requestKey)
      return `Draft job ${job.id}: ${job.status}. Review results appear in /legal job ${job.id}; human save is in /legal/generate.`
    }
    case 'refine': {
      if (args.length !== 1) throw new Error('Usage: refine <owned-job-id> -- <instruction>')
      const job = await requestRefinement(actor, args[0], detail, requestKey)
      return `Refinement job ${job.id}: ${job.status}.`
    }
    case 'job': {
      if (args.length !== 1) throw new Error('Usage: job <owned-job-id>')
      const job = await readGenerationJob(actor, args[0])
      return job ? line([job.id, job.status, job.error || `/legal/generate/jobs/${job.id}`]) : 'Job is unavailable.'
    }
    case 'cancel':
      if (args.length !== 1) throw new Error('Usage: cancel <owned-job-id>')
      return await cancelGenerationJob(actor, args[0]) ? 'Job cancelled. Late worker results cannot be saved.' : 'No active owned job was cancelled.'
    case 'export': {
      const job = await queueDocumentExport(actor)
      return `Backup ${job.id}: ${job.status}. Download your completed archive from /legal/backups.`
    }
    case 'exports': {
      const jobs = await listDocumentExports(actor)
      return lines(jobs.map(job => [job.id, job.status, job.created_at.toISOString(), `/api/document-exports/${job.id}/download`]), 'No requested backups.')
    }
    default: return SLACK_HELP
  }
}
