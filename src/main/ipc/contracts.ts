import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  getDb,
  refreshContractFts,
  removeContractFromFts,
  setContractExtractedText,
  rebuildContractFtsIfEmpty
} from '../database'
import {
  notifyContractCreated,
  notifyContractUpdated,
  notifyContractDeleted
} from '../emailNotifier'
import type {
  IpcResponse,
  Contract,
  ContractLineItem,
  RenewalHistory
} from '../../shared/types'

async function extractPdfText(filePath: string): Promise<string> {
  try {
    const pdfParse = await import('pdf-parse')
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse.default(buffer)
    return data.text || ''
  } catch {
    return ''
  }
}

// Lazy imports for parsing (native modules)
async function parsePdf(filePath: string): Promise<string> {
  const pdfParse = await import('pdf-parse')
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse.default(buffer)
  return data.text
}

async function parseXlsx(filePath: string): Promise<Record<string, string>[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws) as Record<string, string>[]
}

export function registerContractHandlers(): void {
  // List contracts (with optional department/branch filter and role-based access)
  ipcMain.handle(
    'contracts:list',
    async (
      _e,
      opts?: {
        department_id?: number
        branch_id?: number
        search?: string
        // role-based filtering
        role?: string
        allowed_department_ids?: number[]
        allowed_branch_ids?: number[]
      }
    ): Promise<IpcResponse<Contract[]>> => {
      try {
        const db = getDb()
        let query = `
          SELECT c.*, d.name as department_name, br.name as branch_name,
            (SELECT COUNT(*) FROM vendor_notes WHERE contract_id = c.id) as notes_count,
            CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal
          FROM contracts c
          LEFT JOIN departments d ON c.department_id = d.id
          LEFT JOIN branches br ON c.branch_id = br.id
          WHERE 1=1
        `
        const params: (string | number)[] = []

        // Explicit filter by a single dept or branch
        if (opts?.department_id) {
          query += ' AND c.department_id = ?'
          params.push(opts.department_id)
        }
        if (opts?.branch_id) {
          query += ' AND c.branch_id = ?'
          params.push(opts.branch_id)
        }

        // Role-based visibility
        if (opts?.role === 'store_manager') {
          const ids = opts.allowed_branch_ids ?? []
          if (ids.length === 0) {
            query += ' AND 1=0' // no access
          } else {
            query += ` AND c.branch_id IN (${ids.map(() => '?').join(',')})`
            params.push(...ids)
          }
        } else if (opts?.role === 'director') {
          const deptIds = opts.allowed_department_ids ?? []
          const branchIds = opts.allowed_branch_ids ?? []
          const clauses: string[] = []
          if (deptIds.length > 0) {
            clauses.push(`c.department_id IN (${deptIds.map(() => '?').join(',')})`)
            params.push(...deptIds)
          }
          if (branchIds.length > 0) {
            clauses.push(`c.branch_id IN (${branchIds.map(() => '?').join(',')})`)
            params.push(...branchIds)
          }
          if (clauses.length > 0) {
            query += ` AND (${clauses.join(' OR ')})`
          } else {
            query += ' AND 1=0'
          }
        }
        // super_admin: no additional filter

        if (opts?.search) {
          query += ' AND (c.vendor_name LIKE ? OR c.poc_name LIKE ?)'
          params.push(`%${opts.search}%`, `%${opts.search}%`)
        }
        query += ' ORDER BY c.end_date ASC'

        const rows = db.prepare(query).all(...params) as Contract[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Get single contract
  ipcMain.handle('contracts:get', async (_e, id: number): Promise<IpcResponse<Contract>> => {
    try {
      const row = getDb()
        .prepare(
          `SELECT c.*, d.name as department_name, br.name as branch_name,
            CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal
           FROM contracts c
           LEFT JOIN departments d ON c.department_id = d.id
           LEFT JOIN branches br ON c.branch_id = br.id
           WHERE c.id = ?`
        )
        .get(id) as Contract
      return { success: true, data: row }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Create contract
  ipcMain.handle(
    'contracts:create',
    async (_e, payload: Omit<Contract, 'id' | 'created_at'>): Promise<IpcResponse<Contract>> => {
      try {
        const db = getDb()
        const result = db
          .prepare(
            `INSERT INTO contracts
             (vendor_name, status, start_date, end_date, monthly_cost, annual_cost, total_cost,
              poc_name, poc_email, poc_phone, department_id, branch_id, file_path)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
          )
          .run(
            payload.vendor_name,
            payload.status,
            payload.start_date,
            payload.end_date,
            payload.monthly_cost,
            payload.annual_cost,
            payload.total_cost,
            payload.poc_name,
            payload.poc_email,
            payload.poc_phone,
            payload.department_id ?? null,
            payload.branch_id ?? null,
            payload.file_path || null
          )
        const row = db
          .prepare('SELECT * FROM contracts WHERE id = ?')
          .get(result.lastInsertRowid) as Contract
        // Index in FTS (and extract text if a PDF was attached)
        if (row.file_path && path.extname(row.file_path).toLowerCase() === '.pdf') {
          const text = await extractPdfText(row.file_path)
          setContractExtractedText(row.id, text)
        } else {
          refreshContractFts(row.id)
        }
        notifyContractCreated(db, row).catch(() => {})
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Update contract
  ipcMain.handle(
    'contracts:update',
    async (_e, payload: Partial<Contract> & { id: number }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        // Fetch current contract for notification context before updating
        const current = db
          .prepare('SELECT * FROM contracts WHERE id = ?')
          .get(payload.id) as Contract | undefined
        const fields = Object.keys(payload).filter((k) => k !== 'id')
        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (payload as any)[f])
        db.prepare(`UPDATE contracts SET ${sets} WHERE id = ?`).run(...values, payload.id)
        if (current) {
          notifyContractUpdated(db, current, fields).catch(() => {})
        }
        // If file_path changed to a new PDF, re-extract text; otherwise refresh other fields.
        const newFilePath = (payload as any).file_path as string | undefined
        if (
          fields.includes('file_path') &&
          newFilePath &&
          path.extname(newFilePath).toLowerCase() === '.pdf'
        ) {
          const text = await extractPdfText(newFilePath)
          setContractExtractedText(payload.id, text)
        } else {
          refreshContractFts(payload.id)
        }
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Delete contract
  ipcMain.handle('contracts:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      const db = getDb()
      const contract = db
        .prepare('SELECT vendor_name, department_id, branch_id FROM contracts WHERE id = ?')
        .get(id) as { vendor_name: string; department_id: number | null; branch_id: number | null } | undefined
      db.prepare('DELETE FROM contracts WHERE id = ?').run(id)
      removeContractFromFts(id)
      if (contract) {
        notifyContractDeleted(db, contract.vendor_name, contract.department_id, contract.branch_id).catch(() => {})
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Full-text search across vendor/POC/notes/extracted PDF text.
  // Returns matching contracts with a preview snippet and the same role-scope
  // rules as contracts:list.
  ipcMain.handle(
    'contracts:searchFullText',
    async (
      _e,
      opts: {
        query: string
        role?: string
        allowed_department_ids?: number[]
        allowed_branch_ids?: number[]
      }
    ): Promise<IpcResponse<(Contract & { snippet: string })[]>> => {
      try {
        const db = getDb()
        // Ensure pre-existing contracts are indexed the first time this is called.
        rebuildContractFtsIfEmpty()
        const q = (opts.query || '').trim()
        if (!q) return { success: true, data: [] }

        // Escape FTS5 special syntax by quoting each term and AND-ing them.
        const sanitized = q
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => '"' + t.replace(/"/g, '""') + '"')
          .join(' AND ')

        const params: (string | number)[] = [sanitized]
        let scopeClause = ''
        if (opts.role === 'store_manager') {
          const ids = opts.allowed_branch_ids ?? []
          if (ids.length === 0) return { success: true, data: [] }
          scopeClause = ` AND c.branch_id IN (${ids.map(() => '?').join(',')})`
          params.push(...ids)
        } else if (opts.role === 'director') {
          const deptIds = opts.allowed_department_ids ?? []
          const branchIds = opts.allowed_branch_ids ?? []
          const clauses: string[] = []
          if (deptIds.length > 0) {
            clauses.push(`c.department_id IN (${deptIds.map(() => '?').join(',')})`)
            params.push(...deptIds)
          }
          if (branchIds.length > 0) {
            clauses.push(`c.branch_id IN (${branchIds.map(() => '?').join(',')})`)
            params.push(...branchIds)
          }
          if (clauses.length === 0) return { success: true, data: [] }
          scopeClause = ` AND (${clauses.join(' OR ')})`
        }

        const rows = db
          .prepare(
            `SELECT c.*, d.name as department_name, br.name as branch_name,
               CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal,
               snippet(contracts_fts, -1, '<mark>', '</mark>', ' … ', 20) as snippet,
               bm25(contracts_fts) as rank
             FROM contracts_fts
             JOIN contracts c ON c.id = contracts_fts.rowid
             LEFT JOIN departments d ON c.department_id = d.id
             LEFT JOIN branches br ON c.branch_id = br.id
             WHERE contracts_fts MATCH ?${scopeClause}
             ORDER BY rank
             LIMIT 100`
          )
          .all(...params) as (Contract & { snippet: string })[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Re-extract text for a contract on demand (e.g. after replacing the file).
  ipcMain.handle(
    'contracts:reextractText',
    async (_e, contract_id: number): Promise<IpcResponse<{ length: number }>> => {
      try {
        const db = getDb()
        const row = db
          .prepare('SELECT file_path FROM contracts WHERE id = ?')
          .get(contract_id) as { file_path: string | null } | undefined
        if (!row?.file_path || path.extname(row.file_path).toLowerCase() !== '.pdf') {
          return { success: false, error: 'Contract has no attached PDF' }
        }
        const text = await extractPdfText(row.file_path)
        setContractExtractedText(contract_id, text)
        return { success: true, data: { length: text.length } }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Upload contract file (opens dialog)
  ipcMain.handle('contracts:uploadFile', async (): Promise<IpcResponse<{ path: string; text?: string; rows?: Record<string,string>[] }>> => {
    try {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'Contracts', extensions: ['pdf', 'xlsx', 'xls', 'doc', 'docx'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No file selected' }
      }
      const filePath = result.filePaths[0]
      const ext = path.extname(filePath).toLowerCase()

      if (ext === '.pdf') {
        const text = await parsePdf(filePath)
        return { success: true, data: { path: filePath, text } }
      } else if (ext === '.xlsx' || ext === '.xls') {
        const rows = await parseXlsx(filePath)
        return { success: true, data: { path: filePath, rows } }
      } else {
        return { success: true, data: { path: filePath } }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Line items
  ipcMain.handle(
    'lineItems:list',
    async (_e, contract_id: number): Promise<IpcResponse<ContractLineItem[]>> => {
      try {
        const rows = getDb()
          .prepare('SELECT * FROM contract_line_items WHERE contract_id = ?')
          .all(contract_id) as ContractLineItem[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'lineItems:upsert',
    async (_e, items: ContractLineItem[]): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const upsert = db.prepare(`
          INSERT INTO contract_line_items (id, contract_id, description, quantity, unit_price, total_price)
          VALUES (@id, @contract_id, @description, @quantity, @unit_price, @total_price)
          ON CONFLICT(id) DO UPDATE SET
            description = excluded.description,
            quantity = excluded.quantity,
            unit_price = excluded.unit_price,
            total_price = excluded.total_price
        `)
        const insert = db.prepare(`
          INSERT INTO contract_line_items (contract_id, description, quantity, unit_price, total_price)
          VALUES (@contract_id, @description, @quantity, @unit_price, @total_price)
        `)
        const tx = db.transaction((items: ContractLineItem[]) => {
          for (const item of items) {
            if (item.id) {
              upsert.run(item)
            } else {
              insert.run(item)
            }
          }
        })
        tx(items)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('lineItems:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM contract_line_items WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Renewal history
  ipcMain.handle(
    'renewals:list',
    async (_e, contract_id: number): Promise<IpcResponse<RenewalHistory[]>> => {
      try {
        const rows = getDb()
          .prepare('SELECT * FROM renewal_history WHERE contract_id = ? ORDER BY renewal_date DESC')
          .all(contract_id) as RenewalHistory[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'renewals:create',
    async (
      _e,
      payload: Omit<RenewalHistory, 'id'>
    ): Promise<IpcResponse<RenewalHistory>> => {
      try {
        const db = getDb()
        const result = db
          .prepare(
            `INSERT INTO renewal_history (contract_id, renewal_date, prev_cost, new_cost, license_count_change, reason)
             VALUES (?,?,?,?,?,?)`
          )
          .run(
            payload.contract_id,
            payload.renewal_date,
            payload.prev_cost,
            payload.new_cost,
            payload.license_count_change,
            payload.reason
          )
        const row = db
          .prepare('SELECT * FROM renewal_history WHERE id = ?')
          .get(result.lastInsertRowid) as RenewalHistory
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
