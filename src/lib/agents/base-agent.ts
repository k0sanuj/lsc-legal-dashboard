import { prisma } from '@/lib/prisma'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AgentId, AgentMessagePayload, AgentResult, AgentMessagePriority } from './types'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

export abstract class BaseAgent {
  abstract id: AgentId
  abstract name: string
  abstract description: string

  /** Send a message to another agent via the orchestrator */
  async sendMessage(
    to: AgentId,
    intent: string,
    payload: unknown,
    priority: AgentMessagePriority = 'normal',
    requiresResponse = false
  ): Promise<string> {
    const msg = await prisma.agentMessage.create({
      data: {
        from_agent: this.id,
        to_agent: to,
        intent,
        payload: payload as any,
        priority: priority.toUpperCase() as any,
        requires_response: requiresResponse,
      },
    })
    await this.log(`sent_message`, { to, intent, messageId: msg.id })
    return msg.id
  }

  /** Process an incoming message — override in subclasses */
  async receiveMessage(message: AgentMessagePayload): Promise<AgentResult> {
    await this.log('received_message', { from: message.from, intent: message.intent })
    return { success: true }
  }

  /** Log an agent action to the activity log */
  async log(action: string, details?: unknown): Promise<void> {
    await prisma.agentActivityLog.create({
      data: {
        agent_id: this.id,
        agent_name: this.name,
        action,
        details: details as any,
      },
    })
  }

  /** Call Gemini for AI-powered agents */
  async callAI(systemPrompt: string, userMessage: string): Promise<string> {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
    })
    const result = await model.generateContent(userMessage)
    return result.response.text()
  }

  /** Run the agent's main task — override in subclasses */
  abstract run(input?: unknown): Promise<AgentResult>
}
