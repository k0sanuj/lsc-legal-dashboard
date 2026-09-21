# Product decisions

## 21 September 2026: Legal OS v2

Status: product requirements accepted from Anuj. V2-02 is implemented locally;
remaining implementation is tracked in `PLAN.md`. This log does not assert that
any change or external integration is live.

1. Maintain three linked document repositories: finalized source templates,
   populated documents per signer/deliverables, and completed signed versions.
   Internal version history remains available. Only final versions are published
   into the shared Drive.
2. Use GCP platform storage, Google Drive for finalized templates/artifacts and
   a monthly manual download-all as separate layers. A document archive does not
   establish database, object-store or OpenSign disaster recovery.
3. Report summary figures in USD by default. Display agreement values in their
   native currency with USD in brackets, using sourced FX. This supersedes the
   AED product default in `CLAUDE.md` for v2; the existing implementation still
   uses AED in places and must not be described as migrated yet.
4. Put entity registration, annual reports, registered agent/office, shareholding
   relationships and KYC under Compliance > Entities. Arena naming codes are not
   assumed to be incorporated legal entities.
5. Review public documents every 14 days during their first six months. Keep
   internal Policies & Procedures distinct with a configurable 4 to 6 month
   review interval. Arvind's source table supplies change/dependency triggers.
6. Separate Litigation and Arbitration trackers; include claim type, forum,
   parties and precise exposure feeding Finance. Preserve existing unknowns.
7. Pause the AI generator until the Claude CLI workflow and required reviews are
   ready. Subscription authentication must be verified at the worker. Fair
   counterparty clauses, independent review and cross-reference checks are
   required. Do not silently fall back to paid API calls.
8. Make the platform primarily operable from Slack, targeting 90% of an agreed
   operation inventory. Dashboard use is for occasional updates and inspection.
9. The four supplied global-access account identifiers are:
   `legal@futureofsports.io`, `ak@futureofsports.io`,
   `arvind@futureofsports.io`, `adi@futureofsports.io`.
   Other users request scoped access. Confirm whether `legal@` is a login,
   shared mailbox or group; do not invent a fourth human or use shared credentials
   to erase the acting person's identity. This record itself grants no access.
10. Provision the `legal@futureofsports.io` mailbox for AK and Arvind using their
    supplied work accounts. Google Workspace permissions are separate from app
    roles, service-account impersonation and Gmail watch configuration.
11. Organization-wide published filenames follow
    `Arena_CAT_FullCounterparty_DDMMMYYYY_Initials.ext`. Use the supplied arena
    codes FSP, WBL, WPS, TLC, TBRC and TBR. Category mappings, date semantics and
    owner initials require approved sources. No version suffix in shared names.
12. The proposed Thursday meeting was cancelled from this task's scope by Anuj.

## 21 September 2026: B and C selected

Anuj selected a mix of the entity-centered workspace (B) and Slack-led workflows
(C). The design-selection gate is satisfied. Use B for entity, ownership, KYC and
compliance context, with C for requests, routine operations and legal decisions.
Retain one shared shell and source of navigation. Do not use A as the foundation.

V2-02 pauses generation and refinement on the server before template reads,
usage-count writes or provider calls. Existing authorized draft saves, document
work and deterministic MNDA sending remain separate. This is a source-code
change, not evidence that production is paused. Reactivation requires the CLI
worker and review gates, not a provider environment-variable change.

## Implementation interpretations

- USD is the reporting default, not permission to relabel an unconverted native
  amount. The agreement-currency filter scopes included records; row amounts
  retain their native currency and USD reference.
- Shared-drive final-only rules do not authorize deleting internal history or
  existing shared files. Collision handling and the final-publication policy
  must be explicit before applying names organization-wide.
- Review timing needs a confirmed starting event and a post-six-month cadence.
- Claude CLI authentication follows each user's own official sign-in unless an
  explicit Anthropic arrangement permits another model. Current official
  references are linked in the specification.
