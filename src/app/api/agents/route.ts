import { NextResponse } from 'next/server'
import { runAgent, routeMessage, processMessagesFor } from '@/lib/agents/orchestrator'
import { isRunnableAgentId, type AgentId } from '@/lib/agents/types'
import { getOptionalSession } from '@/lib/auth'

const ALLOWED_ROLES = new Set(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

export async function POST(request: Request) {
  try {
    const session = await getOptionalSession()
    if (!session || !ALLOWED_ROLES.has(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, agentId, input, fromAgent, toAgent, intent, payload } = body

    switch (action) {
      case 'run': {
        if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })
        if (!isRunnableAgentId(agentId)) {
          return NextResponse.json({ error: `Unsupported agent: ${agentId}` }, { status: 400 })
        }
        const result = await runAgent(agentId as AgentId, input)
        return NextResponse.json(result)
      }
      case 'route': {
        if (!fromAgent || !toAgent || !intent) {
          return NextResponse.json({ error: 'fromAgent, toAgent, intent required' }, { status: 400 })
        }
        if (!isRunnableAgentId(fromAgent) || !isRunnableAgentId(toAgent)) {
          return NextResponse.json({ error: 'Unsupported sender or recipient agent' }, { status: 400 })
        }
        const result = await routeMessage(fromAgent as AgentId, toAgent as AgentId, intent, payload)
        return NextResponse.json(result)
      }
      case 'process': {
        if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })
        if (!isRunnableAgentId(agentId)) {
          return NextResponse.json({ error: `Unsupported agent: ${agentId}` }, { status: 400 })
        }
        const result = await processMessagesFor(agentId as AgentId)
        return NextResponse.json(result)
      }
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Agent API error:', error)
    return NextResponse.json({ error: 'Agent operation failed' }, { status: 500 })
  }
}
