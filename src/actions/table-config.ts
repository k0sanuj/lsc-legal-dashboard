'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function toggleTableLock(formData: FormData) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN'])
  const configId = formData.get('configId') as string
  const locked = formData.get('locked') === 'true'

  await prisma.dashboardTableConfig.update({
    where: { id: configId },
    data: { locked, updated_by: session.fullName },
  })

  revalidatePath('/legal/table-config')
  // void return for form action compatibility
}

export async function createTableConfig() {
  'use server'
  await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN'])

  const defaults = [
    {
      table_key: 'agreements_overview',
      columns: ['Entity', 'Category', 'Title', 'Counterparty', 'Status', 'Effective Date', 'Expiry Date', 'Financial Impact', 'Assigned To'],
      sort_order: { field: 'updated_at', direction: 'desc' },
      locked: true,
    },
    {
      table_key: 'documents_repository',
      columns: ['Title', 'Category', 'Status', 'Entity', 'Value', 'Owner', 'Expiry Date', 'Updated'],
      sort_order: { field: 'updated_at', direction: 'desc' },
      locked: true,
    },
    {
      table_key: 'litigation_tracker',
      columns: ['Case Name', 'Case Number', 'Entity', 'Jurisdiction', 'Status', 'Next Hearing', 'Estimated Liability', 'Assigned Counsel'],
      sort_order: { field: 'next_hearing', direction: 'asc' },
      locked: true,
    },
    {
      table_key: 'kyc_documents',
      columns: ['Entity', 'Jurisdiction', 'Document Type', 'Document Name', 'Status', 'Expiry Date', 'Verified By'],
      sort_order: { field: 'expiry_date', direction: 'asc' },
      locked: true,
    },
    {
      table_key: 'compliance_matrix',
      columns: ['Entity', 'Jurisdiction', 'Check Type', 'Status', 'Registration Number', 'Last Checked', 'Next Check'],
      sort_order: { field: 'next_check', direction: 'asc' },
      locked: true,
    },
    {
      table_key: 'payment_cycles',
      columns: ['Document', 'Terms', 'Amount', 'Status', 'Cycle Start', 'Cycle End', 'Finance Sync'],
      sort_order: { field: 'status', direction: 'asc' },
      locked: false,
    },
  ]

  for (const config of defaults) {
    await prisma.dashboardTableConfig.upsert({
      where: { table_key: config.table_key },
      update: { columns: config.columns, sort_order: config.sort_order, locked: config.locked },
      create: config,
    })
  }

  revalidatePath('/legal/table-config')
  // void return for form action compatibility
}
