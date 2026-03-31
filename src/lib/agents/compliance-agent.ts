import { prisma } from '@/lib/prisma'
import { BaseAgent } from './base-agent'
import type { AgentResult } from './types'

export class ComplianceAgent extends BaseAgent {
  id = 'compliance' as const
  name = 'Compliance Agent'
  description =
    'Monitors compliance records and registered office agreements for expiry, approaching deadlines, and at-risk statuses.'

  async run(): Promise<AgentResult> {
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const findings: {
      expiredRecords: string[]
      approachingRecords: string[]
      updatedToAtRisk: string[]
      officeAlerts: { entity: string; daysUntilRenewal: number; address: string }[]
      notificationsCreated: number
    } = {
      expiredRecords: [],
      approachingRecords: [],
      updatedToAtRisk: [],
      officeAlerts: [],
      notificationsCreated: 0,
    }

    // ── 1. Check all ComplianceRecord entries ────────────────────────────────

    const allRecords = await prisma.complianceRecord.findMany()

    for (const record of allRecords) {
      const label = `${record.entity} / ${record.jurisdiction} / ${record.check_type}`

      // Record has a next_check date that has already passed -> mark AT_RISK
      if (record.next_check && record.next_check <= now && record.status !== 'AT_RISK') {
        await prisma.complianceRecord.update({
          where: { id: record.id },
          data: { status: 'AT_RISK' },
        })
        findings.updatedToAtRisk.push(label)
        findings.expiredRecords.push(label)
      }
      // Record approaching deadline (next_check within 30 days)
      else if (
        record.next_check &&
        record.next_check > now &&
        record.next_check <= in30Days &&
        record.status !== 'AT_RISK'
      ) {
        findings.approachingRecords.push(label)
      }
    }

    // ── 2. Create notifications for compliance officers ──────────────────────

    const alertItems = [
      ...findings.updatedToAtRisk.map((r) => `EXPIRED / AT_RISK: ${r}`),
      ...findings.approachingRecords.map((r) => `DUE SOON (30 days): ${r}`),
    ]

    if (alertItems.length > 0) {
      // Find all compliance officers to notify
      const officers = await prisma.complianceOfficer.findMany({
        include: { user: true },
      })

      const targetUserIds =
        officers.length > 0
          ? officers.map((o) => o.user_id)
          : // Fallback: notify Legal Admins and Platform Admins
            (
              await prisma.appUser.findMany({
                where: { role: { in: ['LEGAL_ADMIN', 'PLATFORM_ADMIN'] }, is_active: true },
                select: { id: true },
              })
            ).map((u) => u.id)

      for (const userId of targetUserIds) {
        await prisma.notification.create({
          data: {
            user_id: userId,
            type: 'compliance_alert',
            title: `Compliance Check: ${alertItems.length} item(s) require attention`,
            message: alertItems.join('\n'),
            link: '/compliance',
          },
        })
        findings.notificationsCreated++
      }
    }

    // ── 3. Check RegisteredOfficeAgreement renewal dates ─────────────────────

    const officeAgreements = await prisma.registeredOfficeAgreement.findMany()
    const alertThresholds = [90, 60, 30, 15, 7]

    for (const agreement of officeAgreements) {
      const daysUntilRenewal = Math.ceil(
        (agreement.renewal_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Check if we should fire an alert at any threshold
      const matchedThreshold = alertThresholds.find(
        (threshold) => daysUntilRenewal <= threshold && daysUntilRenewal > 0
      )

      if (matchedThreshold !== undefined || daysUntilRenewal <= 0) {
        findings.officeAlerts.push({
          entity: agreement.entity,
          daysUntilRenewal,
          address: agreement.address,
        })

        // Find compliance officers for this entity
        const entityOfficers = await prisma.complianceOfficer.findMany({
          where: { entity: agreement.entity },
          select: { user_id: true },
        })

        const notifyIds =
          entityOfficers.length > 0
            ? entityOfficers.map((o) => o.user_id)
            : (
                await prisma.appUser.findMany({
                  where: { role: { in: ['LEGAL_ADMIN', 'PLATFORM_ADMIN'] }, is_active: true },
                  select: { id: true },
                })
              ).map((u) => u.id)

        const urgency =
          daysUntilRenewal <= 0
            ? 'OVERDUE'
            : daysUntilRenewal <= 7
              ? 'CRITICAL'
              : daysUntilRenewal <= 15
                ? 'URGENT'
                : 'UPCOMING'

        for (const userId of notifyIds) {
          await prisma.notification.create({
            data: {
              user_id: userId,
              type: 'office_renewal_alert',
              title: `[${urgency}] Office Agreement Renewal — ${agreement.entity}`,
              message: `Registered office at ${agreement.address} (${agreement.jurisdiction}) ${daysUntilRenewal <= 0 ? 'is OVERDUE for renewal' : `renews in ${daysUntilRenewal} day(s)`}.`,
              link: '/compliance',
            },
          })
          findings.notificationsCreated++
        }
      }
    }

    // ── 4. Log and return summary ────────────────────────────────────────────

    await this.log('compliance_scan_complete', findings)

    return {
      success: true,
      data: {
        summary: {
          totalRecordsScanned: allRecords.length,
          expiredOrAtRisk: findings.updatedToAtRisk.length,
          approachingDeadline: findings.approachingRecords.length,
          officeRenewalAlerts: findings.officeAlerts.length,
          notificationsCreated: findings.notificationsCreated,
        },
        details: findings,
      },
    }
  }
}
