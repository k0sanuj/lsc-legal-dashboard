# Page Specifications — LSC Legal Dashboard

Every page is a Server Component unless explicitly marked as Client. Data fetching happens in the page via Prisma queries. Interactive parts are extracted into Client Components.

---

## 1. Command Center (`/legal/page.tsx`)

**Purpose**: Dashboard landing — operational snapshot of all legal activity.

**Layout**: 4-column stat grid at top, then 2-column layout below.

**Sections**:
1. **Stat Cards** (4 across):
   - Total Active Documents (count where status in ACTIVE/SIGNED/EXPIRING)
   - Pending Signatures (count SignatureRequests where status != SIGNED)
   - Expiring in 30 Days (count documents with expiry_date within 30 days)
   - Open Issues (count LegalIssues where status in OPEN/IN_PROGRESS/ESCALATED)

2. **Document Status Distribution** (left column):
   - Recharts donut chart showing count per lifecycle_status
   - Color-coded per design system lifecycle colors
   - Click a segment to navigate to `/legal/documents?status=X`

3. **Signature Pipeline** (right column):
   - Mini Kanban: 4 columns showing count + top 3 items each
   - Link to full `/legal/signatures` page

4. **Upcoming Expirations** (left column):
   - Table: document title, entity, value, days until expiry
   - Sorted by urgency (expiring soonest first)
   - Color-coded rows by urgency tier

5. **Compliance Alerts** (right column):
   - List of overdue + upcoming (next 14 days) compliance deadlines
   - Status badges with countdown
   - Link to `/legal/compliance`

6. **Recent Activity** (full width):
   - Feed of last 20 lifecycle events, issue updates, signature changes
   - Timestamp, actor, action, document link

---

## 2. Documents (`/legal/documents/page.tsx`)

**Purpose**: Searchable repository of all legal documents.

**URL Params**: `q`, `category`, `status`, `entity`, `owner`

**Layout**:
1. **Filter Bar** (Client Component):
   - Search input (text search on title)
   - Category multi-select (DocumentCategory enum)
   - Status multi-select (LifecycleStatus enum)
   - Entity select (Entity enum)
   - Owner select (from AppUser list)
   - Clear filters button

2. **Results Table** (shadcn Table):
   - Columns: Title (link), Category (badge), Status (lifecycle badge), Entity, Value (formatted AED), Owner, Expiry Date, Updated
   - Sortable by: title, value, expiry_date, updated_at
   - Pagination (20 per page)

3. **Quick Actions**:
   - Create New Document button (opens dialog or navigates to creation form)
   - Export filtered results

---

## 3. Document Detail (`/legal/documents/[id]/page.tsx`)

**Purpose**: Full view of a single document with lifecycle management.

**Params**: `id` (from URL, note: in Next.js 16, params is a Promise — `const { id } = await params`)

**Layout**:
1. **Header Section**:
   - Title, lifecycle badge, entity badge
   - Parties list
   - Value (AED formatted, JetBrains Mono)
   - Action buttons: Transition Status, Upload Version, Create Addendum

2. **Lifecycle Timeline** (Client Component):
   - Visual horizontal progression: all states from DRAFT to ACTIVE
   - Current state highlighted
   - Past states show date + who transitioned
   - Click transition button shows modal with: target status (only valid next states), notes textarea

3. **Tabs** (shadcn Tabs):
   - **Versions**: Table of DocumentVersions (version number, file link, change summary, date, uploader)
   - **Signatures**: SignatureRequest list (name, email, status, sent date, signed date, reminders sent)
   - **Financials**: Linked payment cycles, contract value, finance sync status
   - **Email Threads**: Linked EmailThread records
   - **Audit Trail**: All LifecycleEvents for this document

4. **Addenda Section** (if parent_doc_id exists or has addenda):
   - Shows parent document link
   - Lists child addenda documents

---

## 4. Signatures (`/legal/signatures/page.tsx`)

**Purpose**: Kanban board for signature tracking.

**Layout**: 4-column Kanban (Client Component with @dnd-kit)

**Columns**:
| Column | Status | Color | Description |
|--------|--------|-------|-------------|
| Getting Signed | PENDING | amber-500 | Documents prepared, not yet sent |
| Being Signed | SENT | blue-500 | Sent to signatories, awaiting |
| Signed | SIGNED | emerald-500 | All parties signed |
| Stalled | STALLED | rose-500 | Blocked/delayed |

**Cards show**: Document title, parties, days in current status, document value, entity badge

**Interactions**:
- Drag between columns → server action updates SignatureRequest status
- Click card → navigate to document detail
- "Send Reminder" button on SENT cards
- "Mark Stalled" quick action

---

## 5. AI Generator (`/legal/generate/page.tsx`)

**Purpose**: Generate contract drafts using Claude AI.

**Layout** (Client Component — needs form state):
1. **Template Selection**:
   - Dropdown of active ContractTemplates
   - On select: show template description + required variables

2. **Variable Input Form**:
   - Dynamically generated from template's `variables` JSON
   - Field types: text, number, date, select, textarea
   - Entity selector
   - Parties input (add multiple)

3. **Generation Controls**:
   - "Generate Draft" button → calls server action
   - Loading state with streaming indicator
   - AI disclaimer notice

4. **Preview Panel**:
   - Rendered contract text
   - "Save as Draft" button → creates LegalDocument in DRAFT status
   - "Regenerate" button
   - "Edit" toggle → inline editing of generated text

---

## 6. Templates (`/legal/templates/page.tsx`)

**Purpose**: Template library management.

**Layout**:
1. **Grid View** (default) / **List View** toggle
2. **Filters**: category, entity, search

**Template Card**:
- Name, category badge, entity badge
- Version number
- Usage count
- Last used date
- "Preview" button (opens dialog)
- "Use" button (navigates to `/legal/generate` with template pre-selected)

**Admin Actions** (LEGAL_ADMIN+ only):
- Create new template
- Edit template (opens form with content editor + variables builder)
- Version management

---

## 7. Expirations (`/legal/expirations/page.tsx`)

**Purpose**: Visibility into upcoming contract expirations with financial impact.

**Layout**:
1. **View Toggle**: Timeline / Pipeline

2. **Timeline View** (Recharts):
   - X-axis: months (next 12)
   - Y-axis: count of expiring documents
   - Stacked bars by entity
   - Hover shows document names

3. **Pipeline View** (Table):
   - Sorted by: (value / days_until_expiry) — highest urgency first
   - Columns: Document, Entity, Value, Expiry Date, Days Remaining, Financial Impact
   - Color-coded urgency: 14d (red), 30d (amber), 60d (yellow), 90d (blue)
   - Renewal action button per row

4. **Alert Summary**:
   - Count of documents expiring in 14/30/60/90 days
   - Total value at risk per tier

---

## 8. Compliance (`/legal/compliance/page.tsx`)

**Purpose**: Regulatory deadline management across jurisdictions.

**Layout**:
1. **Jurisdiction Tabs**: UAE | US/Delaware | Global

2. **Calendar Grid** (Client Component):
   - Month view (default) / Quarter view toggle
   - Deadline dots on dates, color-coded by status
   - Click date → shows deadline details in side panel

3. **Upcoming Deadlines List**:
   - Sorted by date
   - Status badge, jurisdiction badge, category
   - Linked document (if any)
   - "Mark Complete" action

4. **Overdue Alert Section** (top, if any exist):
   - Red banner with count of overdue items
   - Expandable list of overdue deadlines

---

## 9. ESOP Contracts (`/legal/esop/page.tsx`)

**Purpose**: ESOP grant management, vesting visualization, clawback tracking.

**Layout**:
1. **Pool Summary Cards**:
   - Total Pool | Granted | Vested | Exercised | Forfeited | Remaining
   - Utilization gauge (% allocated)

2. **Grants Table**:
   - Employee, Grant Date, Total Shares, Vested %, Exercise Price, Vesting Type, Status
   - Click row → expand with vesting schedule detail

3. **Vesting Timeline** (Recharts):
   - Area chart showing cumulative vested shares over time
   - Per-employee lines or stacked

4. **JP Deal 50-50 Section** (if applicable):
   - Dedicated tracking for joint partnership equity splits
   - Separate vesting visualization

5. **Clawback Panel**:
   - Configured triggers per grant
   - Trigger event log

---

## 10. Policies (`/legal/policies/page.tsx`)

**Purpose**: Company policy repository with version control and acknowledgment tracking.

**Layout**:
1. **Policy List Table**:
   - Title, Category, Version, Effective Date, Acknowledgment Rate (progress bar)
   - Status: "Current" | "Superseded" badge

2. **Acknowledgment Dashboard**:
   - Overall rate (% of required acknowledgments completed)
   - Outstanding acknowledgments list (who hasn't acknowledged what)
   - "Send Reminder" bulk action

3. **Policy Detail** (expand or dialog):
   - Full text / file link
   - Version history
   - Acknowledgment list (name, date, or "Pending")

---

## 11. Issues (`/legal/issues/page.tsx`)

**Purpose**: Internal legal support ticket system.

**Layout**:
1. **Filter Bar**: category, priority, status, assignee
2. **Issues Table**:
   - Title, Category badge, Priority badge, Status badge, Assignee, SLA Countdown
   - SLA badge shows time remaining (green > 50%, amber 25-50%, red < 25%, pulsing if overdue)
3. **Create Issue** button → dialog form
4. **Issue Detail** (expand or navigate):
   - Full description, resolution notes
   - Activity timeline (status changes, assignments, escalations)
   - Auto-escalation indicator (shows when it will escalate to Arvind)

---

## 12. Tracker (`/legal/tracker/page.tsx`)

**Purpose**: Master 85+ item legal tracker with priorities and dependencies.

**Layout**:
1. **View Toggle**: Board (Kanban) / Table / Dependencies

2. **Board View** (Kanban by priority):
   - 4 columns: Critical / High / Medium / Low
   - Cards: ref_code, title, status badge, category badge, assigned_to
   - Card count per column in header

3. **Table View**:
   - All columns: Ref, Title, Category, Priority, Status, Assigned, Dependencies, Due Date
   - Category filter tabs: Platform | Vaunt | Key Agreements | Corporate | Payments | IP | Gig/Marketing
   - Search by title or ref_code

4. **Dependency View** (Client Component):
   - Visual graph showing dependency chains
   - Blocked items highlighted in red
   - Click item → shows what it blocks and what blocks it

---

## 13. Payment Cycles (`/legal/payment-cycles/page.tsx`)

**Purpose**: Payment terms standardization and finance module sync.

**Layout**:
1. **Summary Stats**: Total Cycles | Active | Overdue | Synced with Finance (%)
2. **Payment Cycles Table**:
   - Document link, Terms (net-30/net-60/milestone/custom), Amount, Status, Finance Sync indicator
   - Status badges: upcoming (blue), active (green), overdue (red with pulse), completed (muted)
3. **Standardization Report**:
   - Breakdown of terms used across documents
   - Non-standard terms flagged
4. **Finance Integration Panel**:
   - Sync status per cycle
   - Last sync timestamp
   - "Sync Now" action (placeholder until finance integration is live)

---

## Server Action Patterns

All mutations go through server actions in `src/actions/`:

```typescript
'use server'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function createDocument(formData: FormData) {
  const session = await requireRole(['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'])

  const doc = await prisma.legalDocument.create({
    data: {
      title: formData.get('title') as string,
      category: formData.get('category') as DocumentCategory,
      entity: formData.get('entity') as Entity,
      lifecycle_status: 'DRAFT',
      owner_id: session.userId,
      // ... other fields
    }
  })

  revalidatePath('/legal/documents')
  return { success: true, id: doc.id }
}
```

## Next.js 16 Notes
- `params` in page components is a Promise — always `await params`
- Server Components are default — add `'use client'` only when needed
- Use `revalidatePath` after mutations to refresh server component data
- Route handlers use `NextRequest`/`NextResponse` or standard `Request`/`Response`
