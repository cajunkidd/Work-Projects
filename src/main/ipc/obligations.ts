import { ipcMain } from 'electron'
import { getDb } from '../database'
import { logChange, computeDiff } from '../audit'
import type { IpcResponse } from '../../shared/types'
import type { ContractObligation, ObligationStatus, ObligationRecurrence } from '../../shared/types'

interface UpcomingObligation extends ContractObligation {
  vendor_name: string
  days_until_due: number
}

export function registerObligationHandlers(): void {
  // List obligations for a contract
  ipcMain.handle(
    'obligations:list',
    async (_e, contract_id: number): Promise<IpcResponse<ContractObligation[]>> => {
      try {
        const rows = getDb()
          .prepare(
            `SELECT o.*, u.name as responsible_user_name
             FROM contract_obligations o
             LEFT JOIN users u ON u.id = o.responsible_user_id
             WHERE o.contract_id = ?
             ORDER BY o.status = 'completed', o.due_date ASC`
          )
          .all(contract_id) as ContractObligation[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Create obligation
  ipcMain.handle(
    'obligations:create',
    async (
      _e,
      payload: Omit<ContractObligation, 'id' | 'created_at' | 'completed_at' | 'responsible_user_name'>
    ): Promise<IpcResponse<ContractObligation>> => {
      try {
        const db = getDb()
        const result = db
          .prepare(
            `INSERT INTO contract_obligations
             (contract_id, title, description, due_date, responsible_user_id, status, recurrence)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            payload.contract_id,
            payload.title,
            payload.description ?? '',
            payload.due_date,
            payload.responsible_user_id ?? null,
            payload.status ?? 'pending',
            payload.recurrence ?? 'none'
          )
        const row = db
          .prepare(
            `SELECT o.*, u.name as responsible_user_name
             FROM contract_obligations o
             LEFT JOIN users u ON u.id = o.responsible_user_id
             WHERE o.id = ?`
          )
          .get(result.lastInsertRowid) as ContractObligation
        logChange(null, 'obligation', row.id, 'create', { snapshot: row })
        logChange(null, 'contract', row.contract_id, 'update', {
          obligation_added: { id: row.id, title: row.title, due_date: row.due_date }
        })
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Update obligation (partial)
  ipcMain.handle(
    'obligations:update',
    async (
      _e,
      payload: Partial<ContractObligation> & { id: number }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const before = db
          .prepare('SELECT * FROM contract_obligations WHERE id = ?')
          .get(payload.id) as ContractObligation | undefined
        const fields = Object.keys(payload).filter((k) => k !== 'id' && k !== 'responsible_user_name')
        if (fields.length === 0) return { success: true }
        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (payload as any)[f])
        db.prepare(`UPDATE contract_obligations SET ${sets} WHERE id = ?`).run(
          ...values,
          payload.id
        )
        if (before) {
          const after: Record<string, unknown> = {}
          for (const f of fields) after[f] = (payload as any)[f]
          const diff = computeDiff(before as any, after)
          if (Object.keys(diff).length > 0) {
            logChange(null, 'obligation', payload.id, 'update', diff)
          }
        }
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Mark complete (sets completed_at; if recurring, spawns the next occurrence)
  ipcMain.handle(
    'obligations:complete',
    async (_e, id: number): Promise<IpcResponse<ContractObligation | null>> => {
      try {
        const db = getDb()
        const current = db
          .prepare('SELECT * FROM contract_obligations WHERE id = ?')
          .get(id) as ContractObligation | undefined
        if (!current) return { success: false, error: 'Obligation not found' }
        db.prepare(
          `UPDATE contract_obligations
           SET status = 'completed', completed_at = datetime('now')
           WHERE id = ?`
        ).run(id)
        logChange(null, 'obligation', id, 'update', {
          status: { from: current.status, to: 'completed' }
        })
        logChange(null, 'contract', current.contract_id, 'update', {
          obligation_completed: { id, title: current.title }
        })

        let nextRow: ContractObligation | null = null
        if (current.recurrence && current.recurrence !== 'none') {
          const nextDueDate = advanceDueDate(current.due_date, current.recurrence as ObligationRecurrence)
          const result = db
            .prepare(
              `INSERT INTO contract_obligations
               (contract_id, title, description, due_date, responsible_user_id, status, recurrence)
               VALUES (?, ?, ?, ?, ?, 'pending', ?)`
            )
            .run(
              current.contract_id,
              current.title,
              current.description,
              nextDueDate,
              current.responsible_user_id ?? null,
              current.recurrence
            )
          nextRow = db
            .prepare(
              `SELECT o.*, u.name as responsible_user_name
               FROM contract_obligations o
               LEFT JOIN users u ON u.id = o.responsible_user_id
               WHERE o.id = ?`
            )
            .get(result.lastInsertRowid) as ContractObligation
        }
        return { success: true, data: nextRow }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Delete obligation
  ipcMain.handle('obligations:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      const db = getDb()
      const row = db
        .prepare('SELECT * FROM contract_obligations WHERE id = ?')
        .get(id) as ContractObligation | undefined
      db.prepare('DELETE FROM contract_obligations WHERE id = ?').run(id)
      if (row) {
        logChange(null, 'obligation', id, 'delete', { snapshot: row })
        logChange(null, 'contract', row.contract_id, 'update', {
          obligation_deleted: { id, title: row.title }
        })
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Upcoming obligations (dashboard / scoped by role)
  ipcMain.handle(
    'obligations:upcoming',
    async (
      _e,
      opts?: {
        days?: number
        role?: string
        allowed_department_ids?: number[]
        allowed_branch_ids?: number[]
      }
    ): Promise<IpcResponse<UpcomingObligation[]>> => {
      try {
        const db = getDb()
        const days = opts?.days ?? 60
        const params: (string | number)[] = [days]
        let scope = ''
        if (opts?.role === 'store_manager') {
          const ids = opts.allowed_branch_ids ?? []
          if (ids.length === 0) return { success: true, data: [] }
          scope = ` AND c.branch_id IN (${ids.map(() => '?').join(',')})`
          params.push(...ids)
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
          if (clauses.length === 0) return { success: true, data: [] }
          scope = ` AND (${clauses.join(' OR ')})`
        }
        const rows = db
          .prepare(
            `SELECT o.*, c.vendor_name,
               CAST(julianday(o.due_date) - julianday('now') AS INTEGER) as days_until_due
             FROM contract_obligations o
             JOIN contracts c ON c.id = o.contract_id
             WHERE o.status IN ('pending','overdue')
               AND julianday(o.due_date) - julianday('now') <= ?${scope}
             ORDER BY o.due_date ASC
             LIMIT 50`
          )
          .all(...params) as UpcomingObligation[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}

// Mark past-due pending obligations as 'overdue'. Called from the scheduler.
export function markOverdueObligations(): number {
  const db = getDb()
  const result = db
    .prepare(
      `UPDATE contract_obligations
       SET status = 'overdue'
       WHERE status = 'pending' AND date(due_date) < date('now')`
    )
    .run()
  return result.changes
}

function advanceDueDate(dateStr: string, recurrence: ObligationRecurrence): string {
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (recurrence === 'quarterly') d.setMonth(d.getMonth() + 3)
  else if (recurrence === 'annual') d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

// Expose the interface so the shared types file can re-export if needed
export type { UpcomingObligation, ObligationStatus, ObligationRecurrence }
