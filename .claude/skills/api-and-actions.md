# API & Server Actions Guide — LSC Legal Dashboard

## Mutation Pattern: Server Actions (Primary)

All data mutations use Next.js Server Actions. These live in `src/actions/`.

### Rules
1. Every action file starts with `'use server'`
2. Every action calls `requireSession()` or `requireRole([...])` first
3. Every mutation calls `revalidatePath()` after success
4. Return `{ success: true, data?: T }` or `{ success: false, error: string }`
5. Use Prisma transactions for multi-step operations
6. Log significant actions to an audit trail

### Document Actions (`src/actions/documents.ts`)

```typescript
'use server'

// Create a new legal document
export async function createDocument(formData: FormData): Promise<ActionResult<{ id: string }>>
// Fields: title, category, entity, parties (JSON string), value, currency, expiry_date, notes

// Transition document lifecycle status
export async function transitionDocument(
  documentId: string,
  toStatus: LifecycleStatus,
  notes?: string
): Promise<ActionResult>
// Validates transition is legal (see valid transitions in prisma-schema.md)
// Creates LifecycleEvent record
// If transitioning to SIGNED → auto-create finance sync placeholder

// Upload a new document version
export async function uploadVersion(
  documentId: string,
  formData: FormData
): Promise<ActionResult<{ versionId: string }>>
// Creates DocumentVersion record
// Increments version_number

// Create an addendum (child document linked to parent)
export async function createAddendum(
  parentDocId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>>
// Creates new LegalDocument with parent_doc_id set

// Delete a document (soft delete — set status to TERMINATED)
export async function terminateDocument(
  documentId: string,
  reason: string
): Promise<ActionResult>
```

### Signature Actions (`src/actions/signatures.ts`)

```typescript
'use server'

// Update signature request status (used by Kanban drag)
export async function updateSignatureStatus(
  requestId: string,
  newStatus: SignatureStatus
): Promise<ActionResult>

// Send reminder for a pending signature
export async function sendSignatureReminder(requestId: string): Promise<ActionResult>
// Increments reminder_count, logs action

// Create signature requests for a document
export async function createSignatureRequests(
  documentId: string,
  signatories: { name: string; email: string }[]
): Promise<ActionResult>
```

### Issue Actions (`src/actions/issues.ts`)

```typescript
'use server'

export async function createIssue(formData: FormData): Promise<ActionResult<{ id: string }>>
// Fields: title, description, category, priority, assigned_to, sla_deadline

export async function updateIssueStatus(
  issueId: string,
  status: IssueStatus,
  resolution?: string
): Promise<ActionResult>

export async function escalateIssue(issueId: string): Promise<ActionResult>
// Increments escalation_level
// If escalation_level >= 2, auto-assign to Arvind (Legal Admin)
```

### Compliance Actions (`src/actions/compliance.ts`)

```typescript
'use server'

export async function createDeadline(formData: FormData): Promise<ActionResult<{ id: string }>>
export async function markDeadlineComplete(deadlineId: string): Promise<ActionResult>
export async function snoozeDeadline(deadlineId: string, newDate: Date): Promise<ActionResult>
```

### ESOP Actions (`src/actions/esop.ts`)

```typescript
'use server'

export async function createGrant(formData: FormData): Promise<ActionResult<{ id: string }>>
// Auto-generates VestingEvent records based on vesting_type and schedule

export async function recordVesting(eventId: string): Promise<ActionResult>
// Marks VestingEvent as VESTED, updates ESOPGrant.vested_shares

export async function triggerClawback(
  grantId: string,
  reason: string,
  sharesToForfeit: number
): Promise<ActionResult>
// Creates forfeited VestingEvents, updates grant
```

### Policy Actions (`src/actions/policies.ts`)

```typescript
'use server'

export async function createPolicy(formData: FormData): Promise<ActionResult<{ id: string }>>
export async function recordAcknowledgment(policyId: string): Promise<ActionResult>
// Uses session.userId to record who acknowledged
export async function sendAcknowledgmentReminders(policyId: string): Promise<ActionResult>
```

### Tracker Actions (`src/actions/tracker.ts`)

```typescript
'use server'

export async function updateTrackerStatus(
  itemId: string,
  status: TrackerStatus
): Promise<ActionResult>

export async function updateTrackerAssignment(
  itemId: string,
  assignedTo: string
): Promise<ActionResult>

export async function addTrackerNote(
  itemId: string,
  note: string
): Promise<ActionResult>
```

### AI Generation (`src/actions/generate.ts`)

```typescript
'use server'

import Anthropic from '@anthropic-ai/sdk'

export async function generateContract(
  templateId: string,
  variables: Record<string, string>,
  entity: string
): Promise<ActionResult<{ generatedText: string }>> {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  const template = await prisma.contractTemplate.findUnique({ where: { id: templateId } })
  if (!template) return { success: false, error: 'Template not found' }

  const client = new Anthropic()

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are a legal document drafting assistant for League Sports Co (LSC), a sports holding company based in Dubai, UAE. Generate professional legal documents based on templates. Use the provided template structure and fill in the variables. Maintain formal legal language. All monetary values default to AED unless specified otherwise.`,
    messages: [{
      role: 'user',
      content: `Generate a ${template.category} contract using this template:\n\n${template.content}\n\nVariables:\n${JSON.stringify(variables, null, 2)}\n\nEntity: ${entity}`
    }]
  })

  // Extract text from response
  const generatedText = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')

  // Increment usage count
  await prisma.contractTemplate.update({
    where: { id: templateId },
    data: { usage_count: { increment: 1 } }
  })

  return { success: true, data: { generatedText } }
}

// Save generated contract as a draft document
export async function saveGeneratedDraft(
  title: string,
  generatedText: string,
  templateId: string,
  entity: string,
  parties: { name: string; role: string; email: string }[]
): Promise<ActionResult<{ documentId: string }>>
```

---

## Route Handlers (API Endpoints)

Route handlers are used for:
1. External API access (future finance module integration)
2. Streaming AI responses
3. Webhook receivers

### GET/POST `/api/legal/documents/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  // Authenticate via session cookie or API key header
  const searchParams = request.nextUrl.searchParams
  const category = searchParams.get('category')
  const status = searchParams.get('status')
  const entity = searchParams.get('entity')

  const documents = await prisma.legalDocument.findMany({
    where: {
      ...(category && { category }),
      ...(status && { lifecycle_status: status }),
      ...(entity && { entity }),
    },
    orderBy: { updated_at: 'desc' },
  })

  return Response.json({ data: documents })
}

export async function POST(request: NextRequest) {
  // Create document via API (for finance module integration)
  const body = await request.json()
  // Validate, create, return
}
```

### POST `/api/legal/documents/[id]/transition/route.ts`

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { toStatus, notes } = await request.json()
  // Validate transition, update, return
}
```

### GET `/api/legal/tracker/route.ts`

```typescript
export async function GET(request: NextRequest) {
  const items = await prisma.trackerItem.findMany({
    orderBy: [{ priority: 'asc' }, { created_at: 'asc' }]
  })
  return Response.json({ data: items })
}
```

### POST `/api/legal/generate/route.ts`

```typescript
// For streaming AI responses (if needed)
export async function POST(request: NextRequest) {
  // ... setup Anthropic client with streaming
  // Return ReadableStream
}
```

---

## Type Definitions

```typescript
// src/lib/types.ts

export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface SessionPayload {
  userId: string
  email: string
  role: UserRole
  fullName: string
  exp: number
}
```

---

## Error Handling

```typescript
// In server actions:
try {
  // ... prisma operations
  revalidatePath('/legal/documents')
  return { success: true, data: result }
} catch (error) {
  console.error('Action failed:', error)
  return { success: false, error: 'Operation failed. Please try again.' }
}
```

Never expose internal error details to the client. Log the full error server-side.

## Revalidation Paths

After mutations, revalidate the relevant paths:
- Document CRUD → `revalidatePath('/legal/documents')` + `revalidatePath('/legal')`
- Signature updates → `revalidatePath('/legal/signatures')` + `revalidatePath('/legal')`
- Issue changes → `revalidatePath('/legal/issues')` + `revalidatePath('/legal')`
- Tracker updates → `revalidatePath('/legal/tracker')`
- Compliance → `revalidatePath('/legal/compliance')` + `revalidatePath('/legal')`
- ESOP → `revalidatePath('/legal/esop')`
- Policies → `revalidatePath('/legal/policies')`
