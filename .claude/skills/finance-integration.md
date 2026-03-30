# Finance Module Integration Guide

## Overview
The Legal and Finance dashboards share a NeonDB PostgreSQL instance. Integration happens at the database level — no HTTP calls between modules. Both dashboards can read shared tables.

## How They Connect (from PRD Section 6)

### Legal → Finance (auto-sync on contract signing)
When a contract transitions to SIGNED status:
1. **Sponsor Entity** auto-created in finance (name, tier, value, officer, entity tag)
2. **Payment Schedule** auto-created (amounts, dates, milestones from contract terms)
3. **Revenue Recognition Entry** created (journal debit/credit)
4. **Audit Document Link** — signed PDF becomes the backing document

### Finance → Legal (compliance feedback)
- Overdue receivables flag legal compliance review of payment cycle terms
- Late payments flagged as legal compliance issues
- Payment cycle terms enforced by legal module

### Calendar → Both
- Race dates and milestones trigger tranche payments (finance)
- E1 regulatory requirements appear in compliance calendar (legal)

## Implementation Strategy

### Phase 1: Prepare (Current — Legal Dashboard build)
Add nullable foreign key columns that will link to finance tables:
- `PaymentCycle.finance_sync_id` — will reference finance `payments.id`
- `LegalDocument` with `finance_sponsor_id` field for the created sponsor

Create a `CrossModuleEvent` model:
```prisma
model CrossModuleEvent {
  id          String   @id @default(uuid())
  source      String   // "legal" or "finance"
  event_type  String   // "contract_signed", "payment_overdue", etc.
  entity_type String   // "LegalDocument", "PaymentCycle", etc.
  entity_id   String
  payload     Json     // event-specific data
  processed   Boolean  @default(false)
  created_at  DateTime @default(now())
}
```

### Phase 2: Connect (After Finance V2)
When finance dashboard is ready:
1. Legal writes `CrossModuleEvent` on contract signing
2. Finance dashboard polls/reads `CrossModuleEvent` table
3. Finance creates Sponsor + Payment Schedule from event payload
4. Finance updates `CrossModuleEvent.processed = true`
5. Finance writes back `finance_sync_id` to legal's `PaymentCycle`

### Phase 3: Bidirectional
- Finance writes events for overdue receivables
- Legal reads those events and creates compliance alerts
- Both modules display each other's data in read-only panels

## Shared Database Tables

These tables exist in the shared NeonDB and are referenced by both modules:

### `calendar_events`
Used by both modules for event-driven scheduling:
- Legal: compliance deadlines, contract milestones
- Finance: tranche payment triggers, race dates

### `audit_documents`
Backing documents for both modules:
- Legal: signed contracts, policy PDFs, board resolutions
- Finance: invoices, receipts, bank statements

### `email_threads`
Email context linked to both:
- Legal: contract negotiation threads
- Finance: invoice dispute threads

## Read-Only Finance Data in Legal Dashboard

The legal dashboard can display finance data in these locations:

1. **Document Detail → Financials Tab**
   - Show linked invoices/payments from finance
   - Payment status indicators
   - Total value recognized vs deferred

2. **Payment Cycles Page → Finance Sync Column**
   - Show if the payment cycle has been synced to finance
   - Last sync timestamp
   - Discrepancy flag if legal and finance amounts differ

3. **Expirations Page → Financial Impact**
   - Show revenue at risk for expiring contracts
   - Cost savings potential for non-renewal decisions

4. **Command Center → Financial Overview Card**
   - Total contract value under management
   - Revenue at risk from expiring documents

## Environment
Both dashboards use the same `DATABASE_URL` pointing to the shared NeonDB instance. The legal dashboard's Prisma schema includes only the legal-specific tables. Cross-module reads use raw SQL via `prisma.$queryRaw` to access finance tables directly.

## Important: No Breaking Changes
The legal dashboard MUST NOT:
- Modify finance tables
- Drop or alter finance columns
- Create conflicting table names
- Use the same primary key sequences

All shared tables should use UUID primary keys to avoid conflicts.
