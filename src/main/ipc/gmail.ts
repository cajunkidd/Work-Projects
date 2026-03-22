import { ipcMain, shell } from 'electron'
import { google } from 'googleapis'
import { getDb } from '../database'
import type { IpcResponse } from '../../shared/types'

// NOTE: Replace with your actual Google OAuth credentials from Google Cloud Console
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID'
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET'
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'

function getOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

function getSavedToken(): Record<string, string> | null {
  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = 'gmail_token'").get() as any
  return row ? JSON.parse(row.value) : null
}

function saveToken(token: Record<string, string>): void {
  getDb()
    .prepare(
      "INSERT INTO app_settings (key, value) VALUES ('gmail_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(JSON.stringify(token))
}

export function registerGmailHandlers(): void {
  // Get auth URL for user to visit
  ipcMain.handle('gmail:getAuthUrl', async (): Promise<IpcResponse<string>> => {
    try {
      const auth = getOAuthClient()
      const url = auth.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/gmail.readonly'],
        prompt: 'consent'
      })
      return { success: true, data: url }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Exchange code for token
  ipcMain.handle('gmail:connect', async (_e, code: string): Promise<IpcResponse<string>> => {
    try {
      const auth = getOAuthClient()
      const { tokens } = await auth.getToken(code)
      saveToken(tokens as Record<string, string>)

      // Get user email
      auth.setCredentials(tokens)
      const gmail = google.gmail({ version: 'v1', auth })
      const profile = await gmail.users.getProfile({ userId: 'me' })
      const email = profile.data.emailAddress || ''

      const db = getDb()
      db.prepare(
        "INSERT INTO app_settings (key, value) VALUES ('gmail_connected', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'"
      ).run()
      db.prepare(
        "INSERT INTO app_settings (key, value) VALUES ('gmail_email', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run(email)

      return { success: true, data: email }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Disconnect Gmail
  ipcMain.handle('gmail:disconnect', async (): Promise<IpcResponse<void>> => {
    try {
      const db = getDb()
      db.prepare("DELETE FROM app_settings WHERE key IN ('gmail_token','gmail_connected','gmail_email')").run()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Poll inbox for vendor invoice emails
  ipcMain.handle('gmail:poll', async (): Promise<IpcResponse<number>> => {
    try {
      const token = getSavedToken()
      if (!token) return { success: false, error: 'Gmail not connected' }

      const auth = getOAuthClient()
      auth.setCredentials(token)

      const gmail = google.gmail({ version: 'v1', auth })
      const db = getDb()

      // Get vendor names from contracts
      const vendors = db
        .prepare("SELECT DISTINCT vendor_name FROM contracts WHERE status != 'expired'")
        .all() as { vendor_name: string }[]

      if (vendors.length === 0) return { success: true, data: 0 }

      const vendorQuery = vendors.map((v) => `from:${v.vendor_name}`).join(' OR ')
      const query = `(invoice OR billing OR payment OR receipt) (${vendorQuery})`

      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50
      })

      const messages = listRes.data.messages || []
      let imported = 0

      for (const msg of messages) {
        if (!msg.id) continue

        // Check if already imported
        const exists = db.prepare('SELECT id FROM invoices WHERE gmail_message_id = ?').get(msg.id)
        if (exists) continue

        // Fetch message details
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date']
        })

        const headers = detail.data.payload?.headers || []
        const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)'
        const from = headers.find((h) => h.name === 'From')?.value || ''
        const dateStr = headers.find((h) => h.name === 'Date')?.value || new Date().toISOString()

        // Try to extract amount from snippet
        const snippet = detail.data.snippet || ''
        const amountMatch = snippet.match(/\$[\d,]+\.?\d*/)?.[0]
        const amount = amountMatch ? parseFloat(amountMatch.replace(/[$,]/g, '')) : 0

        // Try to match to a contract
        const matchedContract = vendors.find(
          (v) =>
            subject.toLowerCase().includes(v.vendor_name.toLowerCase()) ||
            from.toLowerCase().includes(v.vendor_name.toLowerCase())
        )
        const contract = matchedContract
          ? (db
              .prepare("SELECT id, monthly_cost FROM contracts WHERE vendor_name = ? AND status != 'expired'")
              .get(matchedContract.vendor_name) as any)
          : null

        const receivedDate = new Date(dateStr).toISOString().split('T')[0]

        db.prepare(
          `INSERT OR IGNORE INTO invoices
           (contract_id, gmail_message_id, subject, sender, amount, budgeted_amount, received_date)
           VALUES (?,?,?,?,?,?,?)`
        ).run(
          contract?.id || null,
          msg.id,
          subject,
          from,
          amount,
          contract?.monthly_cost || 0,
          receivedDate
        )
        imported++
      }

      return { success: true, data: imported }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Open auth URL in default browser
  ipcMain.handle('gmail:openUrl', async (_e, url: string): Promise<IpcResponse<void>> => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
