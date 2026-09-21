# Codex generation worker

The latest user instruction replaces Claude generation with Codex CLI using
Anuj's ChatGPT login on an isolated GCP VM. The app never receives that login's
credentials. The worker owner and each job requester are distinct audit fields.
Only currently active users permitted by the app's central document policy and
the worker's explicit requester allowlist can submit jobs.

Complete official `codex login --device-auth` on the worker as its dedicated OS
user. Do not copy a desktop token into the application. Keep the CLI profile on
private persistent storage. Verify `codex login status` reports ChatGPT in that
runtime. API key and access-token environments are stripped. Every inference
also sets `forced_login_method="chatgpt"`; there is no API or Claude fallback.

Run the worker with Node.js and `tsx`:

```
npx tsx ops/generation-worker/run.ts
```

Worker configuration:

- `LEGAL_APP_ORIGIN`: app HTTPS origin.
- `LEGAL_GENERATION_WORKER_ID`: operator-issued safe identifier.
- `LEGAL_GENERATION_WORKER_TOKEN`: app-issued secret, at least 32 random characters.
- `LEGAL_GENERATION_OWNER_EMAIL`: confirmed worker owner's active app account.
- Optional `LEGAL_GENERATION_MODEL`: exact verified model. When omitted, the CLI
  default is used and audit metadata explicitly records `CLI_DEFAULT`.
- Optional `CODEX_BIN`, official `CODEX_HOME`, and `LEGAL_GENERATION_STATE_DIR`.

The app's secret `LEGAL_GENERATION_WORKERS` is an object keyed by worker ID. Each
entry has `token`, `ownerEmail`, and `actorEmails`, the explicitly authorized
requester emails. Do not commit populated secrets. `GENERATION_ENABLED=1` enables
queueing only when an authorized worker has fresh verified readiness. Leave it
unset until actual login, isolated inference and app protocol are proven.

Each invocation checks official CLI authentication. A synthetic inference receipt
is cached per UTC date, owner, CLI version, model and skill hash. Idle polls do
not consume inference quota. The app validates a maximum 24-hour proof age and
records that timestamp separately from authentication heartbeat freshness.

Use a single-instance service or a scheduler with an exclusive process lock.
Invoke at least once per minute for two-minute readiness. A run claims at most
one durable job. Leases last 15 minutes. Failed jobs need a new explicit request.
Cancellation is checked every five seconds, and cancelled or expired jobs reject
late completions. Stage processes time out after four minutes and are force
terminated if needed. Retry of uncertain external work is never automatic.

Each inference uses a clean temporary directory, ignores user config and rules,
disables project instructions, uses a read-only sandbox, disables shell, apps,
plugins, subagents, image and web tools, and clears MCP configuration. It rejects
unexpected tool events in JSONL output. Drafting and the two parallel reviews use
three independent sessions. The checked-in skills are explicitly supplied as
developer instructions. Content hashes bind both reviews to the exact draft and
skill version; saving requires a fresh legal editor's approval.

Verification:

```
node scripts/verify-generation-pause.mjs
node scripts/verify-v2-generation-slack.mjs
node scripts/verify-generation-worker.mjs
```

These use controlled boundaries or a local fake CLI. They prove wrapper behavior,
not a live login, deployed acceptance or correct legal advice. Runtime activation
requires actual VM evidence and a complete synthetic request/review/save flow.
Existing document analysis uses its existing providers; this replacement concerns
contract drafting/refinement.

Official references: [authentication](https://learn.chatgpt.com/docs/auth),
[non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode),
and [configuration](https://learn.chatgpt.com/docs/config-file/config-reference).

Slack identities use current `users.info` profile email and active app accounts.
`SLACK_LEGAL_ADMINS` is not an authority. Explicitly approved legacy email links
use `SLACK_LEGAL_IDENTITY_LINKS`, keyed by Slack ID with `verifiedEmail` and
`appEmail`. Every call compares the current Slack email before applying a link.

`/legal coverage` inventories 18 workflows, 17 with command implementations.
Conditional integrations still need live credentials, configuration and receipts.
The 90% real-operation completion target requires measured acceptance. Mailbox
and account administration remains an operator workflow. Copilot remains
unconnected until its product, tenant and authorization boundary are confirmed.
