# Entities, reviews and disputes runtime

This document records implementation and executed verification. It does not certify real company data, a Finance receiver, or live cron execution.

## Entity registry and KYC

`/legal/compliance/entities` holds sourced legal names, jurisdictions, registration numbers, incorporation dates, registered agents and registered offices. Profiles can reference an existing entity enum only after an operator confirms that mapping. Arena file codes are separate from company identity. Existing compliance registration records and unlinked KYC records are shown as awaiting mapping, with links to their original records. No names, registration numbers or ownership stakes are inferred.

Profiles support registration, annual report, registered agent appointment and office agreement filings, with due/filed dates and source evidence. The shareholding diagram and table use the same recorded relationships. Ownership writes reject self-ownership, duplicate owners, circular entity relationships and known stakes exceeding 100 percent. Unknown stakes remain unknown.

KYC is located at `/legal/compliance/entities/kyc`. The old `/legal/kyc` address redirects while preserving filters. Linking KYC retains the original record ID, expiry, file and verifier data. Moving a verified record to another status preserves its existing verifier and verification timestamp. Files stream through an authenticated managed-storage route; arbitrary external URLs are not fetched.

## Review occurrences and dependency changes

Public schedules require a document, confirmed start date, owner and source reference. They create review occurrences every 14 days from the start through the first six calendar months. A later monthly cadence is optional and must be supplied explicitly; no later cadence is invented. Internal schedules require a policy and an explicitly selected four-, five- or six-month interval. Calendar-month calculations remain anchored to the original day and clamp at month end.

`/api/cron/document-reviews` is protected by the existing cron authentication and should be invoked daily by the release owner's scheduler. It backfills missed occurrences and creates the next future occurrence. A deterministic task key makes repeated cron/manual calls idempotent. Cron never marks a review complete. Completion requires evidence and retains the first completed actor, timestamp and evidence.

Dependency imports accept a JSON list of source and target schedule IDs plus a supplied source reference. Validation rejects missing schedules, self-links and cycles. The actual Arvind correlation table must be supplied and mapped; no sample rules are loaded as business data. Document and internal policy changes call separate durable hooks with stable file/version references. Replaying one change does not duplicate dependent tasks. A manual source-change action supports changes originating outside the application. Paused sources or targets do not emit new dependency tasks.

File/version uploads, policy file changes and lifecycle transitions run their dependency hooks inside the same database transaction as the source mutation. A trigger failure rolls back the source mutation, rather than leaving an untracked change. Extraction and optional analysis run after commit and cannot turn an already saved upload into a failed receipt.

## Litigation, arbitration and Finance

`/legal/litigation` and `/legal/arbitration` are separate registers. Existing matters remain `UNCLASSIFIED` until a legal operator chooses the tracker. Matters retain their IDs, attachments and history. Claim type, court/tribunal, claimant/plaintiff, defendant/respondent, exposure amount, currency, basis and as-of date are editable. Null exposure means unknown; zero is an explicit recorded amount. Exposure is stored as Decimal and serialized as a decimal string. Totals run on the server using sourced FX and show unavailable coverage.

Matter mutations append history and a `dispute.exposure.updated` outbox event in the same database transaction. Exposure edits use an expected revision to reject stale writes. Closing a matter emits a new revision without silently zeroing the recorded exposure. Repeating an unchanged status produces no new event.

The Finance receiver contract must be confirmed before `FINANCE_DISPUTE_CONTRACT_VERSION=1` is configured. Until then, the durable outbox and matter display `pending_contract`. A configured sender marks an event accepted only for a successful response containing `{ "accepted": true, "eventId": "<same event ID>" }`. The receiver must deduplicate event IDs and apply monotonically increasing matter revisions; retries can arrive out of order. The existing Finance resync cron retries unprocessed dispute events and updates a matter's delivery indicator only for its current revision. Queuing an event is not proof of Finance receipt.

## Access and verification

Registry, KYC, review and dispute actions/pages use the central global-document identity check. Mutations additionally require the refreshed legal, operations or platform administrator role. Scoped document grants do not grant access to these global registers. Matter and KYC attachments have separate authenticated download routes.

Protected byte responses use attachment disposition, sandbox CSP, `nosniff` and private `no-store` headers through `file-response.ts`. This also applies to policies, document versions, artifacts, Drive fetches and exports. Uploaded HTML/SVG must never become active content at the application origin. Attachment headers preserve the original response bytes for the PDF editor's authenticated fetch.

`entity-record-service.ts` and `review-schedule-service.ts` expose the same validated operations to an explicit authenticated session for Slack. Dashboard actions are thin cookie-session adapters. Entity profiles, filings and shareholdings support updates by existing record ID; no Slack-specific database mutation bypasses the shared validation. Policy bodies remain readable in the register, and uploaded policies stream through the same authenticated managed-storage boundary.

Executed on 21 September 2026:

- `npx tsx scripts/verify-entities-reviews-disputes.ts`: month-end/leap-day anchors, 14-day and missed review dates, invalid rules/dates, dependency validation, exact decimal/null/zero boundaries and payload serialization.
- `node scripts/verify-dispute-finance.mjs`: actual sender with in-memory outbox and synthetic receiver; HMAC, exact money, configuration gate, receipt-ID validation, failure retention and accepted-event replay.
- `python3 /tmp/legal-v2-test-runtime.py npx tsx scripts/verify-entity-review-dispute-integration.ts`: isolated verification database only; entity/KYC links, retained verification metadata, idempotent public/internal dependency changes, completion evidence, database/outbox precision, stale revisions and closure state. Synthetic fixtures are removed.
- The same isolated test also exercises the session-explicit entity profile, filing, ownership create/update, internal policy, review schedule and dependency import services used by Slack. A focused in-memory policy-download route check verified 401/403 before metadata reads, 404 for missing sources and the authorized stream path.
- `node scripts/verify-upload-atomicity.mjs`: actual action callbacks with injected artifact, version, lifecycle and review-trigger failures; confirmed transaction rollback and honest saved-success despite optional extraction/scheduling failures. The isolated database test separately verifies both review hooks roll back with the source mutation.
- `node scripts/verify-protected-file-responses.mjs`: actual eight protected route handlers with synthetic active HTML, confirming protective headers, unchanged bytes, denial before storage and retained PDF-fetch behavior.

The release owner records the full integrated gate, migrations, scheduler deployment and production acceptance separately. Real entity/ownership evidence, the dependency table, individual review owners/start dates, and Finance receiver acceptance remain external inputs.
