import { google } from 'googleapis'

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const DEFAULT_WATCH_MAILBOXES = [
  'legal@leaguesportsco.com',
  'tools@leaguesportsco.com',
  'anuj@leaguesportsco.com',
]

export interface GmailMessageSummary {
  id: string | null | undefined
  mailbox: string
  subject: string
  from: string
  date: string
  snippet: string
}

interface GmailPubSubData {
  emailAddress?: string
  historyId?: string
}

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is required for Gmail access')
  }
  return JSON.parse(raw)
}

function normalizeMailbox(mailbox: string) {
  return mailbox.trim().toLowerCase()
}

export function getWatchedMailboxes(): string[] {
  const configured = process.env.GMAIL_WATCH_MAILBOXES
  const mailboxes = configured
    ? configured.split(',').map(normalizeMailbox).filter(Boolean)
    : DEFAULT_WATCH_MAILBOXES

  return [...new Set(mailboxes)]
}

export function isWatchedMailbox(mailbox: string | null | undefined): mailbox is string {
  if (!mailbox) return false
  const normalized = normalizeMailbox(mailbox)
  return getWatchedMailboxes().includes(normalized)
}

function assertWatchedMailbox(mailbox: string): string {
  const normalized = normalizeMailbox(mailbox)
  if (!isWatchedMailbox(normalized)) {
    throw new Error(`Mailbox ${mailbox} is not in GMAIL_WATCH_MAILBOXES`)
  }
  return normalized
}

function getAuth(mailbox: string) {
  const credentials = getServiceAccountCredentials()
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [GMAIL_READONLY_SCOPE],
    subject: assertWatchedMailbox(mailbox),
  })
}

function getGmailClient(mailbox: string) {
  return google.gmail({ version: 'v1', auth: getAuth(mailbox) })
}

export function decodeGmailPubSubData(data: string): GmailPubSubData {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'))
}

export async function watchMailbox(mailbox: string) {
  const normalized = assertWatchedMailbox(mailbox)
  const gmail = getGmailClient(normalized)

  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/legal-inbox`,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'INCLUDE',
    },
  })

  return {
    mailbox: normalized,
    historyId: res.data.historyId ?? null,
    expiration: res.data.expiration ?? null,
  }
}

export async function watchInboxes() {
  const results = []
  for (const mailbox of getWatchedMailboxes()) {
    results.push(await watchMailbox(mailbox))
  }
  return results
}

export async function watchInbox() {
  return watchInboxes()
}

export async function getRecentMessages(
  mailbox: string,
  maxResults = 10
): Promise<GmailMessageSummary[]> {
  const normalized = assertWatchedMailbox(mailbox)
  const gmail = getGmailClient(normalized)

  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: 'is:unread',
  })

  const messages: GmailMessageSummary[] = []
  for (const msg of list.data.messages ?? []) {
    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id! })
    const headers = full.data.payload?.headers ?? []
    messages.push({
      id: msg.id,
      mailbox: normalized,
      subject: headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)',
      from: headers.find((h) => h.name === 'From')?.value ?? '',
      date: headers.find((h) => h.name === 'Date')?.value ?? '',
      snippet: full.data.snippet ?? '',
    })
  }
  return messages
}
