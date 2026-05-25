export type AgentId =
  | 'compliance'
  | 'agreement-analyzer'
  | 'email-inbox.invoice-detection'
  | 'compliance-audit'
  | 'pre-signature-checklist'
  | 'activation'

export const RUNNABLE_AGENT_IDS = [
  'agreement-analyzer',
  'pre-signature-checklist',
  'activation',
  'email-inbox.invoice-detection',
  'compliance',
  'compliance-audit',
] as const satisfies readonly AgentId[]

export function isRunnableAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && RUNNABLE_AGENT_IDS.includes(value as AgentId)
}

export type AgentMessagePriority = 'critical' | 'high' | 'normal' | 'low'

export interface AgentMessagePayload {
  id: string
  from: AgentId
  to: AgentId
  intent: string
  payload: unknown
  timestamp: Date
  priority: AgentMessagePriority
  requiresResponse: boolean
}

export interface AgentLogEntry {
  agentId: AgentId
  agentName: string
  action: string
  details?: unknown
}

export interface AgentResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
