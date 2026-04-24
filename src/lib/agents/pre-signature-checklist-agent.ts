import { prisma } from '@/lib/prisma'
import { BaseAgent } from './base-agent'
import { LSC_LEGAL_CONTEXT } from './shared-context'
import type { AgentResult } from './types'

interface PreSignatureInput {
  documentId: string
}

interface ChecklistResult {
  ready: boolean
  blockers: string[]
  warnings: string[]
  summary: string
}

const TASK_INSTRUCTIONS = `Task: Verify a contract is ready for signature. Check for common blockers before the document is sent to HelloSign.

Evaluate:
1. Party names — are all signatories fully named with legal suffixes (LLC, FZCO, etc.)?
2. Signature blocks — is there a clear signature block for each party?
3. Monetary amounts — are any still blank, placeholder ("$X"), or using template variables ("{{amount}}")?
4. Dates — are effective date and term dates concrete (not "TBD" or blank)?
5. Governing law — is a jurisdiction specified?
6. Unresolved placeholders — any square brackets, curly braces, or "TBD" / "[TO BE ADDED]" markers?
7. Counterparty consistency — does the counterparty name appear consistently or with variants that look like typos?

Output JSON schema:
{
  "ready": true|false,
  "blockers": ["specific issue 1", "specific issue 2"],
  "warnings": ["non-blocking concern 1"],
  "summary": "one-line overall status"
}

"ready" is true only if blockers is empty. Keep entries under 80 chars each.`

const SYSTEM_PROMPT = `${LSC_LEGAL_CONTEXT}\n\n${TASK_INSTRUCTIONS}`

export class PreSignatureChecklistAgent extends BaseAgent {
  id = 'pre-signature-checklist' as const
  name = 'Pre-Signature Checklist Agent'
  description =
    'Reviews a document at the NEGOTIATION → AWAITING_SIGNATURE transition to catch missing signatures, placeholder values, and unresolved blockers before it goes to e-signature.'

  async run(input?: unknown): Promise<AgentResult> {
    const { documentId } = (input ?? {}) as PreSignatureInput
    if (!documentId) {
      return { success: false, error: 'Missing documentId' }
    }

    const doc = await prisma.legalDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        notes: true,
        counterparty: true,
        owner_id: true,
      },
    })
    if (!doc) return { success: false, error: 'Document not found' }

    const content = doc.notes ?? ''
    if (!content.trim()) {
      // Nothing to analyze — record a blocker and exit without burning a token
      await this.writeNote(doc.id, doc.owner_id, {
        ready: false,
        blockers: ['No document content stored — cannot verify readiness'],
        warnings: [],
        summary: 'Document has no body content.',
      })
      await this.log('checklist_complete', { documentId, ready: false, reason: 'empty_content' })
      return { success: true, data: { ready: false } }
    }

    await this.log('checklist_started', { documentId, contentLength: content.length })

    let raw: string
    try {
      raw = await this.callAI({
        system: SYSTEM_PROMPT,
        user: `Title: ${doc.title}\nCounterparty: ${doc.counterparty ?? 'unknown'}\n\nDocument body:\n${content}`,
        model: 'haiku',
        maxTokens: 512,
        expectJson: true,
      })
    } catch (error) {
      await this.log('ai_call_failed', { documentId, error: String(error) })
      return { success: false, error: `AI analysis failed: ${String(error)}` }
    }

    let result: ChecklistResult
    try {
      const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()
      result = JSON.parse(cleaned)
    } catch {
      await this.log('parse_failed', { documentId, rawResponse: raw.slice(0, 500) })
      return { success: false, error: 'Failed to parse checklist response' }
    }

    await this.writeNote(doc.id, doc.owner_id, result)
    await this.log('checklist_complete', {
      documentId,
      ready: result.ready,
      blockerCount: result.blockers?.length ?? 0,
      warningCount: result.warnings?.length ?? 0,
    })
    return { success: true, data: result }
  }

  private async writeNote(
    documentId: string,
    authorId: string,
    result: ChecklistResult
  ): Promise<void> {
    const parts: string[] = [`Pre-Signature Checklist — ${result.ready ? '✓ READY' : '✗ NOT READY'}`]
    if (result.summary) parts.push(result.summary)
    if (result.blockers?.length) {
      parts.push('\nBlockers:')
      for (const b of result.blockers) parts.push(`  • ${b}`)
    }
    if (result.warnings?.length) {
      parts.push('\nWarnings:')
      for (const w of result.warnings) parts.push(`  • ${w}`)
    }
    await prisma.documentNote.create({
      data: {
        document_id: documentId,
        content: parts.join('\n'),
        author_id: authorId,
      },
    })
  }
}
