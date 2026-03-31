import { google } from 'googleapis'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}')
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    clientOptions: { subject: 'legal@leaguesports.co' }, // impersonate the legal inbox
  })
}

export async function watchInbox() {
  const auth = getAuth()
  const gmail = google.gmail({ version: 'v1', auth })

  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/legal-inbox`,
      labelIds: ['INBOX'],
    },
  })
  return res.data
}

export async function getRecentMessages(maxResults = 10) {
  const auth = getAuth()
  const gmail = google.gmail({ version: 'v1', auth })

  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: 'is:unread',
  })

  const messages = []
  for (const msg of list.data.messages ?? []) {
    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id! })
    const headers = full.data.payload?.headers ?? []
    messages.push({
      id: msg.id,
      subject: headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)',
      from: headers.find((h) => h.name === 'From')?.value ?? '',
      date: headers.find((h) => h.name === 'Date')?.value ?? '',
      snippet: full.data.snippet ?? '',
    })
  }
  return messages
}
