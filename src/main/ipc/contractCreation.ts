import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb } from '../database'
import type { IpcResponse, ContractTemplate, SigningRequest } from '../../shared/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSetting(key: string): string {
  const db = getDb()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? ''
}

function getDocumensoConfig(): { url: string; apiKey: string } | null {
  const url = getSetting('documenso_url').replace(/\/$/, '')
  const apiKey = getSetting('documenso_api_key')
  if (!url || !apiKey) return null
  return { url, apiKey }
}

// ─── PDF generation via hidden BrowserWindow ─────────────────────────────────

async function generatePdfFromHtml(html: string, title: string): Promise<string> {
  const styled = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #000;
    background: #fff;
    padding: 72px;
    max-width: 816px;
    margin: 0 auto;
  }
  h1 { font-size: 20pt; margin-bottom: 16px; }
  h2 { font-size: 16pt; margin: 20px 0 10px; }
  h3 { font-size: 14pt; margin: 16px 0 8px; }
  p { margin-bottom: 10px; }
  ul, ol { margin: 8px 0 8px 24px; }
  li { margin-bottom: 4px; }
  strong { font-weight: bold; }
  em { font-style: italic; }
  u { text-decoration: underline; }
  img { max-width: 100%; height: auto; margin: 8px 0; }
  .signature-field {
    display: inline-block;
    margin: 24px 0;
    padding: 20px 24px;
    border: 2px dashed #555;
    border-radius: 4px;
    min-width: 300px;
    text-align: center;
    page-break-inside: avoid;
  }
  .signature-field-label {
    font-size: 10pt;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 8px;
  }
  .signature-field-line {
    border-bottom: 1px solid #333;
    height: 40px;
    margin-bottom: 4px;
  }
</style>
</head>
<body>${html}</body>
</html>`

  const tempDir = path.join(app.getPath('userData'), 'temp')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

  const outPath = path.join(tempDir, `contract-${Date.now()}.pdf`)

  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(styled)}`)

  const buffer = await win.webContents.printToPDF({
    pageSize: 'Letter',
    printBackground: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  })

  win.destroy()
  fs.writeFileSync(outPath, buffer)
  return outPath
}

// ─── Documenso API helpers ────────────────────────────────────────────────────

async function documensoUploadAndSend(
  config: { url: string; apiKey: string },
  pdfPath: string,
  title: string,
  recipientName: string,
  recipientEmail: string
): Promise<{ documentId: string }> {
  // Step 1: Upload document to get presigned URL
  const uploadInitRes = await fetch(`${config.url}/api/v1/documents`, {
    method: 'POST',
    headers: {
      Authorization: config.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  })

  if (!uploadInitRes.ok) {
    const err = await uploadInitRes.text()
    throw new Error(`Documenso upload init failed: ${uploadInitRes.status} ${err}`)
  }

  const initData = (await uploadInitRes.json()) as {
    documentId: number
    uploadUrl: string
  }

  const documentId = String(initData.documentId)
  const uploadUrl = initData.uploadUrl

  // Step 2: PUT the PDF binary to the presigned URL
  const pdfBuffer = fs.readFileSync(pdfPath)
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: pdfBuffer
  })

  if (!putRes.ok) {
    throw new Error(`Documenso S3 upload failed: ${putRes.status}`)
  }

  // Step 3: Create a signing field (signature at bottom of page 1)
  await fetch(`${config.url}/api/v1/documents/${documentId}/fields`, {
    method: 'POST',
    headers: {
      Authorization: config.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: [
        {
          type: 'SIGNATURE',
          signerEmail: recipientEmail,
          pageNumber: 1,
          pageX: 10,
          pageY: 80,
          pageWidth: 30,
          pageHeight: 8
        }
      ]
    })
  })

  // Step 4: Add recipient
  await fetch(`${config.url}/api/v1/documents/${documentId}/recipients`, {
    method: 'POST',
    headers: {
      Authorization: config.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipients: [
        {
          name: recipientName,
          email: recipientEmail,
          role: 'SIGNER'
        }
      ]
    })
  })

  // Step 5: Send the document
  const sendRes = await fetch(`${config.url}/api/v1/documents/${documentId}/send`, {
    method: 'POST',
    headers: {
      Authorization: config.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sendEmail: true })
  })

  if (!sendRes.ok) {
    const err = await sendRes.text()
    throw new Error(`Documenso send failed: ${sendRes.status} ${err}`)
  }

  return { documentId }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

export function registerContractCreationHandlers(): void {
  const db = getDb()

  // ── Save a TipTap-built template ──────────────────────────────────────────
  ipcMain.handle(
    'contractCreation:saveTemplate',
    async (
      _,
      payload: { id?: number; title: string; content: string }
    ): Promise<IpcResponse<ContractTemplate>> => {
      try {
        if (payload.id) {
          db.prepare('UPDATE contract_templates SET title = ?, content = ? WHERE id = ?').run(
            payload.title,
            payload.content,
            payload.id
          )
          const row = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(payload.id) as ContractTemplate
          return { success: true, data: row }
        } else {
          const result = db
            .prepare(
              "INSERT INTO contract_templates (title, type, content) VALUES (?, 'built', ?)"
            )
            .run(payload.title, payload.content)
          const row = db
            .prepare('SELECT * FROM contract_templates WHERE id = ?')
            .get(result.lastInsertRowid) as ContractTemplate
          return { success: true, data: row }
        }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  )

  // ── Upload a PDF/DOCX template via file dialog ────────────────────────────
  ipcMain.handle(
    'contractCreation:uploadTemplate',
    async (_, payload?: { title?: string }): Promise<IpcResponse<ContractTemplate>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Select Contract Template',
          filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'doc'] }],
          properties: ['openFile']
        })

        if (result.canceled || !result.filePaths.length) {
          return { success: false, error: 'Cancelled' }
        }

        const filePath = result.filePaths[0]
        const title = payload?.title || path.basename(filePath, path.extname(filePath))

        const ins = db
          .prepare(
            "INSERT INTO contract_templates (title, type, file_path) VALUES (?, 'uploaded', ?)"
          )
          .run(title, filePath)

        const row = db
          .prepare('SELECT * FROM contract_templates WHERE id = ?')
          .get(ins.lastInsertRowid) as ContractTemplate

        return { success: true, data: row }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  )

  // ── List all templates ────────────────────────────────────────────────────
  ipcMain.handle(
    'contractCreation:listTemplates',
    async (): Promise<IpcResponse<ContractTemplate[]>> => {
      try {
        const rows = db
          .prepare('SELECT * FROM contract_templates ORDER BY created_at DESC')
          .all() as ContractTemplate[]
        return { success: true, data: rows }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  )

  // ── Delete a template ─────────────────────────────────────────────────────
  ipcMain.handle(
    'contractCreation:deleteTemplate',
    async (_, id: number): Promise<IpcResponse<void>> => {
      try {
        db.prepare('DELETE FROM contract_templates WHERE id = ?').run(id)
        return { success: true }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  )

  // ── Generate PDF from HTML (TipTap rendered output) ──────────────────────
  ipcMain.handle(
    'contractCreation:generatePdf',
    async (_, html: string, title: string): Promise<IpcResponse<{ path: string }>> => {
      try {
        const pdfPath = await generatePdfFromHtml(html, title)
        return { success: true, data: { path: pdfPath } }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  )

  // ── Send document for e-signature via Documenso ───────────────────────────
  ipcMain.handle(
    'contractCreation:send',
    async (
      _,
      payload: {
        templateId?: number
        contractId?: number
        documentTitle: string
        recipientName: string
        recipientEmail: string
        documentPath: string
      }
    ): Promise<IpcResponse<{ requestId: number }>> => {
      try {
        const config = getDocumensoConfig()
        if (!config) {
          return {
            success: false,
            error:
              'Documenso is not configured. Go to Settings → E-Signature to add your API URL and key.'
          }
        }

        const { documentId } = await documensoUploadAndSend(
          config,
          payload.documentPath,
          payload.documentTitle,
          payload.recipientName,
          payload.recipientEmail
        )

        const ins = db
          .prepare(`
            INSERT INTO signing_requests
              (template_id, contract_id, document_title, recipient_name, recipient_email,
               documenso_document_id, status, document_path, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, datetime('now'))
          `)
          .run(
            payload.templateId ?? null,
            payload.contractId ?? null,
            payload.documentTitle,
            payload.recipientName,
            payload.recipientEmail,
            documentId,
            payload.documentPath
          )

        return { success: true, data: { requestId: ins.lastInsertRowid as number } }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  )

  // ── List all signing requests ─────────────────────────────────────────────
  ipcMain.handle(
    'contractCreation:listRequests',
    async (): Promise<IpcResponse<SigningRequest[]>> => {
      try {
        const rows = db
          .prepare('SELECT * FROM signing_requests ORDER BY created_at DESC')
          .all() as SigningRequest[]
        return { success: true, data: rows }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  )

  // ── Refresh status from Documenso for one request ─────────────────────────
  ipcMain.handle(
    'contractCreation:refreshStatus',
    async (_, requestId: number): Promise<IpcResponse<SigningRequest>> => {
      try {
        const req = db
          .prepare('SELECT * FROM signing_requests WHERE id = ?')
          .get(requestId) as SigningRequest | undefined

        if (!req) return { success: false, error: 'Request not found' }
        if (!req.documenso_document_id) return { success: true, data: req }

        const config = getDocumensoConfig()
        if (!config) return { success: true, data: req }

        const res = await fetch(
          `${config.url}/api/v1/documents/${req.documenso_document_id}`,
          { headers: { Authorization: config.apiKey } }
        )

        if (!res.ok) return { success: true, data: req }

        const doc = (await res.json()) as { status?: string }

        const statusMap: Record<string, SigningRequest['status']> = {
          DRAFT: 'pending',
          PENDING: 'sent',
          COMPLETED: 'completed',
          DECLINED: 'declined'
        }

        const newStatus: SigningRequest['status'] =
          statusMap[doc.status?.toUpperCase() ?? ''] ?? req.status

        const completedAt =
          newStatus === 'completed' ? (req.completed_at ?? new Date().toISOString()) : req.completed_at

        db.prepare(
          'UPDATE signing_requests SET status = ?, completed_at = ? WHERE id = ?'
        ).run(newStatus, completedAt ?? null, requestId)

        const updated = db
          .prepare('SELECT * FROM signing_requests WHERE id = ?')
          .get(requestId) as SigningRequest

        return { success: true, data: updated }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  )

  // ── Test Documenso connection ─────────────────────────────────────────────
  ipcMain.handle(
    'contractCreation:testDocumenso',
    async (): Promise<IpcResponse<{ connected: boolean }>> => {
      try {
        const config = getDocumensoConfig()
        if (!config) {
          return { success: false, error: 'Documenso URL or API key not set in Settings.' }
        }

        const res = await fetch(`${config.url}/api/v1/documents?page=1&perPage=1`, {
          headers: { Authorization: config.apiKey }
        })

        if (res.ok) {
          return { success: true, data: { connected: true } }
        }

        const body = await res.text()
        return { success: false, error: `Connection failed (${res.status}): ${body}` }
      } catch (e: any) {
        return { success: false, error: `Could not reach Documenso: ${e.message}` }
      }
    }
  )
}
