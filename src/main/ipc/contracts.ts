import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb } from '../database'
import type {
  IpcResponse,
  Contract,
  ContractLineItem,
  RenewalHistory
} from '../../shared/types'

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
  // List contracts (with optional department filter)
  ipcMain.handle(
    'contracts:list',
    async (_e, opts?: { department_id?: number; search?: string }): Promise<IpcResponse<Contract[]>> => {
      try {
        const db = getDb()
        let query = `
          SELECT c.*, d.name as department_name,
            (SELECT COUNT(*) FROM vendor_notes WHERE contract_id = c.id) as notes_count,
            CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal
          FROM contracts c
          LEFT JOIN departments d ON c.department_id = d.id
          WHERE 1=1
        `
        const params: (string | number)[] = []

        if (opts?.department_id) {
          query += ' AND c.department_id = ?'
          params.push(opts.department_id)
        }
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
          `SELECT c.*, d.name as department_name,
            CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal
           FROM contracts c
           LEFT JOIN departments d ON c.department_id = d.id
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
              poc_name, poc_email, poc_phone, department_id, file_path)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
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
            payload.department_id,
            payload.file_path || null
          )
        const row = db
          .prepare('SELECT * FROM contracts WHERE id = ?')
          .get(result.lastInsertRowid) as Contract
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
        const fields = Object.keys(payload).filter((k) => k !== 'id')
        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (payload as any)[f])
        db.prepare(`UPDATE contracts SET ${sets} WHERE id = ?`).run(...values, payload.id)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Delete contract
  ipcMain.handle('contracts:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM contracts WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Upload contract file (opens dialog)
  ipcMain.handle('contracts:uploadFile', async (): Promise<IpcResponse<{ path: string; text?: string; rows?: Record<string,string>[] }>> => {
    try {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'Contracts', extensions: ['pdf', 'xlsx', 'xls'] }],
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
      } else {
        const rows = await parseXlsx(filePath)
        return { success: true, data: { path: filePath, rows } }
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
