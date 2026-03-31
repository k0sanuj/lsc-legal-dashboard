import { prisma } from '@/lib/prisma'
import { BaseAgent } from './base-agent'
import type { AgentResult } from './types'

interface EntityAuditFindings {
  entity: string
  complianceRecords: { total: number; compliant: number; atRisk: number; details: string[] }
  kycDocuments: { total: number; valid: number; expired: number; details: string[] }
  officeAgreements: { total: number; current: number; expiringSoon: number; details: string[] }
  companyEmails: { total: number; active: number; inactive: number; details: string[] }
  incomingNotices: {
    total: number
    pendingResponse: number
    overdueResponse: number
    details: string[]
  }
  adminAccounts: { total: number; verified: number; unverified: number; details: string[] }
}

const AUDIT_ENTITIES = ['LSC', 'TBR', 'FSP'] as const

export class ComplianceAuditAgent extends BaseAgent {
  id = 'compliance-audit' as const
  name = 'Compliance Audit Agent'
  description =
    'Performs a full 15-day compliance audit across LSC, TBR, and FSP entities, checking compliance records, KYC documents, office agreements, email activity, incoming notices, and admin accounts.'

  async run(): Promise<AgentResult> {
    const now = new Date()
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    await this.log('audit_started', { entities: AUDIT_ENTITIES, auditWindow: '15 days' })

    let totalCompliant = 0
    let totalAtRisk = 0
    let totalItems = 0
    const allFindings: EntityAuditFindings[] = []

    for (const entity of AUDIT_ENTITIES) {
      const findings: EntityAuditFindings = {
        entity,
        complianceRecords: { total: 0, compliant: 0, atRisk: 0, details: [] },
        kycDocuments: { total: 0, valid: 0, expired: 0, details: [] },
        officeAgreements: { total: 0, current: 0, expiringSoon: 0, details: [] },
        companyEmails: { total: 0, active: 0, inactive: 0, details: [] },
        incomingNotices: { total: 0, pendingResponse: 0, overdueResponse: 0, details: [] },
        adminAccounts: { total: 0, verified: 0, unverified: 0, details: [] },
      }

      // ── 1. ComplianceRecord status ───────────────────────────────────────

      const complianceRecords = await prisma.complianceRecord.findMany({
        where: { entity },
      })

      findings.complianceRecords.total = complianceRecords.length
      for (const rec of complianceRecords) {
        if (rec.status === 'ACTIVE') {
          findings.complianceRecords.compliant++
        } else {
          findings.complianceRecords.atRisk++
          findings.complianceRecords.details.push(
            `${rec.check_type} (${rec.jurisdiction}): status ${rec.status}`
          )
        }
      }

      // ── 2. KycDocument expiry ────────────────────────────────────────────

      const kycDocs = await prisma.kycDocument.findMany({
        where: { entity },
      })

      findings.kycDocuments.total = kycDocs.length
      for (const doc of kycDocs) {
        if (doc.status === 'EXPIRED' || (doc.expiry_date && doc.expiry_date <= now)) {
          findings.kycDocuments.expired++
          findings.kycDocuments.details.push(
            `${doc.document_type} "${doc.document_name}": ${doc.status}${doc.expiry_date ? `, expired ${doc.expiry_date.toISOString().split('T')[0]}` : ''}`
          )
        } else if (doc.status === 'NEEDS_RENEWAL') {
          findings.kycDocuments.expired++
          findings.kycDocuments.details.push(
            `${doc.document_type} "${doc.document_name}": needs renewal`
          )
        } else {
          findings.kycDocuments.valid++
        }
      }

      // ── 3. RegisteredOfficeAgreement renewal ─────────────────────────────

      const offices = await prisma.registeredOfficeAgreement.findMany({
        where: { entity },
      })

      findings.officeAgreements.total = offices.length
      for (const office of offices) {
        if (office.renewal_date <= now) {
          findings.officeAgreements.expiringSoon++
          findings.officeAgreements.details.push(
            `${office.address} (${office.jurisdiction}): OVERDUE — renewal was ${office.renewal_date.toISOString().split('T')[0]}`
          )
        } else if (office.renewal_date <= in30Days) {
          findings.officeAgreements.expiringSoon++
          findings.officeAgreements.details.push(
            `${office.address} (${office.jurisdiction}): renews ${office.renewal_date.toISOString().split('T')[0]}`
          )
        } else {
          findings.officeAgreements.current++
        }
      }

      // ── 4. CompanyEmail activity ─────────────────────────────────────────

      const emails = await prisma.companyEmail.findMany({
        where: { entity },
      })

      findings.companyEmails.total = emails.length
      for (const email of emails) {
        const isInactive =
          email.status !== 'active' ||
          (email.last_activity && email.last_activity < fifteenDaysAgo) ||
          (email.domain_expiry && email.domain_expiry <= in30Days)

        if (isInactive) {
          findings.companyEmails.inactive++
          const reasons: string[] = []
          if (email.status !== 'active') reasons.push(`status: ${email.status}`)
          if (email.last_activity && email.last_activity < fifteenDaysAgo)
            reasons.push('no activity in 15+ days')
          if (email.domain_expiry && email.domain_expiry <= in30Days)
            reasons.push(`domain expires ${email.domain_expiry.toISOString().split('T')[0]}`)
          findings.companyEmails.details.push(`${email.email_address}: ${reasons.join(', ')}`)
        } else {
          findings.companyEmails.active++
        }
      }

      // ── 5. IncomingNotice response deadlines ─────────────────────────────

      const notices = await prisma.incomingNotice.findMany({
        where: {
          status: { in: ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
        },
      })

      // Filter notices relevant to this entity by checking assigned compliance officers
      const entityOfficerUserIds = (
        await prisma.complianceOfficer.findMany({
          where: { entity },
          select: { user_id: true },
        })
      ).map((o) => o.user_id)

      const entityNotices = notices.filter(
        (n) => !n.assigned_to || entityOfficerUserIds.includes(n.assigned_to)
      )

      findings.incomingNotices.total = entityNotices.length
      for (const notice of entityNotices) {
        if (notice.response_deadline && notice.response_deadline <= now) {
          findings.incomingNotices.overdueResponse++
          findings.incomingNotices.details.push(
            `"${notice.subject}" (${notice.category}): response OVERDUE since ${notice.response_deadline.toISOString().split('T')[0]}`
          )
        } else if (notice.status === 'NEW' || notice.status === 'ACKNOWLEDGED') {
          findings.incomingNotices.pendingResponse++
          findings.incomingNotices.details.push(
            `"${notice.subject}" (${notice.category}): ${notice.status}${notice.response_deadline ? `, due ${notice.response_deadline.toISOString().split('T')[0]}` : ''}`
          )
        }
      }

      // ── 6. AdminAccount last_verified ────────────────────────────────────

      const adminAccounts = await prisma.adminAccount.findMany({
        where: { entity },
      })

      findings.adminAccounts.total = adminAccounts.length
      for (const account of adminAccounts) {
        const isVerifiedRecently = account.last_verified && account.last_verified > fifteenDaysAgo
        if (isVerifiedRecently) {
          findings.adminAccounts.verified++
        } else {
          findings.adminAccounts.unverified++
          findings.adminAccounts.details.push(
            `${account.platform_name} (${account.account_holder}): ${account.last_verified ? `last verified ${account.last_verified.toISOString().split('T')[0]}` : 'never verified'}${!account.two_factor_enabled ? ', NO 2FA' : ''}`
          )
        }
      }

      // ── Tally entity totals ──────────────────────────────────────────────

      const entityCompliant =
        findings.complianceRecords.compliant +
        findings.kycDocuments.valid +
        findings.officeAgreements.current +
        findings.companyEmails.active +
        findings.adminAccounts.verified

      const entityAtRisk =
        findings.complianceRecords.atRisk +
        findings.kycDocuments.expired +
        findings.officeAgreements.expiringSoon +
        findings.companyEmails.inactive +
        findings.incomingNotices.overdueResponse +
        findings.adminAccounts.unverified

      totalCompliant += entityCompliant
      totalAtRisk += entityAtRisk
      totalItems +=
        findings.complianceRecords.total +
        findings.kycDocuments.total +
        findings.officeAgreements.total +
        findings.companyEmails.total +
        findings.incomingNotices.total +
        findings.adminAccounts.total

      allFindings.push(findings)
    }

    // ── Create AuditReport record ────────────────────────────────────────────

    const report = await prisma.auditReport.create({
      data: {
        audit_type: 'compliance_full_audit',
        findings: allFindings as any,
        summary: `Full compliance audit across ${AUDIT_ENTITIES.join(', ')}. ${totalCompliant} compliant, ${totalAtRisk} at-risk out of ${totalItems} total items.`,
        risk_items: totalAtRisk,
        compliant_items: totalCompliant,
        total_items: totalItems,
        run_by: 'compliance-audit-agent',
      },
    })

    await this.log('audit_complete', {
      reportId: report.id,
      totalItems,
      compliant: totalCompliant,
      atRisk: totalAtRisk,
    })

    return {
      success: true,
      data: {
        reportId: report.id,
        summary: {
          entities: AUDIT_ENTITIES,
          totalItems,
          compliant: totalCompliant,
          atRisk: totalAtRisk,
          auditDate: now.toISOString(),
        },
        findings: allFindings,
      },
    }
  }
}
