import { ipcMain } from 'electron'
import { getDb } from '../database'
import type { IpcResponse, Invoice } from '../../shared/types'

export function registerInvoiceHandlers(): void {
  ipcMain.handle(
    'invoices:list',
    async (_e, opts?: { department_id?: number; show_deleted?: boolean }): Promise<IpcResponse<Invoice[]>> => {
      try {
        const db = getDb()
        let query = `
          SELECT i.*, c.vendor_name, c.department_id
          FROM invoices i
          LEFT JOIN contracts c ON i.contract_id = c.id
          WHERE i.is_deleted = 0
        `
        const params: (string | number)[] = []

        if (!opts?.show_deleted) {
          // already filtered above
        }
        if (opts?.department_id) {
          query += ' AND c.department_id = ?'
          params.push(opts.department_id)
        }
        query += ' ORDER BY i.received_date DESC'

        const rows = db.prepare(query).all(...params) as Invoice[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('invoices:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb()
        .prepare(`UPDATE invoices SET is_deleted = 1, deleted_at = datetime('now') WHERE id = ?`)
        .run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'invoices:insert',
    async (
      _e,
      payload: Omit<Invoice, 'id' | 'is_deleted'>
    ): Promise<IpcResponse<Invoice>> => {
      try {
        const db = getDb()
        const existing = db
          .prepare('SELECT id FROM invoices WHERE gmail_message_id = ?')
          .get(payload.gmail_message_id)
        if (existing) return { success: false, error: 'Already exists' }

        const result = db
          .prepare(
            `INSERT INTO invoices
             (contract_id, gmail_message_id, subject, sender, amount, budgeted_amount, received_date)
             VALUES (?,?,?,?,?,?,?)`
          )
          .run(
            payload.contract_id,
            payload.gmail_message_id,
            payload.subject,
            payload.sender,
            payload.amount,
            payload.budgeted_amount,
            payload.received_date
          )
        const row = db
          .prepare('SELECT * FROM invoices WHERE id = ?')
          .get(result.lastInsertRowid) as Invoice
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
