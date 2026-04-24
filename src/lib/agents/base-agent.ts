import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AgentId, AgentMessagePayload, AgentResult, AgentMessagePriority } from './types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')
const PROVIDER = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase()

export type AICallOptions = {
  system: string
  user: string
  model?: 'haiku' | 'sonnet'
  maxTokens?: number
  expectJson?: boolean
}

export abstract class BaseAgent {
  abstract id: AgentId
  abstract name: string
  abstract description: string

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

  async receiveMessage(message: AgentMessagePayload): Promise<AgentResult> {
    await this.log('received_message', { from: message.from, intent: message.intent })
    return { success: true }
  }

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

  /**
   * Provider-agnostic AI call.
   * Anthropic path uses prompt caching, explicit max_tokens, temperature 0,
   * JSON prefill, and trims user input to 8000 chars to control cost.
   * Gemini path is the fallback (flip AI_PROVIDER=gemini in env to use).
   */
  async callAI(opts: AICallOptions | string, legacyUser?: string): Promise<string> {
    // Backwards-compat: old two-arg form `callAI(system, user)`
    const normalized: AICallOptions =
      typeof opts === 'string'
        ? { system: opts, user: legacyUser ?? '' }
        : opts

    const trimmed = normalized.user.slice(0, 8000)

    if (PROVIDER === 'gemini') {
      const modelName = normalized.model === 'sonnet' ? 'gemini-2.5-pro' : 'gemini-2.5-flash'
      const m = gemini.getGenerativeModel({
        model: modelName,
        systemInstruction: normalized.system,
      })
      return (await m.generateContent(trimmed)).response.text()
    }

    const modelId =
      normalized.model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: trimmed },
    ]
    if (normalized.expectJson) {
      messages.push({ role: 'assistant', content: '{' })
    }

    const res = await anthropic.messages.create({
      model: modelId,
      max_tokens: normalized.maxTokens ?? 1024,
      temperature: 0,
      system: [
        {
          type: 'text',
          text: normalized.system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    })

    const block = res.content[0]
    const text = block && block.type === 'text' ? block.text : ''
    return normalized.expectJson ? '{' + text : text
  }

  abstract run(input?: unknown): Promise<AgentResult>
}
