# Legal OS v2

Updated: 21 September 2026. Baseline: `319dfd9`.

This plan implements Anuj's v2 meeting requirements. Detailed boundaries and
source findings are in [docs/v2/specification.md](docs/v2/specification.md).
Decisions are in [docs/decisions.md](docs/decisions.md).

## Execution rule

Complete exactly one unchecked task per run, verify before checking it off, and
commit each completed task separately. One task per PR. Do not begin a UI task
until Anuj selects the published static direction. The first task changes only
planning documents and standalone mocks, not application behavior.

For implementation, read the installed Next.js guide relevant to the change.
Run focused checks plus `npm run release:gate` before opening a real PR. Agent,
webhook, cron and Finance work also follows `.claude/skills/agentic-flows.md`.
Every multi-agent round ends with independent adversarial verification and fixes.
Production changes, live database work and daily-driver build channels remain
outside this preparation pass.

## Tasks in dependency order

- [x] V2-01: Record the specification, audit current paths, publish three static mock directions, and stop for a selection. Verify page links, explicit placeholders, disabled external actions, responsive layouts and independent review. Store the publication URL and verification evidence in `docs/v2/verification.md`.
- [x] V2-02: Pause AI generation and refinement on the server with an honest UI state. Direct requests must invoke no provider while paused. Keep deterministic MNDA/template sending separate. Verified in the isolated checkout; see `docs/v2/generation-pause-verification.md`. Not deployed.
- [ ] V2-03: Enforce one document-access policy for the four confirmed access principals, with scoped requests/grants for others. Cover listing, search, details, file streaming, versions, KYC/litigation attachments, export and Slack. Verify a fifth user cannot retrieve content, titles or snippets without a grant. Preserve individual audit attribution for shared-mailbox delegates.
- [ ] V2-04: Establish canonical native-currency amounts, sourced FX, USD reporting and currency filtering. Use server-side Decimal calculations and decimal strings at boundaries. Verify mixed currencies, null versus zero, unavailable FX, filtering and totals beyond pagination. Coordinate Finance payload semantics before changing existing money fields.
- [ ] V2-05: Implement the approved organization-wide filename lexicon and deterministic formatter. Use arena, three-letter category, full counterparty, agreed date, owner initials and actual extension. Remove version suffixes from published names, retain internal history, and distinguish proposed, approved and applied names. Do not bulk-rename existing shared files in this task.
- [ ] V2-06: Add explicit template, populated-per-signer/deliverable and signed artifact lineage. Preserve original template files, completed PDFs, certificates and internal versions. Do not repurpose the existing addendum parent link. Verify retries and unsigned artifacts cannot masquerade as signed documents.
- [ ] V2-07: Add scoped download-all document export and monthly manual completion tracking. Include all three repositories, manifest, hashes, snapshot timestamp, missing-file report, expiry and durable completion receipt. Large exports must not depend on a single web request. Verify partial export is never marked complete. Clearly separate document export from full system recovery.
- [ ] V2-08: Publish finalized artifacts to approved Google Drive destinations with final-only rules, receipt, source version and idempotent retries. Verify drafts are excluded, inaccessible legacy files are reported, signed bytes are preserved and existing internal versions remain intact. Runtime Drive access remains pending until tested in the selected environment.
- [ ] V2-09: Add legal entity profiles, registrations, annual reports, registered-agent and office records, plus sourced shareholding relationships. Keep arena codes separate from legal entities. Verify graph/table consistency, preserved existing links, unknown values, invalid edges and ownership validation.
- [ ] V2-10: Move KYC into Compliance > Entities using existing records/files/analysis. Preserve deep links with redirects and filters; verify upload, expiry, verification and server-side access control. Reuse the single application shell and navigation source.
- [ ] V2-11: Implement public-document reviews every 14 days for the first six calendar months and separate internal Policies & Procedures with a per-policy 4, 5 or 6 month interval. Track owner, due date, evidence and completion. Verify calendar boundaries, missed reviews and retry idempotency. Post-six-month public cadence remains unset until supplied.
- [ ] V2-12: Import Arvind's correlation/dependency table as review triggers with source provenance. Verify missing references, cycles, duplicate imports and one task per triggering change. Do not fabricate dependencies while the source table is absent.
- [ ] V2-13: Split Litigation and Arbitration trackers on a shared matter foundation. Add claim type and dispute kind, reuse existing court/tribunal and party fields, and use precise native-currency exposure. Keep existing unclassified matters visible for review. Verify tracker separation, edits, unknown exposure and permissions.
- [ ] V2-14: Deliver dispute exposure to Finance through the durable sender with an agreed receiver contract, idempotency and retries. Cover creation, changes and closure. Validate decimal/currency payloads and queue-versus-delivery states with a mocked receiver. Live acceptance requires explicit runtime authorization and receiver evidence.
- [ ] V2-15: Build an isolated Claude CLI generation worker with durable jobs, official per-user authentication, limits, cancellation and attributable outputs. Prove authentication and loaded skills in the actual nonproduction worker, without silent API fallback or copied browser/session tokens. Confirm eligible plan, host and authentication arrangement first.
- [ ] V2-16: Add versioned fair-counterparty drafting guardrails, independent review and clause cross-reference checking in parallel after drafting. Bind checks to the exact draft hash; editing invalidates old approvals. Test missing schedules, dangling references, undefined terms, inconsistent parties and matter-context leakage. Activate generation only after worker and review gates pass.
- [ ] V2-17: Add permission-aware cross-drive retrieval and document-access requests through Slack; identify the intended Copilot environment before integration. Verify denials reveal no metadata, grants/revocation apply across surfaces, and source file/version evidence accompanies results.
- [ ] V2-18: Expand Slack operation coverage through shared application services. Define the operation inventory and denominator before claiming 90% coverage. Include review completion, entity/KYC updates, dispute updates, generation job status and backup status; preserve signature/replay protections and audit receipts.
- [ ] V2-19: Provision and verify human mailbox access to `legal@futureofsports.io` for `ak@futureofsports.io` and `arvind@futureofsports.io` using Google Workspace administration. Confirm mailbox type and delegation mode before the change. Verify each recipient can use the intended mailbox; a Gmail watch or application login is not proof.

## Selected direction

On 21 September 2026, Anuj selected a mix of B and C: an entity-centered dashboard
with Slack-led operations and an exception/review workspace. The design-selection
gate is satisfied. Keep one shared shell and navigation; entity records, KYC,
compliance and ownership form the dashboard foundation, while Slack handles the
routine operations. A is not the selected foundation.

The calendar follow-up was explicitly removed from scope by Anuj on
21 September 2026. Do not create an event, reminder or automation for it.
