# Legal Tracker Channel Notifier

Aditya Mishra must be notified in the legal tracker channel every time an agreement is sent out for
signature. The notice is built by `src/lib/legal-tracker-payloads.ts` and delivered by
`src/lib/legal-tracker.ts`.

Two triggers fire it, both from inside `after()` so the channel is never in the critical path:

| Trigger | Event type | Entity |
| --- | --- | --- |
| `createOpenSignSignatureRequest` in `src/actions/opensign.ts`, once the signature request is committed | `agreement.sent` | `LegalDocument` |
| `transitionRedline` in `src/actions/redlines.ts`, when a redline moves to `SENT_TO_COUNTERPARTY` | `redline.sent` | `Redline` |

Only the `agreement.sent` path mirrors its outcome onto the document row, because only that path has a
`LegalDocument` to mirror onto. Both paths write a `CrossModuleEvent`.

The channel platform is not fixed yet, so the transport carries three real drivers plus an off switch.
Pick one with `LEGAL_TRACKER_CHANNEL_PROVIDER`.

## Two values you must supply by hand

Nothing in this repo knows Aditya Mishra's Slack member id or his email address, and nothing may
hardcode them.

- `LEGAL_TRACKER_MENTION` must be filled in with his real Slack member id (or Google Chat user id) in
  mention form. It is inserted verbatim, so it has to be a complete mention token.
- `LEGAL_TRACKER_EMAIL_TO` must be filled in with his real email address when the mailgun driver is
  used.

Both are environment variables set in Vercel. If they are blank the notice still goes out, but nobody
is pinged, which defeats the purpose.

## Env vars

| Var | Used by | Notes |
| --- | --- | --- |
| `LEGAL_TRACKER_NOTIFY_ENABLED` | release gate only | Set to `1` to make the release gate assert the vars below. It does not switch the notifier on or off; the provider does that. |
| `LEGAL_TRACKER_CHANNEL_PROVIDER` | all | `slack`, `google_chat`, `mailgun`, or `none`. Unset means auto-detect. Any other value fails closed to `none`. |
| `LEGAL_TRACKER_SLACK_BOT_TOKEN` | slack | Bot token, starts `xoxb-`. |
| `LEGAL_TRACKER_SLACK_CHANNEL` | slack | Channel id such as `C01ABCDEFGH`, or `#legal-tracker`. |
| `LEGAL_TRACKER_WEBHOOK_URL` | slack fallback, google_chat | Slack incoming webhook URL, or the Google Chat space webhook URL. |
| `LEGAL_TRACKER_MENTION` | slack, google_chat | Opaque mention string, used verbatim. Slack: `<@U01ABCDEF>`. Google Chat: `<users/123456789>`. Leave empty for mailgun. |
| `LEGAL_TRACKER_EMAIL_TO` | mailgun | Recipient address. A comma-separated list is accepted. |
| `MAILGUN_DOMAIN` | mailgun | Sending domain, for example `mg.leaguesportsco.com`. |
| `MAILGUN_API_KEY` | mailgun | Private API key. Used as the password with `api` as the user. |
| `MAILGUN_SENDER` | mailgun | From address. |
| `NEXT_PUBLIC_APP_URL` | link building | Base URL for the `/legal/documents/<id>` deep link. Falls back to `VERCEL_PROJECT_PRODUCTION_URL`, then to `https://lsc-legal-dashboard.vercel.app`. |

Auto-detect, used only when `LEGAL_TRACKER_CHANNEL_PROVIDER` is unset: a Slack bot token or a webhook
URL selects `slack`; otherwise complete Mailgun credentials select `mailgun`; otherwise `none`.

## Driver: slack (preferred)

With `LEGAL_TRACKER_SLACK_BOT_TOKEN` and `LEGAL_TRACKER_SLACK_CHANNEL` set, the notifier POSTs Block
Kit blocks to `https://slack.com/api/chat.postMessage` with `Authorization: Bearer <token>`. Slack
answers HTTP 200 with `{ "ok": false, "error": "..." }` on failure, so the response body is parsed and
the status code alone is never trusted.

If the bot token or the channel is missing but `LEGAL_TRACKER_WEBHOOK_URL` is set, the same blocks go
to that incoming webhook instead. Incoming webhooks cannot mention a user reliably in every workspace,
and they answer with the plain string `ok`, so prefer the bot token.

Getting a bot token:

1. Go to <https://api.slack.com/apps> and click Create New App, From scratch, and pick the LSC
   workspace.
2. Open OAuth & Permissions, and under Bot Token Scopes add `chat:write`. That single scope is enough
   to post. Add `chat:write.public` only if you want the bot to post in a public channel it has not
   been invited to.
3. Click Install to Workspace and approve. Copy the Bot User OAuth Token (`xoxb-...`) into
   `LEGAL_TRACKER_SLACK_BOT_TOKEN`.
4. In Slack, invite the bot to the tracker channel: `/invite @<app name>`. A bot that is not a member
   of a private channel gets `not_in_channel` back.

Getting the channel id for `LEGAL_TRACKER_SLACK_CHANNEL`: open the channel in Slack, click the channel
name, and scroll to the bottom of the About tab; the id (`C...`) is shown there with a copy button. The
`#name` form also works but breaks if the channel is renamed.

Getting Aditya's member id for `LEGAL_TRACKER_MENTION`: in Slack, open his profile, click the three-dot
menu, and choose Copy member ID. It looks like `U01ABCDEF`. Store it as a full mention token,
`<@U01ABCDEF>`, because the value is inserted into the message verbatim.

## Driver: google_chat

Set `LEGAL_TRACKER_CHANNEL_PROVIDER=google_chat` and point `LEGAL_TRACKER_WEBHOOK_URL` at a Google Chat
space webhook: open the space, Space settings, Apps and integrations, Webhooks, Add webhook, then copy
the URL. The notifier POSTs a `cardsV2` payload; the mention rides in the plain `text` field because
Google Chat only notifies a user when the mention appears there and not inside a card. The mention
format is `<users/123456789>`, where the numeric id comes from the Admin console user record or the
Directory API. Google Chat reports failures with a non-2xx status.

## Driver: mailgun (fallback)

Set `LEGAL_TRACKER_CHANNEL_PROVIDER=mailgun` when no chat channel exists yet. The notifier POSTs
`application/x-www-form-urlencoded` to `https://api.mailgun.net/v3/<MAILGUN_DOMAIN>/messages` with HTTP
Basic auth, user `api` and password `MAILGUN_API_KEY`, from `MAILGUN_SENDER`, to
`LEGAL_TRACKER_EMAIL_TO`. This is the same Mailgun account OpenSign uses for signature emails, so the
domain and key are usually already provisioned; only `LEGAL_TRACKER_EMAIL_TO` is new.

## Driver: none

`LEGAL_TRACKER_CHANNEL_PROVIDER=none`, an unrecognized provider value, or no credentials at all means
no network call is made. `notifyLegalTracker` returns `{ ok: false, provider: "none", error }`, the
attempt is still recorded, and the document row is marked `failed`. Signature sending is unaffected.

## Durability and where failures show up

The notifier never throws and never blocks. It runs in `after()`, after the signature transaction has
committed.

1. A `CrossModuleEvent` row is written before the post: `source` `legal_tracker`, `event_type`
   `agreement.sent` or `redline.sent`, `entity_type` `LegalDocument` or `Redline`, `entity_id` that
   row's id, `payload` the message.
2. After the attempt the row is updated with `processed` and a `_last_attempt` block holding the driver
   name and the error.
3. For `agreement.sent` the outcome is also mirrored onto the document: `last_tracker_notified_at`,
   `tracker_notify_status` (`sent` or `failed`), `last_tracker_notify_error`.

No cron replays `source = "legal_tracker"`. `/api/cron/finance-resync` only retries `source = "legal"`,
so a failed notification is durable but is never retried and never resent on its own. Undelivered rows
do appear in the Outbound Queue Failures panel on `/legal/ops-monitor`, which selects both `legal` and
`legal_tracker`. To dig further, query the queue directly:

```sql
select id, entity_id, created_at, payload -> '_last_attempt' as last_attempt
from "CrossModuleEvent"
where source = 'legal_tracker' and processed = false
order by created_at desc;

select id, title, tracker_notify_status, last_tracker_notify_error, last_tracker_notified_at
from "LegalDocument"
where tracker_notify_status = 'failed'
order by last_tracker_notified_at desc;
```

## Verify end to end

1. Set the env vars for the chosen driver in Vercel Production and Preview, plus
   `LEGAL_TRACKER_NOTIFY_ENABLED=1` so the gate enforces them.
2. Run the gate locally with the same values:

```bash
npm run release:gate
RELEASE_GATE_STRICT_ENV=1 npm run release:gate
```

3. Deploy, then open a document that has a file and at least one pending signatory, and send it for
   signature.
4. Confirm the tracker channel received a message titled `Agreement sent for signature: <title>` that
   names the document, entity, category, counterparty, signers, sender, and value, mentions Aditya, and
   links to `/legal/documents/<id>`.
5. Confirm the document row now shows `tracker_notify_status = 'sent'` and a fresh
   `last_tracker_notified_at`.
6. To rehearse a failure, set `LEGAL_TRACKER_SLACK_CHANNEL` to a channel the bot is not in, send again,
   and confirm the signature send still succeeds while the document row records
   `tracker_notify_status = 'failed'` with `not_in_channel` in `last_tracker_notify_error`.
