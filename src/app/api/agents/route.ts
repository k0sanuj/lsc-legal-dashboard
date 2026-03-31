import { NextResponse } from 'next/server'
import { runAgent, routeMessage, processMessagesFor } from '@/lib/agents/orchestrator'
import type { AgentId } from '@/lib/agents/types'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, agentId, input, fromAgent, toAgent, intent, payload } = body

    switch (action) {
      case 'run': {
        if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })
        const result = await runAgent(agentId as AgentId, input)
        return NextResponse.json(result)
      }
      case 'route': {
        if (!fromAgent || !toAgent || !intent) {
          return NextResponse.json({ error: 'fromAgent, toAgent, intent required' }, { status: 400 })
        }
        const result = await routeMessage(fromAgent as AgentId, toAgent as AgentId, intent, payload)
        return NextResponse.json(result)
      }
      case 'process': {
        if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })
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
