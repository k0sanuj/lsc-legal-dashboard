/** Run by a Workspace administrator. Gmail delegation is separate from app or watch access. */
import { gmail_v1 } from 'googleapis/build/src/apis/gmail/v1'
import { JWT } from 'google-auth-library'

const mailbox = 'legal@futureofsports.io'
const recipients = ['ak@futureofsports.io', 'arvind@futureofsports.io']

async function main() {
  const encoded = process.env.GOOGLE_WORKSPACE_DELEGATION_SERVICE_ACCOUNT_JSON
  if (!encoded) throw new Error('Set GOOGLE_WORKSPACE_DELEGATION_SERVICE_ACCOUNT_JSON in the administrator environment, never in chat or source control.')
  if (process.env.LEGAL_MAILBOX_TYPE !== 'USER') throw new Error('Confirm legal@futureofsports.io is a user mailbox by setting LEGAL_MAILBOX_TYPE=USER. Google Groups use group membership, not Gmail delegation.')
  const credentials: unknown = JSON.parse(encoded)
  if (!credentials || typeof credentials !== 'object' || !('client_email' in credentials) || !('private_key' in credentials) || typeof credentials.client_email !== 'string' || typeof credentials.private_key !== 'string') throw new Error('A domain-wide delegated service account is required.')
  const auth = new JWT({ email: credentials.client_email, key: credentials.private_key, subject: mailbox, scopes: ['https://www.googleapis.com/auth/gmail.settings.sharing'] })
  const gmail = new gmail_v1.Gmail({ auth })
  const before = await gmail.users.settings.delegates.list({ userId: mailbox })
  for (const email of recipients) {
    const existing = before.data.delegates?.find(item => item.delegateEmail === email)
    if (existing?.verificationStatus === 'accepted') continue
    if (existing) throw new Error(`Existing delegation for ${email} has status ${existing.verificationStatus}; inspect before changing it.`)
    if (process.argv.includes('--apply')) await gmail.users.settings.delegates.create({ userId: mailbox, requestBody: { delegateEmail: email } })
  }
  const after = await gmail.users.settings.delegates.list({ userId: mailbox })
  const results = recipients.map(email => ({ email, status: after.data.delegates?.find(item => item.delegateEmail === email)?.verificationStatus ?? 'not provisioned' }))
  console.log(JSON.stringify({ mailbox, applied: process.argv.includes('--apply'), checkedAt: new Date().toISOString(), results, humanMailboxOpen: 'requires recipient verification' }, null, 2))
  if (process.argv.includes('--apply') && results.some(result => result.status !== 'accepted')) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/ya29\.[A-Za-z0-9_-]+/g, '[redacted]') : 'Mailbox provisioning failed'); process.exitCode = 1 })
