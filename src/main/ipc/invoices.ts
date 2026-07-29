import { ipcMain } from 'electron'
import { getDb } from '../database'
import { resolveActor, contractScopeClause, requireRowContractAccess } from '../authz'
import type { Actor, IpcResponse, Invoice } from '../../shared/types'

export function registerInvoiceHandlers(): void {
  ipcMain.handle(
    'invoices:list',
    async (_e, opts?: { department_id?: number; show_deleted?: boolean; actor?: Actor }): Promise<IpcResponse<Invoice[]>> => {
      try {
        const db = getDb()
        // `is_deleted` is a soft delete, so removed invoices are recoverable —
        // the WHERE clause used to be hard-coded to 0, which made the
        // `show_deleted` option a no-op and the rows unreachable forever.
        let query = `
          SELECT i.*, c.vendor_name, c.department_id
          FROM invoices i
          LEFT JOIN contracts c ON i.contract_id = c.id
          WHERE 1=1
        `
        const params: (string | number)[] = []

        // An invoice is visible if the contract it bills against is. Invoices
        // with no contract are super-admin only — there is no scope to judge.
        const scope = contractScopeClause(resolveActor(db, opts?.actor), 'c')
        query += scope.sql
        params.push(...scope.params)

        if (!opts?.show_deleted) {
          query += ' AND i.is_deleted = 0'
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

  ipcMain.handle('invoices:delete', async (_e, arg: number | { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
    try {
      const id = typeof arg === 'number' ? arg : arg.id
      const gate = requireRowContractAccess(
        getDb(), 'invoices', id, typeof arg === 'number' ? undefined : arg.actor
      )
      if (gate) return gate
      getDb()
        .prepare(`UPDATE invoices SET is_deleted = 1, deleted_at = datetime('now') WHERE id = ?`)
        .run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  /** Undoes a soft delete. */
  ipcMain.handle('invoices:restore', async (_e, arg: number | { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
    try {
      const id = typeof arg === 'number' ? arg : arg.id
      const gate = requireRowContractAccess(
        getDb(), 'invoices', id, typeof arg === 'number' ? undefined : arg.actor
      )
      if (gate) return gate
      const info = getDb()
        .prepare('UPDATE invoices SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND is_deleted = 1')
        .run(id)
      if (info.changes === 0) return { success: false, error: 'That invoice is not in the removed list.' }
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
