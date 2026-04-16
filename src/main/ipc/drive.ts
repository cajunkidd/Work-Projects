import { ipcMain } from 'electron'
import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { getDb } from '../database'
import type { IpcResponse } from '../../shared/types'

// Reuse the same OAuth client credentials as Gmail — single Google Cloud project.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID'
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET'
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'

// Narrow scope: can only touch files the app itself creates. Avoids the
// sensitive `drive.readonly` scope (which would require Google verification).
const SCOPES = ['https://www.googleapis.com/auth/drive.file']

function getOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

function getSavedToken(): Record<string, string> | null {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE key = 'drive_token'")
    .get() as { value: string } | undefined
  return row ? JSON.parse(row.value) : null
}

function saveToken(token: Record<string, string>): void {
  getDb()
    .prepare(
      "INSERT INTO app_settings (key, value) VALUES ('drive_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(JSON.stringify(token))
}

function getSetting(key: string): string {
  const row = getDb()
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? ''
}

/**
 * Build an authenticated Drive v3 client for the current user, or throw with a
 * caller-friendly message if Drive isn't connected / folder isn't set.
 * Also wires a listener to persist refreshed access tokens back to the DB.
 */
function getDriveClient() {
  const token = getSavedToken()
  if (!token) {
    throw new Error('Google Drive not connected — open Settings to connect.')
  }
  const auth = getOAuthClient()
  auth.setCredentials(token)
  // Persist refreshed access tokens; merge with the saved refresh_token since
  // the refresh event only carries the new access_token/expiry.
  auth.on('tokens', (t) => {
    const merged = { ...token, ...(t as Record<string, string>) }
    saveToken(merged)
  })
  return google.drive({ version: 'v3', auth })
}

/**
 * Upload a local file to the configured Shared Drive folder.
 * Exported for reuse by contracts / competitors / templates handlers.
 */
export async function uploadToDrive(
  localPath: string,
  filename: string
): Promise<{ fileId: string; webViewLink: string }> {
  const folderId = getSetting('drive_folder_id')
  if (!folderId) {
    throw new Error(
      'Google Drive not configured — contact your administrator to set the Shared Drive folder.'
    )
  }

  const drive = getDriveClient()
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId]
    },
    media: {
      body: fs.createReadStream(localPath)
    },
    supportsAllDrives: true,
    fields: 'id, webViewLink'
  })

  const fileId = res.data.id
  const webViewLink = res.data.webViewLink
  if (!fileId || !webViewLink) {
    throw new Error('Drive upload succeeded but response was missing fileId / webViewLink.')
  }
  return { fileId, webViewLink }
}

/**
 * Download a Drive file to a unique path under os.tmpdir().
 * Caller is responsible for unlinking the temp path when done.
 */
export async function downloadFromDriveToTemp(fileId: string): Promise<string> {
  const drive = getDriveClient()

  // Fetch the filename first so the temp file keeps the original extension;
  // Documenso and other consumers infer type from the extension.
  const meta = await drive.files.get({
    fileId,
    fields: 'name',
    supportsAllDrives: true
  })
  const originalName = meta.data.name || 'document'
  const ext = path.extname(originalName) || ''
  const tempName = `contract-${crypto.randomBytes(8).toString('hex')}${ext}`
  const tempPath = path.join(os.tmpdir(), tempName)

  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  )

  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(tempPath)
    ;(res.data as NodeJS.ReadableStream)
      .on('error', reject)
      .pipe(out)
      .on('error', reject)
      .on('finish', () => resolve())
  })

  return tempPath
}

export function registerDriveHandlers(): void {
  // ── OAuth: get auth URL for user to visit ─────────────────────────────────
  ipcMain.handle('drive:getAuthUrl', async (): Promise<IpcResponse<string>> => {
    try {
      const auth = getOAuthClient()
      const url = auth.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
      })
      return { success: true, data: url }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── OAuth: exchange pasted code for token, capture email ──────────────────
  ipcMain.handle('drive:connect', async (_e, code: string): Promise<IpcResponse<string>> => {
    try {
      const auth = getOAuthClient()
      const { tokens } = await auth.getToken(code)
      saveToken(tokens as Record<string, string>)

      auth.setCredentials(tokens)
      const drive = google.drive({ version: 'v3', auth })
      const about = await drive.about.get({ fields: 'user' })
      const email = about.data.user?.emailAddress || ''

      const db = getDb()
      db.prepare(
        "INSERT INTO app_settings (key, value) VALUES ('drive_connected', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'"
      ).run()
      db.prepare(
        "INSERT INTO app_settings (key, value) VALUES ('drive_email', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run(email)

      return { success: true, data: email }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Disconnect: forget tokens but keep the configured folder ID ──────────
  ipcMain.handle('drive:disconnect', async (): Promise<IpcResponse<void>> => {
    try {
      getDb()
        .prepare(
          "DELETE FROM app_settings WHERE key IN ('drive_token','drive_connected','drive_email')"
        )
        .run()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Status: connection + folder config for the Settings UI ────────────────
  ipcMain.handle(
    'drive:status',
    async (): Promise<IpcResponse<{ connected: boolean; email: string; folderId: string }>> => {
      try {
        return {
          success: true,
          data: {
            connected: getSetting('drive_connected') === 'true',
            email: getSetting('drive_email'),
            folderId: getSetting('drive_folder_id')
          }
        }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ── Save the Shared Drive folder ID (admin pastes from Drive URL) ────────
  ipcMain.handle(
    'drive:saveFolder',
    async (_e, folderId: string): Promise<IpcResponse<void>> => {
      try {
        getDb()
          .prepare(
            "INSERT INTO app_settings (key, value) VALUES ('drive_folder_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
          )
          .run(folderId.trim())
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
