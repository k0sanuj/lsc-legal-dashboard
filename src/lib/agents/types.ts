export type AgentId =
  | 'orchestrator'
  | 'compliance'
  | 'compliance.jurisdiction'
  | 'compliance.data-protection'
  | 'compliance.renewal-tracker'
  | 'agreement-analyzer'
  | 'agreement-analyzer.categorization'
  | 'agreement-analyzer.clause-extraction'
  | 'agreement-analyzer.clickwrap-tracker'
  | 'kyc'
  | 'kyc.admin-accounts'
  | 'kyc.vendor-verification'
  | 'litigation'
  | 'litigation.case-tracker'
  | 'litigation.finance-liaison'
  | 'email-inbox'
  | 'email-inbox.invoice-detection'
  | 'email-inbox.notice-detection'
  | 'email-inbox.deadline-extraction'
  | 'compliance-audit'
  | 'compliance-audit.entity-scanner'
  | 'compliance-audit.office-tracker'
  | 'compliance-audit.email-checker'
  | 'data-compliance-officer'
  | 'data-compliance-officer.gdpr'
  | 'data-compliance-officer.jurisdiction-policy'
  | 'data-compliance-officer.officer-assignment'

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
