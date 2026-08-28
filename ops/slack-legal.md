# Slack legal control surface

`/legal` answers questions about legal operations; `/mnda` sends an MNDA for
signature from inside Slack. Both are restricted to three named admins. This
runbook covers creating the Slack app, wiring the env vars, and verifying the
whole path with a real send.

The control surface is separate from the legal tracker notifier
(ops/legal-tracker-channel.md). The notifier only posts; this surface also
receives slash commands and modal submissions, so it carries its own env vars.

## 1. Create the app from the manifest

1. Open https://api.slack.com/apps and choose Create New App, then
   "From a manifest".
2. Pick the League Sports Co workspace.
3. Paste the contents of `ops/slack-app-manifest.json` (JSON tab) and create
   the app. The manifest registers the bot user, the `/legal` and `/mnda`
   commands pointing at
   `https://lsc-legal-dashboard.vercel.app/api/slack/commands`, and
   interactivity pointing at
   `https://lsc-legal-dashboard.vercel.app/api/slack/interactivity`.
4. Install the app to the workspace (Install App in the sidebar). Approve the
   scopes: `commands`, `chat:write`, `chat:write.public`. Deliberately no `channels:manage`: nothing in the code creates channels, and a leaked bot token with that scope could rename or archive channels across the workspace.

Slack verifies the request URLs when commands are first used, not at manifest
creation, so the app can be created before the deploy is live.

## 2. Where each env value comes from

| Var | Source |
| --- | --- |
| `SLACK_SIGNING_SECRET` | App page, Basic Information, App Credentials, "Signing Secret". Verifies every inbound request. |
| `SLACK_BOT_TOKEN` | App page, OAuth & Permissions, "Bot User OAuth Token" (starts `xoxb-`). Appears after the install in step 1.4. |
| `SLACK_LEGAL_ADMINS` | Built by hand from member ids, format below. |
| `SLACK_LEGAL_CHANNEL_ID` | The `#legal` channel id (starts `C`), from the channel's "About" tab, bottom of the sheet ("Channel ID"), or from the URL when Slack is open in a browser. |
| `SLACK_LEGAL_ENABLED` | Set to `1` once the four vars above are in place; it makes the release gate require them. |

### Finding a member id for SLACK_LEGAL_ADMINS

In Slack, open the person's profile, click the three-dot menu, and choose
"Copy member ID". It looks like `U0123ABCDEF`. Do this for each of the three
admins. Then build the var as comma-separated `memberId:dashboardEmail` pairs:

```
SLACK_LEGAL_ADMINS="U0AAAAAAA:anuj@futureofsports.io,U0BBBBBBB:ak@futureofsports.io,U0CCCCCCC:adi@futureofsports.io"
```

Nothing in the repo hardcodes a member id; this var is the only mapping. The
email side must match the person's AppUser email in the dashboard exactly.

## 3. The #legal channel

Create a channel named `#legal` (or reuse an existing one) and note its channel
id for `SLACK_LEGAL_CHANNEL_ID`. Then either:

- `/invite @LSC Legal` in the channel, or
- `chat:write.public` covers public channels. A PRIVATE #legal channel requires inviting the bot with `/invite @LSC Legal`; no scope substitutes for the invite.

Inviting the bot explicitly is the reliable option, and it is required if the
channel is private. `SLACK_LEGAL_CHANNEL_ID` is the fallback destination for
MNDA outcome posts when the channel where `/mnda` was typed refuses the bot.

## 4. Set the vars in both deploy targets

Set all five vars in:

- Vercel: project `lsc-legal-dashboard`, Settings, Environment Variables,
  Production (and Preview if Slack should work on previews). Redeploy after.
- Cloud Run: the dashboard service in `fsp-legal-esign`, Edit & Deploy New
  Revision, Variables & Secrets. Keep both targets in sync; a request served by
  the target missing the vars fails signature verification and Slack shows a
  generic error.

Never commit these values; `.env*` stays untracked per AGENTS.md.

### Sharing the bot with the legal tracker notifier

The tracker notifier (src/lib/legal-tracker.ts) reads its own
`LEGAL_TRACKER_SLACK_BOT_TOKEN` and `LEGAL_TRACKER_SLACK_CHANNEL`. If this same
"LSC Legal" app is used for both, set `LEGAL_TRACKER_SLACK_BOT_TOKEN` to the
same `xoxb-` value as `SLACK_BOT_TOKEN` and `LEGAL_TRACKER_SLACK_CHANNEL` to
the same channel id as `SLACK_LEGAL_CHANNEL_ID`. The names stay separate on
purpose: if the control surface ever needs scopes the notifier should not
carry, the tokens can diverge without touching the notifier.

## 5. The authorisation model

Three people, fail closed:

1. Every request is verified against `SLACK_SIGNING_SECRET` (HMAC v0 signature
   over the raw body, 300 second replay window). A bad signature gets a bare
   401.
2. The caller's Slack member id must appear in `SLACK_LEGAL_ADMINS`. An empty
   or malformed var authorises nobody.
3. The mapped email must resolve to an active AppUser row in the dashboard.
   Deactivating the AppUser locks the person out of Slack commands and the
   dashboard in one move.

Anyone else who runs `/legal` or `/mnda` gets an ephemeral "not authorised"
message, and nothing runs. Modal submissions re-run the full check; passing
the slash command gate proves nothing about the submit.

## 6. What the commands do

`/legal` answers inline, ephemerally (only the caller sees it):

- `/legal` or `/legal status`: agreement counts by lifecycle status, open
  signature requests, open redlines, compliance items due in 30 days, blocked
  and in-progress tracker items, and the last 5 agreements sent.
- `/legal signatures`: every document awaiting signature with per-signer
  viewed and signed state and days pending.
- `/legal find <query>`: top 5 agreements matching title or counterparty.
- `/legal help` (or anything else): the command list.

`/mnda` opens a modal: template (individual or business), counterparty company
and address (business only), signer name and email, passport number
(individual only, optional), CC emails, term (1, 2, 3, or 5 years, default 2),
and agreement date (defaults to today in Asia/Dubai). Submit validates the
fields, closes the modal, generates the MNDA, sends it for signature via
OpenSign, and posts the outcome (success with a dashboard link, or the failure
reason) to the channel where `/mnda` was typed, falling back to
`SLACK_LEGAL_CHANNEL_ID`. CC recipients are emailed the completed document.

The MNDA send itself also needs the OpenSign and MNDA env
(`OPENSIGN_SIGNING_ENABLED=1` block plus `MNDA_FSP_SIGNER_NAME` /
`MNDA_FSP_SIGNER_EMAIL` overrides where the defaults from the source
agreements are wrong).

## 7. Verification checklist

1. `npm run lint && npm run build` green on the branch.
2. Deploy, then in Slack run `/legal help` as an authorised admin: the command
   list comes back ephemerally within a couple of seconds.
3. Run `/legal status`: real counts, and the dashboard deep links resolve.
4. Run `/legal` as someone NOT in `SLACK_LEGAL_ADMINS`: they get the
   ephemeral "not authorised" message and nothing else.
5. Run `/mnda`, submit with a bad CC entry (for example `not-an-email`): the
   modal shows the error against the CC field and stays open.
6. Real send: run `/mnda` with the individual template, your own personal
   email as signer, term 2 years, today's date. Confirm:
   - the modal closes immediately;
   - a success post lands in the channel with the document link;
   - the signature invitation email arrives at the signer address;
   - the document appears on /legal/signatures as awaiting signature;
   - the tracker channel notification fires (if the notifier is enabled).
7. Sign or void the test document in OpenSign so it does not linger in the
   in-flight list.
