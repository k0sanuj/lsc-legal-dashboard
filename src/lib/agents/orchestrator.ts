import { prisma } from '@/lib/prisma'
import { isRunnableAgentId, RUNNABLE_AGENT_IDS, type AgentId, type AgentResult } from './types'
import { ComplianceAgent } from './compliance-agent'
import { AgreementAnalyzerAgent } from './agreement-analyzer-agent'
import { InvoiceDetectionAgent } from './invoice-detection-agent'
import { ComplianceAuditAgent } from './compliance-audit-agent'
import { PreSignatureChecklistAgent } from './pre-signature-checklist-agent'
import { ActivationAgent } from './activation-agent'
import { BaseAgent } from './base-agent'

/** Registry of all agents */
const agentRegistry = new Map<AgentId, BaseAgent>()

function getOrCreateAgent(id: string): BaseAgent | null {
  if (!isRunnableAgentId(id)) return null
  if (agentRegistry.has(id)) return agentRegistry.get(id)!

  let agent: BaseAgent | null = null
  switch (id) {
    case 'compliance':
      agent = new ComplianceAgent()
      break
    case 'agreement-analyzer':
      agent = new AgreementAnalyzerAgent()
      break
    case 'email-inbox.invoice-detection':
      agent = new InvoiceDetectionAgent()
      break
    case 'compliance-audit':
      agent = new ComplianceAuditAgent()
      break
    case 'pre-signature-checklist':
      agent = new PreSignatureChecklistAgent()
      break
    case 'activation':
      agent = new ActivationAgent()
      break
    default:
      return null
  }

  if (agent) agentRegistry.set(id, agent)
  return agent
}

/** Process pending messages for a specific agent */
export async function processMessagesFor(agentId: AgentId): Promise<AgentResult> {
  const agent = getOrCreateAgent(agentId)
  if (!agent) return unsupportedAgentResult(agentId)

  const messages = await prisma.agentMessage.findMany({
    where: { to_agent: agentId, responded: false },
    orderBy: [{ priority: 'asc' }, { created_at: 'asc' }],
    take: 50,
  })

  for (const msg of messages) {
    try {
      const result = await agent.receiveMessage({
        id: msg.id,
        from: msg.from_agent as AgentId,
        to: msg.to_agent as AgentId,
        intent: msg.intent,
        payload: msg.payload,
        timestamp: msg.created_at,
        priority: msg.priority.toLowerCase() as any,
        requiresResponse: msg.requires_response,
      })

      if (result.success) {
        await prisma.agentMessage.update({
          where: { id: msg.id },
          data: {
            responded: true,
            response_payload: result.data as any,
          },
        })
      } else {
        await agent.log('message_processing_failed', {
          messageId: msg.id,
          intent: msg.intent,
          error: result.error ?? 'Unsupported message intent',
        })
      }
    } catch (error) {
      console.error(`Agent ${agentId} failed to process message ${msg.id}:`, error)
      await agent.log('message_processing_failed', {
        messageId: msg.id,
        intent: msg.intent,
        error: String(error),
      })
    }
  }

  return { success: true, data: { processed: messages.length } }
}

/** Route a message from one agent to another */
export async function routeMessage(
  fromId: AgentId,
  toId: AgentId,
  intent: string,
  payload: unknown
): Promise<AgentResult> {
  const fromAgent = getOrCreateAgent(fromId)
  if (!fromAgent) return unsupportedAgentResult(fromId)
  if (!getOrCreateAgent(toId)) return unsupportedAgentResult(toId)

  await fromAgent.sendMessage(toId, intent, payload)
  return processMessagesFor(toId)
}

/** Run a specific agent's main task */
export async function runAgent(agentId: AgentId, input?: unknown): Promise<AgentResult> {
  const agent = getOrCreateAgent(agentId)
  if (!agent) return unsupportedAgentResult(agentId)

  await agent.log('run_started', { input })
  try {
    const result = await agent.run(input)
    if (result.success) {
      await agent.log('run_completed', { success: true })
    } else {
      await agent.log('run_failed', {
        success: false,
        error: result.error ?? 'Agent returned unsuccessful result',
      })
    }
    return result
  } catch (error) {
    await agent.log('run_failed', { error: String(error) })
    return { success: false, error: String(error) }
  }
}

export function getRunnableAgentIds(): readonly AgentId[] {
  return RUNNABLE_AGENT_IDS
}

function unsupportedAgentResult(agentId: string): AgentResult {
  return {
    success: false,
    error: `Unsupported agent "${agentId}". Runnable agents: ${RUNNABLE_AGENT_IDS.join(', ')}`,
  }
}

/** Send a cross-dashboard message (Legal -> Finance) */
export async function sendCrossDashboardMessage(
  source: string,
  eventType: string,
  entityType: string,
  entityId: string,
  payload: unknown
): Promise<void> {
  await prisma.crossModuleEvent.create({
    data: {
      source,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      payload: payload as any,
    },
  })
}
