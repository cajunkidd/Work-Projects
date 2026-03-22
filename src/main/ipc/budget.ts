import { ipcMain } from 'electron'
import { getDb } from '../database'
import type { IpcResponse, Budget, BudgetSummary, Department, Branch } from '../../shared/types'

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

  // Branches CRUD
  ipcMain.handle('branches:list', async (): Promise<IpcResponse<Branch[]>> => {
    try {
      const rows = getDb().prepare('SELECT * FROM branches ORDER BY number').all() as Branch[]
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'branches:create',
    async (_e, payload: { number: number; name: string }): Promise<IpcResponse<Branch>> => {
      try {
        const db = getDb()
        const result = db.prepare('INSERT INTO branches (number, name) VALUES (?, ?)').run(payload.number, payload.name)
        const row = db.prepare('SELECT * FROM branches WHERE id = ?').get(result.lastInsertRowid) as Branch
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'branches:update',
    async (_e, payload: { id: number; number?: number; name?: string }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        if (payload.number !== undefined)
          db.prepare('UPDATE branches SET number = ? WHERE id = ?').run(payload.number, payload.id)
        if (payload.name !== undefined)
          db.prepare('UPDATE branches SET name = ? WHERE id = ?').run(payload.name, payload.id)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('branches:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM branches WHERE id = ?').run(id)
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
          `SELECT b.*, d.name as department_name, br.name as branch_name
           FROM budget b
           LEFT JOIN departments d ON b.department_id = d.id
           LEFT JOIN branches br ON b.branch_id = br.id
           ORDER BY b.fiscal_year DESC, d.name, br.number`
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
      payload: { department_id: number | null; branch_id: number | null; fiscal_year: number; total_amount: number }
    ): Promise<IpcResponse<void>> => {
      try {
        getDb()
          .prepare(
            `INSERT INTO budget (department_id, branch_id, fiscal_year, total_amount)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(department_id, branch_id, fiscal_year) DO UPDATE SET total_amount = excluded.total_amount`
          )
          .run(payload.department_id, payload.branch_id, payload.fiscal_year, payload.total_amount)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Budget summaries with spend
  // Accepts optional filter: { role, department_ids, branch_ids } for scoped access
  ipcMain.handle(
    'budget:summaries',
    async (
      _e,
      fiscal_year: number,
      filter?: { role: string; department_ids: number[]; branch_ids: number[] }
    ): Promise<IpcResponse<BudgetSummary[]>> => {
      try {
        const db = getDb()
        const role = filter?.role ?? 'super_admin'
        const allowedDeptIds = filter?.department_ids ?? []
        const allowedBranchIds = filter?.branch_ids ?? []

        const summaries: BudgetSummary[] = []

        // Company-level budget (super_admin only)
        if (role === 'super_admin') {
          const companyBudget = db
            .prepare(
              `SELECT total_amount FROM budget WHERE department_id IS NULL AND branch_id IS NULL AND fiscal_year = ?`
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
          summaries.push({
            department_id: null,
            department_name: 'Company Overall',
            branch_id: null,
            branch_name: null,
            fiscal_year,
            total_budget: companyTotal,
            total_spent: totalSpent.s,
            remaining: companyTotal - totalSpent.s
          })
        }

        // Per-department summaries (super_admin sees all; director sees own depts)
        if (role === 'super_admin' || role === 'director') {
          const deptRows = db
            .prepare(
              `SELECT
                d.id as department_id,
                d.name as department_name,
                COALESCE(b.total_amount, 0) as total_budget,
                COALESCE(
                  (SELECT SUM(c.annual_cost)
                   FROM contracts c
                   WHERE c.department_id = d.id
                   AND c.status != 'expired'
                   AND strftime('%Y', c.start_date) <= ? AND strftime('%Y', c.end_date) >= ?),
                  0
                ) as total_spent
              FROM departments d
              LEFT JOIN budget b ON b.department_id = d.id AND b.branch_id IS NULL AND b.fiscal_year = ?
              ORDER BY d.name`
            )
            .all(String(fiscal_year), String(fiscal_year), fiscal_year) as any[]

          for (const r of deptRows) {
            if (role === 'director' && allowedDeptIds.length > 0 && !allowedDeptIds.includes(r.department_id)) continue
            summaries.push({
              department_id: r.department_id,
              department_name: r.department_name,
              branch_id: null,
              branch_name: null,
              fiscal_year,
              total_budget: r.total_budget,
              total_spent: r.total_spent,
              remaining: r.total_budget - r.total_spent
            })
          }
        }

        // Per-branch summaries (all roles, filtered by allowed branches)
        const branchRows = db
          .prepare(
            `SELECT
              br.id as branch_id,
              br.number as branch_number,
              br.name as branch_name,
              COALESCE(b.total_amount, 0) as total_budget,
              COALESCE(
                (SELECT SUM(c.annual_cost)
                 FROM contracts c
                 WHERE c.branch_id = br.id
                 AND c.status != 'expired'
                 AND strftime('%Y', c.start_date) <= ? AND strftime('%Y', c.end_date) >= ?),
                0
              ) as total_spent
            FROM branches br
            LEFT JOIN budget b ON b.branch_id = br.id AND b.fiscal_year = ?
            ORDER BY br.number`
          )
          .all(String(fiscal_year), String(fiscal_year), fiscal_year) as any[]

        for (const r of branchRows) {
          if (role !== 'super_admin' && allowedBranchIds.length > 0 && !allowedBranchIds.includes(r.branch_id)) continue
          if (role !== 'super_admin' && allowedBranchIds.length === 0) continue
          summaries.push({
            department_id: null,
            department_name: null,
            branch_id: r.branch_id,
            branch_name: r.branch_name,
            branch_number: r.branch_number,
            fiscal_year,
            total_budget: r.total_budget,
            total_spent: r.total_spent,
            remaining: r.total_budget - r.total_spent
          })
        }

        return { success: true, data: summaries }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
