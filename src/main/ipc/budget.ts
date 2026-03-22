import { ipcMain } from 'electron'
import { getDb } from '../database'
import type { IpcResponse, Budget, BudgetSummary, Department } from '../../shared/types'

export function registerBudgetHandlers(): void {
  // Departments CRUD
  ipcMain.handle('departments:list', async (): Promise<IpcResponse<Department[]>> => {
    try {
      const rows = getDb().prepare('SELECT * FROM departments ORDER BY name').all() as Department[]
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'departments:create',
    async (_e, name: string): Promise<IpcResponse<Department>> => {
      try {
        const db = getDb()
        const result = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name)
        const row = db
          .prepare('SELECT * FROM departments WHERE id = ?')
          .get(result.lastInsertRowid) as Department
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'departments:update',
    async (_e, payload: { id: number; name: string }): Promise<IpcResponse<void>> => {
      try {
        getDb().prepare('UPDATE departments SET name = ? WHERE id = ?').run(payload.name, payload.id)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('departments:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM departments WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Budget CRUD
  ipcMain.handle('budget:list', async (): Promise<IpcResponse<Budget[]>> => {
    try {
      const rows = getDb()
        .prepare(
          `SELECT b.*, d.name as department_name FROM budget b
           LEFT JOIN departments d ON b.department_id = d.id
           ORDER BY b.fiscal_year DESC, d.name`
        )
        .all() as Budget[]
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'budget:upsert',
    async (
      _e,
      payload: { department_id: number | null; fiscal_year: number; total_amount: number }
    ): Promise<IpcResponse<void>> => {
      try {
        getDb()
          .prepare(
            `INSERT INTO budget (department_id, fiscal_year, total_amount)
             VALUES (?, ?, ?)
             ON CONFLICT(department_id, fiscal_year) DO UPDATE SET total_amount = excluded.total_amount`
          )
          .run(payload.department_id, payload.fiscal_year, payload.total_amount)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Budget summaries with spend
  ipcMain.handle(
    'budget:summaries',
    async (_e, fiscal_year: number): Promise<IpcResponse<BudgetSummary[]>> => {
      try {
        const db = getDb()

        // Per-department summaries
        const deptRows = db
          .prepare(
            `SELECT
              b.department_id,
              d.name as department_name,
              b.fiscal_year,
              b.total_amount as total_budget,
              COALESCE(
                (SELECT SUM(c.annual_cost)
                 FROM contracts c
                 WHERE c.department_id = b.department_id
                 AND c.status != 'expired'
                 AND strftime('%Y', c.start_date) <= ? AND strftime('%Y', c.end_date) >= ?),
                0
              ) as total_spent
            FROM budget b
            LEFT JOIN departments d ON b.department_id = d.id
            WHERE b.department_id IS NOT NULL AND b.fiscal_year = ?
            ORDER BY d.name`
          )
          .all(String(fiscal_year), String(fiscal_year), fiscal_year) as any[]

        const summaries: BudgetSummary[] = deptRows.map((r) => ({
          department_id: r.department_id,
          department_name: r.department_name,
          fiscal_year: r.fiscal_year,
          total_budget: r.total_budget,
          total_spent: r.total_spent,
          remaining: r.total_budget - r.total_spent
        }))

        // Company-level budget
        const companyBudget = db
          .prepare(
            `SELECT total_amount FROM budget WHERE department_id IS NULL AND fiscal_year = ?`
          )
          .get(fiscal_year) as any

        const totalSpent = db
          .prepare(
            `SELECT COALESCE(SUM(annual_cost),0) as s FROM contracts
             WHERE status != 'expired'
             AND strftime('%Y', start_date) <= ? AND strftime('%Y', end_date) >= ?`
          )
          .get(String(fiscal_year), String(fiscal_year)) as any

        const companyTotal = companyBudget ? companyBudget.total_amount : 0
        summaries.unshift({
          department_id: null,
          department_name: 'Company Overall',
          fiscal_year,
          total_budget: companyTotal,
          total_spent: totalSpent.s,
          remaining: companyTotal - totalSpent.s
        })

        return { success: true, data: summaries }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
