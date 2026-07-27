import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb } from '../database'
import type { IpcResponse, GLCode } from '../../shared/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedGLCode {
  code: string
  description: string
  _duplicate: boolean // already exists in the database
}

interface BulkGLResult {
  created: number
  skipped: number
  errors: { code: string; message: string }[]
}

// ---------------------------------------------------------------------------
// Header matching for CSV / XLSX import
// ---------------------------------------------------------------------------

const CODE_ALIASES = ['gl code', 'glcode', 'gl', 'code', 'account', 'account code', 'accountcode', 'account number', 'gl account', 'glaccount', 'g/l', 'g/l code']
const DESC_ALIASES = ['description', 'desc', 'name', 'account name', 'accountname', 'gl description', 'account description', 'title', 'label', 'details']

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-]+/g, ' ')
}

function findKey(headers: string[], aliases: string[]): string | null {
  for (const h of headers) {
    if (aliases.includes(normalizeHeader(h))) return h
  }
  return null
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

export function registerGLCodeHandlers(): void {
  // List all GL codes with usage counts
  ipcMain.handle('glCodes:list', async (): Promise<IpcResponse<GLCode[]>> => {
    try {
      const rows = getDb()
        .prepare(
          `SELECT g.*,
             (SELECT COUNT(*) FROM contracts WHERE gl_code_id = g.id) AS contract_count,
             (SELECT COUNT(*) FROM invoices WHERE gl_code_id = g.id AND is_deleted = 0) AS invoice_count
           FROM gl_codes g
           ORDER BY g.code ASC`
        )
        .all() as GLCode[]
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Create a single GL code
  ipcMain.handle(
    'glCodes:create',
    async (_e, payload: { code: string; description?: string }): Promise<IpcResponse<GLCode>> => {
      try {
        const db = getDb()
        const code = (payload.code || '').trim()
        if (!code) return { success: false, error: 'Code is required' }

        const existing = db.prepare('SELECT id FROM gl_codes WHERE code = ?').get(code)
        if (existing) return { success: false, error: `GL code "${code}" already exists` }

        const result = db
          .prepare('INSERT INTO gl_codes (code, description) VALUES (?, ?)')
          .run(code, (payload.description || '').trim())
        const row = db.prepare('SELECT * FROM gl_codes WHERE id = ?').get(result.lastInsertRowid) as GLCode
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Update a GL code (code / description / active state)
  ipcMain.handle(
    'glCodes:update',
    async (
      _e,
      payload: { id: number; code?: string; description?: string; is_active?: number }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const fields: string[] = []
        const values: (string | number)[] = []

        if (payload.code !== undefined) {
          const code = payload.code.trim()
          if (!code) return { success: false, error: 'Code cannot be empty' }
          const clash = db
            .prepare('SELECT id FROM gl_codes WHERE code = ? AND id != ?')
            .get(code, payload.id)
          if (clash) return { success: false, error: `GL code "${code}" already exists` }
          fields.push('code = ?')
          values.push(code)
        }
        if (payload.description !== undefined) {
          fields.push('description = ?')
          values.push(payload.description.trim())
        }
        if (payload.is_active !== undefined) {
          fields.push('is_active = ?')
          values.push(payload.is_active ? 1 : 0)
        }
        if (fields.length === 0) return { success: true }

        db.prepare(`UPDATE gl_codes SET ${fields.join(', ')} WHERE id = ?`).run(...values, payload.id)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Delete a GL code (contracts/invoices referencing it are unassigned via ON DELETE SET NULL)
  ipcMain.handle('glCodes:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM gl_codes WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Parse a spreadsheet of GL codes and return a preview (flags duplicates)
  ipcMain.handle('glCodes:parseImport', async (): Promise<IpcResponse<ParsedGLCode[]>> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select GL Codes File to Import',
        filters: [{ name: 'Spreadsheets', extensions: ['csv', 'xlsx', 'xls'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No file selected' }
      }

      const XLSX = await import('xlsx')
      const filePath = result.filePaths[0]
      const ext = path.extname(filePath).toLowerCase()
      const wb =
        ext === '.csv'
          ? XLSX.read(fs.readFileSync(filePath), { type: 'buffer', raw: false })
          : XLSX.readFile(filePath, { raw: false })

      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[]
      if (raw.length === 0) return { success: false, error: 'Spreadsheet is empty' }

      const headers = Object.keys(raw[0])
      const codeKey = findKey(headers, CODE_ALIASES)
      const descKey = findKey(headers, DESC_ALIASES)

      if (!codeKey) {
        return {
          success: false,
          error: 'Could not find a GL code column. Expected a header like "GL Code", "Code", or "Account".'
        }
      }

      const db = getDb()
      const existing = new Set(
        (db.prepare('SELECT code FROM gl_codes').all() as { code: string }[]).map((r) => r.code.toLowerCase())
      )

      const seen = new Set<string>()
      const parsed: ParsedGLCode[] = []
      for (const row of raw) {
        const code = String(row[codeKey] ?? '').trim()
        if (!code) continue
        // Skip duplicate rows within the same file
        if (seen.has(code.toLowerCase())) continue
        seen.add(code.toLowerCase())

        parsed.push({
          code,
          description: descKey ? String(row[descKey] ?? '').trim() : '',
          _duplicate: existing.has(code.toLowerCase())
        })
      }

      if (parsed.length === 0) return { success: false, error: 'No GL codes found in the file' }
      return { success: true, data: parsed }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Bulk-create GL codes from reviewed rows (existing codes are skipped)
  ipcMain.handle(
    'glCodes:bulkCreate',
    async (_e, rows: { code: string; description?: string }[]): Promise<IpcResponse<BulkGLResult>> => {
      const db = getDb()
      let created = 0
      let skipped = 0
      const errors: BulkGLResult['errors'] = []

      const findStmt = db.prepare('SELECT id FROM gl_codes WHERE code = ?')
      const insertStmt = db.prepare('INSERT INTO gl_codes (code, description) VALUES (?, ?)')

      const tx = db.transaction((items: { code: string; description?: string }[]) => {
        for (const item of items) {
          const code = (item.code || '').trim()
          if (!code) continue
          try {
            if (findStmt.get(code)) {
              skipped++
              continue
            }
            insertStmt.run(code, (item.description || '').trim())
            created++
          } catch (err: any) {
            errors.push({ code, message: err.message })
          }
        }
      })
      tx(rows)

      return { success: true, data: { created, skipped, errors } }
    }
  )

  // Assign (or clear) a GL code on a contract or invoice
  ipcMain.handle(
    'glCodes:assign',
    async (
      _e,
      payload: { entity: 'contract' | 'invoice'; id: number; gl_code_id: number | null }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const table = payload.entity === 'contract' ? 'contracts' : 'invoices'
        db.prepare(`UPDATE ${table} SET gl_code_id = ? WHERE id = ?`).run(
          payload.gl_code_id ?? null,
          payload.id
        )
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
