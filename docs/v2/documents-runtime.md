# Document repositories, currency and export runtime

Implemented source paths: `src/lib/money.ts`, `fx-rates.ts`, `file-names.ts`,
`document-artifacts.ts`, `document-exports.ts`, `drive-documents.ts` and
`src/actions/repositories.ts`. This document describes implementation, not proof
that external permissions, a worker deployment or a particular export succeeded.

## Currency

`LegalDocument.value` and `currency` are the native agreement amount. Existing
values are not automatically relabeled or migrated. The older Finance-specific
fields retain their separate integration semantics. Summaries calculate USD on
the server across all authorized matching records, outside register pagination.
Decimal values stay decimal and serialize as strings. A private 128-digit
calculation context prevents the ORM Decimal default from rounding large native
amounts during aggregation. Inputs allow up to 35 integer and eight fractional
digits, inside the native database column bounds. Missing amounts or FX
quotes remain unknown and are counted separately from converted coverage.

`/legal/currencies` refreshes the dated European Central Bank XML reference feed
and records its source URL in `FxRate`. Quotes expire after seven calendar days.
The maintenance worker refreshes the feed when no successful refresh is recorded
in the preceding 24 hours. ECB does not publish AED. A legal member can record a
verified USD-per-native-unit quote with its HTTPS source and publication date.
No hardcoded AED peg, invented rate or silent fallback is used.

## Original artifacts and naming

`DocumentArtifact` preserves original bytes by GCS URL, SHA-256, parent document
or template, source artifact, signer/deliverable scope and explicit stage.
`recordArtifact` accepts an optional Prisma transaction client. Deterministic
artifact IDs include byte hash and source/signer/deliverable provenance, making
identical writes idempotent without relabeling a signing package. Signed artifacts require actual
signature completion evidence. OpenSign completion records the signed artifact,
document state and lifecycle event in one database transaction after file upload.
OpenSign binds its exact submitted populated artifact at send time. Completion
uses only that binding; legacy requests without it retain unknown lineage.
Completion, signer updates, version filing, review dependency triggers, lineage
and the Finance outbox event are committed behind a
compare-and-swap on the active provider ID and bound source. A concurrent resend
cannot receive an older request's signed state. Webhooks must match the exact
current provider binding and fetch provider truth before using this same path.
Sends claim the document before provider I/O; duplicate attempts stop before
creating external invitations. `PREPARING` means submission is in progress.
`SEND_UNCERTAIN` means the provider may have accepted it but its receipt or local
commit is unconfirmed. The lifecycle receipt records the claim and any returned
provider ID. An operator must reconcile that request before retrying; no automatic
resend risks duplicate invitations. A stale completion may leave an unreferenced
private upload, but cannot change the agreement's file, versions, signers or Finance.
A missing signed PDF leaves the document available for the signing poll to retry.

`/legal/repositories` displays template, populated, signed and certificate
artifacts, source links and hashes. Existing files are not guessed into stages.
Legacy text-only templates without source files remain explicit export gaps.
Certificates are separate artifacts only when an actual source file exists;
this release does not fabricate a certificate from an API status flag.

`/legal/file-naming` maintains legal-approved category codes. The supplied arena
codes are fixed independently from incorporated entity identity. Proposals use
full counterparties, confirmed dates/date basis, owner initials and the actual
source extension. Unsafe path characters and oversize names are rejected, not
silently truncated. Proposal, approval, finalization and Drive publication are
separate states. Conditional writes reject concurrent proposal/scope changes.
Existing history and source object names remain intact.

## Durable export and Drive worker

Run this command as a scheduled job, independently of web-request lifetime:

```sh
node_modules/.bin/tsx scripts/run-document-exports.ts
```

The job processes up to ten export candidates and ten Drive publication
candidates. Both queues use expiring leases and conditional claims. Interrupted
jobs are eligible for retry after the lease expires. Failed work retains an
error; operators can request a fresh export or choose "Retry Drive publication"
after resolving the recorded failure. Failed publication is not retried silently.

Required worker environment:

- `DATABASE_URL`, plus the usual Prisma configuration.
- `GCS_BUCKET_NAME`, `GCS_HMAC_ACCESS_ID`, `GCS_HMAC_SECRET` for private storage.
- `LEGAL_DRIVE_TEMPLATE_FOLDER_ID` for finalized template publication.
- `LEGAL_DRIVE_FINAL_FOLDER_ID` for finalized agreement publication. The two
  destinations are checked independently; templates never silently fall back to
  the final-agreement folder.
- `GOOGLE_SERVICE_ACCOUNT_JSON` or the runtime's Google Application Default
  Credentials, with access to the approved Drive destination.
- `LEGAL_DRIVE_SOURCE_FOLDER_IDS` is the comma-separated source inventory used
  by the separate Slack retrieval service.

No credentials or operational values are stored in this document.

Export request actions snapshot authorized document IDs and their file inventory.
Templates and uploaded KYC, matter, policy and audit files are included only for
global legal members. The worker checks current
access before reading and before releasing the archive. Downloads recheck grants
and requester identity. Revocation invalidates prior export access. Unsupported
legacy URLs, absent source files and changed hashes appear as manifest errors,
and partial exports never receive a complete receipt.

Archives are streamed through a temporary tar file, then gzip-compressed and
uploaded to private GCS. Members use safe identifier paths; `manifest.json`
preserves original filenames, stage, byte sizes and hashes. Workers enforce a
25 MiB per-source limit, a 512 MiB uncompressed tar budget with 16 MiB reserved
for its manifest, and at most 10,000 inventory entries. File limits are checked
while streaming even when no content length is supplied. Exceeded limits produce
explicit partial/failed receipts; they never become complete backups. These
budgets bound temporary tar, compressed archive and source buffers within the
2 GiB worker allocation. Local temporary files
are removed after success or failure. Download initiation and the operator's
manual verification are separate timestamps. The monthly indicator requires a
snapshot requested and manually verified in that UTC calendar month.

Application download access expires after 24 hours. Archive objects remain in
private GCS until an operator-approved bucket lifecycle or retention process
removes them. The current application expiry is not a promise of object deletion.
Document exports do not replace PostgreSQL or OpenSign disaster recovery.

Drive publication is queued only after finalization and filename approval.
Provider app properties bind file ID to artifact ID and hash for recovery after
a lost receipt. A different existing final file with the same name stops
publication for operator resolution. The worker preserves signed bytes and
records a Drive file ID only after a successful response or a matching provider
receipt. Missing destination or permission is a visible failure, not publication.

## Historical backfill

The release owner can first inspect a read-only inventory:

```sh
node_modules/.bin/tsx scripts/backfill-document-artifacts.ts --manifest /durable/path/artifact-dry-run.json
```

After verifying the selected runtime and recovery backup, apply it explicitly:

```sh
node_modules/.bin/tsx scripts/backfill-document-artifacts.ts --apply --manifest /durable/path/artifact-backfill.json
```

The script persists a local atomic JSON manifest and a private GCS report after
each processed source. It stops if report persistence fails. Deterministic artifact
IDs make reruns idempotent. GCS originals keep their exact source URLs and hashes.
An OpenSign-authored version plus recorded signature completion is required to
classify a historical signed file. A current file alone cannot prove it was the
signed source. Retired AWS URLs, missing bytes and oversize files remain explicit
gaps; nothing is downloaded from unapproved third-party origins.

Text-only templates produce `template-content-<id>.txt` in a content-addressed
GCS path. Provenance labels this as reconstructed UTF-8 database content, never
original formatting or a preserved binary. These artifacts are not finalized
by the backfill. The export manifest continues to report the missing original
template source even when reconstructed text is available. Before a backfill,
the repository also lists existing text-only templates so an empty artifact
index does not hide the saved template inventory.

## Executed focused verification

On 21 September 2026:

- `npx tsx scripts/verify-document-foundations.ts` passed exact money including
  values above JavaScript's safe integer limit, 20-plus-digit carry/cancellation,
  null/zero, 101-row totals, bounded file reads, reconstructed-text detection, sourced
  FX parsing, stale/missing quotes, full names, invalid dates/paths, and extraction
  of the real tar output using the system tar reader.
- `npx tsx scripts/verify-document-exports.ts` passed against the isolated
  verification database, with injected local storage I/O. It exercised denied
  access, scoped grants, artifact deduplication, unsigned rejection, actual archive
  manifest/hash, partial exports, oversized-file refusal, signer-provenance
  deduplication and revoked-download denial. Synthetic fixtures
  were removed. This does not establish live GCS or Drive acceptance.

- `node scripts/verify-opensign-concurrency.mjs` executes the actual modules
  with synthetic state and injected I/O. Before the fix, a controlled stale
  request completed a newer request. After the fix it passed outbox enqueue rollback, durable
  delivery-failure recovery, stale-request CAS,
  source binding, one version/Finance dispatch, duplicate-send prevention,
  uncertain-send blocking, stale-webhook denial and shared trusted reconciliation.

The integrated release gate and production acceptance are recorded separately by
the release owner. No external deployment claim is implied by these local tests.
