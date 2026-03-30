# Prisma Schema Guide — LSC Legal Dashboard

## Connection
- Provider: `postgresql`
- Database: NeonDB (connection via `DATABASE_URL` env var)
- Client output: `../src/generated/prisma`
- Use `@prisma/client` singleton pattern in `src/lib/prisma.ts`

## Enums

```prisma
enum Entity {
  LSC
  TBR
  FSP
  BOWLING
  SQUASH
  BASKETBALL
  BEER_PONG
  PADEL
  FOUNDATION
}

enum LifecycleStatus {
  DRAFT
  IN_REVIEW
  NEGOTIATION
  AWAITING_SIGNATURE
  SIGNED
  ACTIVE
  EXPIRING
  EXPIRED
  TERMINATED
}

enum DocumentCategory {
  SPONSORSHIP
  VENDOR
  EMPLOYMENT
  ESOP
  NDA
  ARENA_HOST
  TERMS_OF_SERVICE
  WAIVER
  IP_ASSIGNMENT
  PILOT_PROGRAM
  BOARD_RESOLUTION
  POLICY
  OTHER
}

enum SignatureStatus {
  PENDING
  SENT
  SIGNED
  STALLED
}

enum Priority {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

enum IssueCategory {
  IP
  EMPLOYMENT
  REGULATORY
  CONTRACTUAL
}

enum IssueStatus {
  OPEN
  IN_PROGRESS
  ESCALATED
  RESOLVED
  CLOSED
}

enum TrackerCategory {
  PLATFORM
  VAUNT_ACQUISITION
  KEY_AGREEMENTS
  CORPORATE
  PAYMENTS
  IP_PATENTS
  GIG_MARKETING
  OTHER
}

enum TrackerStatus {
  NOT_STARTED
  IN_PROGRESS
  IN_REVIEW
  BLOCKED
  COMPLETE
}

enum VestingType {
  STANDARD_4Y_1Y_CLIFF
  GRADED
  MILESTONE
  CUSTOM
}

enum VestingEventStatus {
  PENDING
  VESTED
  FORFEITED
}

enum PaymentTerms {
  NET_30
  NET_60
  MILESTONE
  CUSTOM
}

enum PaymentCycleStatus {
  UPCOMING
  ACTIVE
  OVERDUE
  COMPLETED
}

enum ComplianceStatus {
  UPCOMING
  DUE_SOON
  OVERDUE
  COMPLETED
}

enum Jurisdiction {
  UAE
  US_DELAWARE
  GLOBAL
}

enum UserRole {
  PLATFORM_ADMIN
  FINANCE_ADMIN
  LEGAL_ADMIN
  OPS_ADMIN
  FSP_FINANCE
  COMMERCIAL_OFFICER
  TEAM_MEMBER
  EXTERNAL_AUDITOR
}
```

## Models

### LegalDocument (central entity)
Fields: id (uuid), title, category (DocumentCategory), lifecycle_status (LifecycleStatus), parties (Json — array of {name, role, email}), value (Decimal, nullable), currency (String, default "AED"), entity (Entity), owner_id (relation to AppUser), expiry_date (DateTime, nullable), parent_doc_id (self-relation nullable — for addenda), signatories (Json), notes (Text, nullable), created_at, updated_at

Relations: versions (DocumentVersion[]), lifecycle_events (LifecycleEvent[]), signature_requests (SignatureRequest[]), payment_cycles (PaymentCycle[]), email_threads (EmailThread[]), parent (self), addenda (self[]), audit_documents (AuditDocument[])

### DocumentVersion
Fields: id, document_id, version_number (Int), file_url, change_summary (Text, nullable), created_by, created_at

### LifecycleEvent
Fields: id, document_id, from_status (LifecycleStatus), to_status (LifecycleStatus), transitioned_by, notes (Text, nullable), created_at

### SignatureRequest
Fields: id, document_id, signatory_name, signatory_email, status (SignatureStatus), sent_at (nullable), signed_at (nullable), reminder_count (Int, default 0), stalled_reason (nullable), created_at, updated_at

### ContractTemplate
Fields: id, name, category (DocumentCategory), entity (Entity, nullable), content (Text — the template body with {{variable}} placeholders), variables (Json — array of {name, type, required, description}), version (Int, default 1), usage_count (Int, default 0), is_active (Boolean, default true), created_at, updated_at

### ComplianceDeadline
Fields: id, title, description (Text, nullable), jurisdiction (Jurisdiction), category, deadline_date, recurring (Boolean, default false), recurrence_rule (String, nullable — cron-like), status (ComplianceStatus), linked_document_id (nullable), created_at, updated_at

### ESOPGrant
Fields: id, employee_name, employee_email (nullable), grant_date, total_shares (Int), vested_shares (Int, default 0), exercise_price (Decimal), vesting_type (VestingType), cliff_months (Int, default 12), vesting_months (Int, default 48), clawback_triggers (Json — array of strings), acceleration_events (Json), jp_split_ratio (Decimal, nullable — for JP 50-50 deal), legal_document_id (nullable — linked grant letter), created_at, updated_at

Relations: vesting_events (VestingEvent[])

### VestingEvent
Fields: id, grant_id, vest_date, shares_vesting (Int), status (VestingEventStatus), created_at

### PolicyDocument
Fields: id, title, version (Int, default 1), effective_date, category (String — HR/TRAVEL/EXPENSE/IP/CONDUCT), content (Text, nullable), file_url (nullable), acknowledgment_required (Boolean, default true), created_at, updated_at

Relations: acknowledgments (PolicyAcknowledgment[])

### PolicyAcknowledgment
Fields: id, policy_id, user_id, acknowledged_at

### LegalIssue
Fields: id, title, description (Text), category (IssueCategory), reporter_id, assigned_to (nullable), priority (Priority), sla_deadline (DateTime), status (IssueStatus), resolution (Text, nullable), escalation_level (Int, default 0), created_at, updated_at

### TrackerItem
Fields: id, ref_code (String, unique — e.g., "P1", "V1", "K1"), title, category (TrackerCategory), priority (Priority), status (TrackerStatus), assigned_to (nullable), dependency_refs (String[] — array of ref_codes like ["P1", "IP4"]), due_date (nullable), notes (Text, nullable), blocking_notes (Text, nullable — why this blocks other items), created_at, updated_at

### PaymentCycle
Fields: id, document_id, terms (PaymentTerms), custom_terms (String, nullable), amount (Decimal), currency (String, default "AED"), cycle_start (DateTime, nullable), cycle_end (DateTime, nullable), status (PaymentCycleStatus), finance_sync_id (String, nullable — for linking to finance module), last_sync_at (DateTime, nullable), created_at, updated_at

### AppUser
Fields: id, full_name, email (unique), role (UserRole), password_hash, is_active (Boolean, default true), last_login_at (nullable), created_at, updated_at

### AuthAccessEvent
Fields: id, app_user_id, event_type (String), event_status (String), ip_address (nullable), user_agent (nullable), metadata (Json, nullable), created_at

### AuditDocument
Fields: id, file_url, file_type (String), uploaded_by, uploaded_at, linked_entity_type (String), linked_entity_id (String), created_at

### EmailThread
Fields: id, subject, participants (Json), document_id (nullable), last_activity_at, messages (Json — array of {from, to, body, date}), created_at

### CalendarEvent
Fields: id, title, event_type (String), start_date, end_date (nullable), entity (Entity, nullable), linked_entity_type (nullable), linked_entity_id (nullable), created_at

## Valid Lifecycle Transitions
Enforce these in the `transitionDocument` server action:
```
DRAFT → IN_REVIEW
IN_REVIEW → NEGOTIATION | DRAFT (sent back)
NEGOTIATION → AWAITING_SIGNATURE | IN_REVIEW (sent back)
AWAITING_SIGNATURE → SIGNED | NEGOTIATION (sent back)
SIGNED → ACTIVE
ACTIVE → EXPIRING (auto, based on date) | TERMINATED
EXPIRING → EXPIRED (auto) | ACTIVE (renewed)
```

## Indexes
- `LegalDocument`: compound index on (entity, lifecycle_status), index on expiry_date
- `TrackerItem`: index on (category, priority), unique on ref_code
- `SignatureRequest`: index on (document_id, status)
- `ComplianceDeadline`: index on (deadline_date, status)
- `AppUser`: unique on email
- `LegalIssue`: index on (status, sla_deadline)

## Seed Data Reference
The 85 tracker items come from PRD Section 5.3:
- Platform Documents: P1-P20 (10 Critical, 6 High, 4 Medium/Low)
- Vaunt Acquisition: V1-V18 (13 Critical, 3 High, 2 Medium)
- Key Agreements: K1-K9
- Corporate: CF1-CF6
- Payments: BK1-BK4
- IP & Patents: IP1-IP6
- Gig Workers: GW1+
- Marketing: MK1-MK3+
