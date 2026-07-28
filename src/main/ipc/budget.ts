import { ipcMain } from 'electron'
import { getDb } from '../database'
import { notifyBudgetUpdated } from '../emailNotifier'
import type {
  IpcResponse,
  Budget,
  BudgetSummary,
  Department,
  Branch,
  ContractAllocation,
  MonthlyBudget,
  MonthlyBudgetSummary
} from '../../shared/types'

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
        notifyBudgetUpdated(getDb(), payload).catch(() => {})
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

        // Fetch allocations active in this fiscal year and build spend maps
        const allocRows = db
          .prepare(
            `SELECT ca.branch_id, ca.department_id, ca.allocation_type, ca.value, c.annual_cost
             FROM contract_allocations ca
             JOIN contracts c ON ca.contract_id = c.id
             WHERE c.status != 'expired'
               AND strftime('%Y', c.start_date) <= ?
               AND strftime('%Y', c.end_date) >= ?`
          )
          .all(String(fiscal_year), String(fiscal_year)) as any[]

        const branchAllocSpend = new Map<number, number>()
        const deptAllocSpend = new Map<number, number>()
        for (const a of allocRows) {
          const amt =
            a.allocation_type === 'percentage'
              ? a.annual_cost * a.value / 100
              : a.value
          if (a.branch_id !== null)
            branchAllocSpend.set(a.branch_id, (branchAllocSpend.get(a.branch_id) ?? 0) + amt)
          if (a.department_id !== null)
            deptAllocSpend.set(a.department_id, (deptAllocSpend.get(a.department_id) ?? 0) + amt)
        }

        // Apply allocated spend to each summary
        for (const s of summaries) {
          if (s.branch_id !== null) {
            const extra = branchAllocSpend.get(s.branch_id) ?? 0
            s.total_spent += extra
            s.remaining = s.total_budget - s.total_spent
          } else if (s.department_id !== null) {
            const extra = deptAllocSpend.get(s.department_id) ?? 0
            s.total_spent += extra
            s.remaining = s.total_budget - s.total_spent
          }
        }

        return { success: true, data: summaries }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ── Allocations ────────────────────────────────────────────────────────────

  ipcMain.handle(
    'allocations:list',
    async (_e, contract_id: number): Promise<IpcResponse<ContractAllocation[]>> => {
      try {
        const db = getDb()
        const rows = db
          .prepare(
            `SELECT ca.*,
               br.name as branch_name, br.number as branch_number,
               d.name as department_name
             FROM contract_allocations ca
             LEFT JOIN branches br ON ca.branch_id = br.id
             LEFT JOIN departments d ON ca.department_id = d.id
             WHERE ca.contract_id = ?
             ORDER BY ca.id`
          )
          .all(contract_id) as ContractAllocation[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ── Monthly Budget ─────────────────────────────────────────────────────────

  ipcMain.handle(
    'monthlyBudget:list',
    async (
      _e,
      opts: { fiscal_year: number; department_id?: number | null; branch_id?: number | null }
    ): Promise<IpcResponse<MonthlyBudget[]>> => {
      try {
        const db = getDb()
        let query = 'SELECT * FROM monthly_budget WHERE fiscal_year = ?'
        const params: (string | number)[] = [opts.fiscal_year]
        if (opts.department_id != null) {
          query += ' AND department_id = ?'
          params.push(opts.department_id)
        } else {
          query += ' AND department_id IS NULL'
        }
        if (opts.branch_id != null) {
          query += ' AND branch_id = ?'
          params.push(opts.branch_id)
        } else {
          query += ' AND branch_id IS NULL'
        }
        query += ' ORDER BY month'
        const rows = db.prepare(query).all(...params) as MonthlyBudget[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // UPDATE-then-INSERT rather than ON CONFLICT: SQLite treats NULLs as distinct
  // in UNIQUE constraints, so ON CONFLICT never fires for company-level rows
  // (NULL department_id + NULL branch_id) and would duplicate them on every save.
  const upsertMonthly = (r: MonthlyBudget): void => {
    const db = getDb()
    const info = db
      .prepare(
        `UPDATE monthly_budget SET amount = ?
         WHERE department_id IS ? AND branch_id IS ? AND fiscal_year = ? AND month = ?`
      )
      .run(r.amount, r.department_id ?? null, r.branch_id ?? null, r.fiscal_year, r.month)
    if (info.changes === 0) {
      db.prepare(
        `INSERT INTO monthly_budget (department_id, branch_id, fiscal_year, month, amount)
         VALUES (?, ?, ?, ?, ?)`
      ).run(r.department_id ?? null, r.branch_id ?? null, r.fiscal_year, r.month, r.amount)
    }
  }

  ipcMain.handle(
    'monthlyBudget:upsert',
    async (_e, payload: MonthlyBudget): Promise<IpcResponse<void>> => {
      try {
        getDb().transaction(() => upsertMonthly(payload))()
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'monthlyBudget:bulkUpsert',
    async (_e, entries: MonthlyBudget[]): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        db.transaction((rows: MonthlyBudget[]) => {
          for (const r of rows) upsertMonthly(r)
        })(entries)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'monthlyBudget:summary',
    async (
      _e,
      opts: { fiscal_year: number; department_id?: number | null; branch_id?: number | null }
    ): Promise<IpcResponse<MonthlyBudgetSummary[]>> => {
      try {
        const db = getDb()

        // Actual committed spend per month: contracts active during each month
        // (same active-contract logic as the dashboard spend trend).
        let contractFilter = ''
        const actualParams: (string | number)[] = [opts.fiscal_year, opts.fiscal_year]
        if (opts.department_id != null) {
          contractFilter += ' AND c.department_id = ?'
          actualParams.push(opts.department_id)
        }
        if (opts.branch_id != null) {
          contractFilter += ' AND c.branch_id = ?'
          actualParams.push(opts.branch_id)
        }
        const actualRows = db
          .prepare(
            `WITH RECURSIVE months(m) AS (
               SELECT 1 UNION ALL SELECT m+1 FROM months WHERE m < 12
             )
             SELECT m.m as month, COALESCE(SUM(c.monthly_cost), 0) as actual
             FROM months m
             LEFT JOIN contracts c ON
               date(c.start_date) <= date(printf('%04d-%02d-15', ?, m.m),
                 'start of month', '+1 month', '-1 day')
               AND date(c.end_date) >= date(printf('%04d-%02d-01', ?, m.m),
                 'start of month')
               AND c.status != 'expired'
               ${contractFilter}
             GROUP BY m.m ORDER BY m.m`
          )
          .all(...actualParams) as { month: number; actual: number }[]

        // Budgeted amounts per month for the same dept/branch scope
        let budgetQuery = 'SELECT month, amount FROM monthly_budget WHERE fiscal_year = ?'
        const budgetParams: (string | number)[] = [opts.fiscal_year]
        if (opts.department_id != null) {
          budgetQuery += ' AND department_id = ?'
          budgetParams.push(opts.department_id)
        } else {
          budgetQuery += ' AND department_id IS NULL'
        }
        if (opts.branch_id != null) {
          budgetQuery += ' AND branch_id = ?'
          budgetParams.push(opts.branch_id)
        } else {
          budgetQuery += ' AND branch_id IS NULL'
        }
        const budgetRows = db.prepare(budgetQuery).all(...budgetParams) as {
          month: number
          amount: number
        }[]
        const budgetByMonth = new Map(budgetRows.map((r) => [r.month, r.amount]))

        const MONTH_LABELS = [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ]
        const summary: MonthlyBudgetSummary[] = actualRows.map((r) => {
          const budgeted = budgetByMonth.get(r.month) ?? 0
          return {
            month: r.month,
            month_label: MONTH_LABELS[r.month - 1],
            budgeted,
            actual: r.actual,
            variance: r.actual - budgeted,
            remaining: budgeted - r.actual
          }
        })
        return { success: true, data: summary }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'allocations:save',
    async (
      _e,
      contract_id: number,
      allocations: Omit<ContractAllocation, 'id' | 'created_at'>[]
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        db.transaction(() => {
          db.prepare('DELETE FROM contract_allocations WHERE contract_id = ?').run(contract_id)
          const ins = db.prepare(
            `INSERT INTO contract_allocations
               (contract_id, branch_id, department_id, allocation_type, value)
             VALUES (?, ?, ?, ?, ?)`
          )
          for (const a of allocations) {
            ins.run(contract_id, a.branch_id ?? null, a.department_id ?? null, a.allocation_type, a.value)
          }
        })()
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
