import { prisma } from '@/lib/prisma'
import { BaseAgent } from './base-agent'
import { LSC_LEGAL_CONTEXT } from './shared-context'
import type { AgentResult } from './types'
import { sendCrossDashboardMessage } from './orchestrator'

interface InvoiceDetectionInput {
  emailBody: string
  from: string
  subject: string
  attachments?: string[]
}

interface DetectedInvoiceData {
  isInvoice: boolean
  confidence: number
  vendor: string | null
  amount: number | null
  currency: string | null
  invoiceDate: string | null
  entity: string | null
  category: string | null
  lineItems?: { description: string; amount: number }[]
}

const TASK_INSTRUCTIONS = `Task: Determine if the email below contains or references an invoice (direct attachment, payment request, billing statement, pro-forma invoice, or overdue notice).

Output JSON schema:
{
  "isInvoice": true|false,
  "confidence": 0.0-1.0,
  "vendor": "vendor name or null",
  "amount": numeric_amount_or_null,
  "currency": "AED|USD|EUR|GBP or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "entity": "LSC|TBR|FSP|XTZ|XTE or null",
  "sport": "BOWLING|SQUASH|BASKETBALL|WORLD_PONG|FOUNDATION (when entity=FSP and tournament-related) or null",
  "category": "category description or null",
  "lineItems": [{ "description": "string", "amount": number }]
}`

const SYSTEM_PROMPT = `${LSC_LEGAL_CONTEXT}\n\n${TASK_INSTRUCTIONS}`

export class InvoiceDetectionAgent extends BaseAgent {
  id = 'email-inbox.invoice-detection' as const
  name = 'Invoice Detection Agent'
  description =
    'Analyzes incoming emails for invoice content, extracts financial details, creates DetectedInvoice records, and routes TBR invoices to the finance dashboard.'

  async run(input?: unknown): Promise<AgentResult> {
    const { emailBody, from, subject, attachments } = (input ?? {}) as InvoiceDetectionInput

    if (!emailBody || !from || !subject) {
      return {
        success: false,
        error: 'Missing required input: emailBody, from, and subject are required.',
      }
    }

    await this.log('invoice_scan_started', { from, subject, hasAttachments: !!attachments?.length })

    // ── 1. Call AI to analyze email ──────────────────────────────────────────

    const userMessage = [
      `From: ${from}`,
      `Subject: ${subject}`,
      attachments?.length ? `Attachments: ${attachments.join(', ')}` : null,
      ``,
      `Body:`,
      emailBody,
    ]
      .filter(Boolean)
      .join('\n')

    let rawResponse: string
    try {
      rawResponse = await this.callAI({
        system: SYSTEM_PROMPT,
        user: userMessage,
        model: 'haiku',
        maxTokens: 768,
        expectJson: true,
      })
    } catch (error) {
      await this.log('ai_call_failed', { from, subject, error: String(error) })
      return { success: false, error: `AI analysis failed: ${String(error)}` }
    }

    // ── 2. Parse AI response ─────────────────────────────────────────────────

    let detection: DetectedInvoiceData
    try {
      const cleaned = rawResponse.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()
      detection = JSON.parse(cleaned)
    } catch {
      await this.log('parse_failed', { from, subject, rawResponse: rawResponse.slice(0, 500) })
      return {
        success: false,
        error: 'Failed to parse AI response as JSON.',
        data: { rawResponse },
      }
    }

    // ── 3. If not an invoice, log and return ─────────────────────────────────

    if (!detection.isInvoice) {
      await this.log('no_invoice_detected', { from, subject, confidence: detection.confidence })
      return {
        success: true,
        data: {
          isInvoice: false,
          confidence: detection.confidence,
          from,
          subject,
        },
      }
    }

    // ── 4. Create DetectedInvoice record ─────────────────────────────────────

    const entityValue = isValidEntity(detection.entity) ? (detection.entity as any) : null

    const invoice = await prisma.detectedInvoice.create({
      data: {
        vendor_name: detection.vendor ?? from,
        amount: detection.amount ?? 0,
        currency: detection.currency ?? 'AED',
        invoice_date: detection.invoiceDate ? new Date(detection.invoiceDate) : null,
        entity: entityValue,
        category: detection.category,
        verification_status: 'pending',
        math_check_passed: false,
        original_email_id: `${from}::${subject}`,
        routed_to_finance: false,
        notes: detection.lineItems?.length
          ? `Line items: ${detection.lineItems.map((li) => `${li.description}: ${li.amount}`).join('; ')}`
          : null,
      },
    })

    await this.log('invoice_created', {
      invoiceId: invoice.id,
      vendor: invoice.vendor_name,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      entity: invoice.entity,
    })

    // ── 5. If entity is TBR, send cross-dashboard message to finance ─────────

    if (entityValue === 'TBR') {
      await sendCrossDashboardMessage(
        'legal-dashboard',
        'invoice_detected',
        'DetectedInvoice',
        invoice.id,
        {
          vendor: invoice.vendor_name,
          amount: Number(invoice.amount),
          currency: invoice.currency,
          invoiceDate: invoice.invoice_date,
          category: invoice.category,
          sourceEmail: from,
          sourceSubject: subject,
        }
      )

      await prisma.detectedInvoice.update({
        where: { id: invoice.id },
        data: { routed_to_finance: true },
      })

      await this.log('routed_to_finance', {
        invoiceId: invoice.id,
        entity: 'TBR',
        reason: 'TBR entity auto-routes to finance dashboard',
      })
    }

    // ── 6. Notify legal admins ───────────────────────────────────────────────

    const legalAdmins = await prisma.appUser.findMany({
      where: { role: { in: ['LEGAL_ADMIN', 'FINANCE_ADMIN'] }, is_active: true },
      select: { id: true },
    })

    for (const admin of legalAdmins) {
      await prisma.notification.create({
        data: {
          user_id: admin.id,
          type: 'invoice_detected',
          title: `Invoice Detected — ${detection.vendor ?? from}`,
          message: `${detection.currency ?? 'AED'} ${detection.amount?.toLocaleString() ?? 'N/A'} from ${detection.vendor ?? from}. Subject: "${subject}"`,
          link: '/emails',
        },
      })
    }

    return {
      success: true,
      data: {
        isInvoice: true,
        confidence: detection.confidence,
        invoiceId: invoice.id,
        vendor: invoice.vendor_name,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        entity: invoice.entity,
        routedToFinance: entityValue === 'TBR',
      },
    }
  }
}

function isValidEntity(value: string | null): boolean {
  if (!value) return false
  const validEntities = ['LSC', 'TBR', 'FSP', 'XTZ', 'XTE']
  return validEntities.includes(value)
}
