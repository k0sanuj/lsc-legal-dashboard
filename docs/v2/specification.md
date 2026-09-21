# Legal OS v2 specification and source audit

Prepared 21 September 2026 against `319dfd9`. This is a source audit and design
brief, not proof of live services, database contents or deployment health.
No production, mailbox, Drive permissions or real document contents were read
or changed during this preparation.

## Requirements and current state

| Workstream | Source-confirmed current state | Required result |
| --- | --- | --- |
| Repositories | `prisma/schema.prisma:325,402,588` has documents/versions and text-only templates. `src/actions/templates.ts:287` does not preserve the uploaded source artifact. `src/actions/generate.ts:143` puts drafted content in notes. | Explicit template/populated/signed artifact lineage, preserved files, signer and deliverable scope, completed-signature evidence. |
| Signed files | `src/lib/opensign-sync.ts:63` stores completed PDFs as versions and updates the main file. | Keep signed bytes and completion certificates traceable to the exact populated artifact. |
| Backup layers | `src/lib/s3.ts:1` uses GCS despite its name. Drive import/comment scripts read from Drive. No download-all or finalized-template publication path was found. | Final-only Drive publication plus monthly manual document export with manifest, completeness and receipt. Separately verify actual recovery coverage. |
| Currency | `src/app/legal/documents/page.tsx:25,191` omits currency from its selected data and formats AED. `src/app/legal/agreements/page.tsx:86,116,188` combines values over only the first 100 results without currency conversion. | Native agreement amounts, sourced USD reference, USD reporting default, useful currency filter and totals independent of pagination. |
| Entity records | `prisma/schema.prisma:12,623,660` contains an entity enum, partial registration and office models. No entity profile, annual-report registry, registered-agent model or ownership graph. | Sourced entity identity/filings, agent/office and shareholding records, with graph and table driven by one source. |
| KYC | Existing entity-linked records, files, expiry/verification and analysis are in `prisma/schema.prisma:890`; standalone route uses entity filtering. | Relocate under Entities while preserving IDs, analysis, permissions and old deep links. |
| Review schedules | Deadline recurrence and check timestamps exist; scheduled compliance scan runs on days 1 and 15 in `vercel.json`. | Explicit 14-day public-document cadence in the initial six-calendar-month window, completion evidence and separate internal policy schedules. Days 1 and 15 are not a 14-day interval. |
| Dependency triggers | Tracker/checklist dependency arrays exist, but no document-change trigger engine or Arvind source table was found. | Import the supplied correlation table, validate cycles/references and create deduplicated review tasks with provenance. |
| Policies | `prisma/schema.prisma:775` has files, categories, versions and acknowledgements. | Separate internal Policies & Procedures, including record retention, with per-policy 4/5/6-month review interval and history. |
| Disputes | `prisma/schema.prisma:934` already has court/tribunal, plaintiff, defendant and estimated liability. | Add dispute and claim types, separate trackers and forum-appropriate terms. Review legacy classification instead of guessing. |
| Finance exposure | `src/actions/litigation.ts:32` inserts `litigation_exposure_created` using a helper that only queues. `src/lib/finance-webhook.ts:19` and the resync whitelist do not deliver that event. | Receiver-supported, precise, idempotent delivery for exposure create/update/closure. Queue insertion and receiver acceptance are different states. |
| Generation | `src/actions/generate.ts` directly calls Anthropic/Gemini APIs; no pause gate or CLI worker was found. | Server-enforced pause, isolated Claude CLI jobs and attributable review gates before activation. |
| Slack | `/legal` status/signatures/find and `/mnda` exist. Find queries the platform database, not connected drives. | Shared service operations through Slack, scoped Drive retrieval, requests and measurable operation coverage. |
| Access | Document listings and file delivery accept any session in `src/app/legal/documents/page.tsx:44` and `src/app/api/documents/[id]/file/route.ts:15`. Navigation roles do not establish record entitlements. | Four supplied global-access principals with an audited scoped-request model, enforced in every server read/download/mutation and retrieval channel. |
| Naming | `src/lib/agents/agreement-analyzer-agent.ts:156` uses full enum category, truncated uppercase counterparty, YYYYMMDD and `_v1.pdf`. Approval only changes a log in `src/actions/file-naming.ts:7`. | Approved arena/category lexicons, full counterparty, DDMMMYYYY, initials and real extension; publish only finals and distinguish proposal/approval/application. |
| Mailboxes | `CompanyEmail` is inventory. `src/lib/gmail.ts` is service-account read/watch support. | Human Workspace access to legal@ for AK and Arvind, separately verified. |

## Data and workflow rules

### Documents, exports and naming

Use explicit artifact stages; do not infer a signed artifact solely from its
filename or a generic lifecycle status. Link source template version, populated
artifact, signer/deliverable scope and executed artifact. Keep internal history
and original bytes. Existing `parent_doc_id` represents addenda, so do not reuse
it for template lineage.

Exports run against an authorized snapshot and include record metadata, all
in-scope artifacts, safe unique archive paths, hashes, errors and timestamp.
Report inaccessible historical AWS URLs and absent template source files.
Completeness must compare the expected inventory with the actual archive.
Track a monthly manual download/check as an operator action, not an unattended
claim of backup success. Do not schedule a personal reminder without a separate
request. Verify restore scope separately, including Postgres and OpenSign data.

Store the org-wide naming lexicon as controlled data. Do not truncate names or
invent arena mappings. Sanitize unsafe path characters with an approved rule
that preserves the full semantic counterparty name. Define same-day collisions,
source date and owner initials before renaming. No bulk Drive deletion or
organization-wide rollout is authorized merely by approving a filename.

### Currency and dispute exposure

Use a canonical native amount and currency, plus explicit conversion source,
rate timestamp and reporting date policy. Maintain Decimal values and serialize
decimal strings, never floating-point amounts across boundaries. A missing
amount or FX rate remains unknown. USD figures must be derived on the server;
exclude unavailable conversions from totals and expose the incomplete coverage.

The legacy `contract_value_usd`, `currency_code`, `value` and `currency` fields
have overlapping semantics. `src/lib/finance-payloads.ts:31` sends a USD-named
value with a separately editable currency. Audit/migrate the actual data only
after approval for the target database; do not silently reinterpret it.

Dispute exposure is not an invoice or settled amount. Finance must agree the
event schema and accounting treatment before acceptance can be called working.
Record case ID, source amount/currency, exposure basis, as-of date, change/closure
and delivery receipt. Use `emitFinanceEvent()` and its existing retry mechanism.

### Compliance and entities

Keep legal entity identity, arena code and sport/property as distinct concepts.
The current enum includes LSC/TBR/FSP/XTZ/XTE; the naming codes supplied for v2
are FSP/WBL/WPS/TLC/TBRC/TBR. No mapping between those sets has been supplied.
Shareholding edges need entity/owner identity, stake and evidence with effective
dates. Unconfirmed percentages and dates remain null.

KYC relocation must retain verification and analysis history. Enforce the same
document entitlement policy for entity and matter attachments. Existing
compliance filters and hardcoded three-entity audit coverage need adjustment
when using the entity registry; do not claim the filter already scopes results.

Track review due dates separately from completion. Each review records owner,
basis, evidence and completion time. Public initial cadence is exactly 14 days,
not twice a calendar month. Define the starting event before calculating dates.
Do not invent a steady-state cadence after six months. Internal policy owners
select an interval of 4, 5 or 6 months. Arvind's table supplies dependency rules.

### Claude and guardrails

The requested change targets in-platform generation and refinement first.
Existing extraction/compliance agents and deterministic MNDA generation are
separate workloads. Do not silently migrate all AI providers or pause signing.

Use an isolated worker and durable job state. Inputs include authenticated actor,
matter facts, approved source template/version, jurisdiction and currency. Output
includes model/runtime provenance, prompt/skill version and a draft hash.
Cancellation, timeouts, limits and malformed output are explicit failures.

After drafting, independent substantive review and structural clause checking
run in parallel on the same immutable draft. Persist findings against its hash.
Edits invalidate prior review. Check schedules, clause numbers, defined terms,
party consistency and unfilled facts. Fairness guidance requires reciprocal and
proportionate terms, preserving approved language unless legal approves a change.
Reusable skills, approved company policy and matter-specific exceptions remain
separate. Test that a negotiated exception in one matter does not leak into another.

Official documentation checked 21 September 2026:

- [Programmatic Claude Code](https://code.claude.com/docs/en/headless) supports
  `claude -p` and structured output. Bare mode skips normal subscription login
  and much project discovery, so it does not satisfy this subscription workflow.
- [Authentication](https://code.claude.com/docs/en/authentication) documents
  credential precedence. Verify the worker does not inherit an API key that
  silently changes billing.
- [Hosted use and credential rules](https://code.claude.com/docs/en/legal-and-compliance)
  permit an unmodified hosted CLI with each end user signing in through their own
  official flow, subject to applicable terms. Do not pool Free/Pro/Max credentials
  across users, collect session tokens into the dashboard, or promise unlimited
  subscription capacity. Confirm per-user authentication or an explicit Anthropic
  arrangement before activating a shared service.

### Access, Slack and mailboxes

The confirmed access identifiers are legal@futureofsports.io,
ak@futureofsports.io, arvind@futureofsports.io and adi@futureofsports.io.
Confirm their actual Workspace/app identity types and Slack IDs. If legal@ is a
mailbox/group, preserve the individual human actor in logs and do not assume it
represents an additional person. This planning record provisions nothing.

Centralize entitlement checks and scoped grants, including expiry/revocation.
Do not leak file titles/snippets before access is established. Drive service
identity permissions are a ceiling, not permission for every app user. Preserve
Slack signature/replay checks and current active-user checks. New Slack operations
call the same authorized services used by the dashboard.

Measure the 90% target against an agreed operation inventory and test suite.
Copilot is not yet identified as Microsoft 365 Copilot or another environment;
do not claim a connector exists. Confirm approved Drive/folder inventory.

Mailbox provisioning is a separate Workspace administration task. Intended
mailbox: legal@futureofsports.io. Recipients: ak@futureofsports.io and
arvind@futureofsports.io. Confirm mailbox/delegation mode, then verify the actual
recipient experience. Existing service-account access is not human delegation.

## Inputs still needed before dependent implementation

- Selected mock direction, A/B/C. All requested capabilities remain in scope.
- Approved category lexicon, arena mappings, filename date basis, owner initials
  and collision/final-publication rules.
- Drive destinations and allowed sources; Copilot environment.
- Source registration, shareholding and annual-report data; Arvind's dependency
  table; review start event, post-six-month cadence and per-policy intervals.
- Verified FX source/date policy and agreed Finance exposure receiver contract.
- Claude plan/organization, worker host and authentication arrangement.
- Workspace account types, Slack IDs and mailbox delegation mode. Email addresses
  are supplied above and should not be requested again.

The calendar follow-up was explicitly removed from scope. No calendar request
or recurring automation should be created from these meeting notes.

## Design handoff

Three static options share the existing near-black, white-text and blue-accent
token language. A is a register with context; B starts from entities; C starts
from Slack requests and legal decisions. All values are placeholders or unknowns.
Operational actions are disabled. The website is independent from the dashboard,
with no data connections. Publication is owner-private.

Wait for a direction before editing application UI, as requested in Anuj's
project instructions. Then execute one `PLAN.md` task per run and PR.
